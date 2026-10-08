-- ════════════════════════════════════════════════════════════════════
-- Devolução do uso de cupom reservado por checkout que não virou pagamento.
--
-- O QUE MOTIVOU (ACH-03 da validação de 05/10/2026)
-- `handlers/create-payment.js` RESERVA o uso do cupom (increment_coupon_usage)
-- antes de criar a preferência do Mercado Pago — é isso que torna `max_uses`
-- atômico sob concorrência, e a decisão continua certa. O que faltava era a
-- volta: nada devolvia o uso quando o pedido morria sem pagamento. Na
-- validação, um cupom de limite 1 ficou esgotado só por abrir o pagamento e
-- fechar o MP; cada "Cancelar e tentar de novo" gastava mais um uso.
--
-- COMO FUNCIONA
-- 1. `orders.coupon_released_at` marca o pedido cujo uso já foi devolvido —
--    é a guarda de idempotência: devolver duas vezes daria uso de graça.
-- 2. `release_stale_coupon_reservations()` devolve, em um único statement, o
--    uso dos pedidos não aprovados com cupom e mais de 2 horas de idade.
--    Agendada a cada 15 minutos no pg_cron.
-- 3. O trigger `orders_reclaim_coupon_on_approval` cobre o pagamento que chega
--    DEPOIS da devolução (Pix pago tarde, segunda tentativa de cartão na mesma
--    preferência): ao virar `approved`, o uso volta a ser contado e a marca é
--    limpa. Fica no banco, e não nos handlers, pelo mesmo motivo do ADR 0003:
--    há duas portas que aprovam pedido (webhook e verify-payment), e uma regra
--    que depende de as duas lembrarem dela vale o que vale a mais esquecida.
--    Esse re-incremento NÃO respeita max_uses, de propósito: o pagamento com
--    desconto já foi capturado; o que se perde, no pior caso, é passar do
--    limite em 1 uso — o mesmo tamanho do erro que esta migration corrige,
--    só que do lado raro.
--
-- ⚠️ AS 2 HORAS SÃO DECISÃO DE NEGÓCIO. Mais curto devolve antes o cupom de
-- quem desistiu; mais longo reduz a chance de o limite ser ultrapassado por
-- um pagamento tardio. Mude o `interval` abaixo se a regra mudar.
--
-- Na primeira execução, os pedidos não aprovados ANTIGOS com cupom também têm
-- o uso devolvido — é o que destrava os cupons esgotados por checkouts
-- abandonados antes desta migration.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Marca de devolução ───────────────────────────────────────
alter table public.orders
  add column if not exists coupon_released_at timestamptz;

comment on column public.orders.coupon_released_at is
  'Quando o uso do cupom reservado por este pedido foi devolvido (pedido não pago). NULL = uso ainda contado.';


-- ─── 2. Devolução dos usos parados ───────────────────────────────
-- SECURITY DEFINER + search_path fixo: mesmas regras das outras funções do
-- projeto. Um pedido pode ter só um cupom, mas vários pedidos podem ter o
-- MESMO cupom — por isso a contagem agrupada antes do UPDATE em `coupons`.
create or replace function public.release_stale_coupon_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released_count integer := 0;
begin
  with released as (
    update public.orders
       set coupon_released_at = now()
     where coupon_code is not null
       and coupon_released_at is null
       and payment_status in ('pending', 'rejected', 'cancelled')
       and created_at < now() - interval '2 hours'
    returning coupon_code
  ),
  per_coupon as (
    select coupon_code, count(*)::integer as n
      from released
     group by coupon_code
  ),
  updated as (
    update public.coupons c
       set used_count = greatest(coalesce(c.used_count, 0) - p.n, 0)
      from per_coupon p
     where c.code = p.coupon_code
    returning 1
  )
  select coalesce(sum(n), 0) into released_count from per_coupon;

  return released_count;
end;
$$;

comment on function public.release_stale_coupon_reservations() is
  'Devolve o uso de cupom de pedidos não aprovados com mais de 2h. Idempotente via orders.coupon_released_at. Agendada no pg_cron.';

revoke execute on function public.release_stale_coupon_reservations() from public, anon, authenticated;
grant execute on function public.release_stale_coupon_reservations() to service_role;


-- ─── 3. Pagamento tardio volta a contar o uso ────────────────────
create or replace function public.reclaim_coupon_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_status = 'approved'
     and old.payment_status is distinct from 'approved'
     and old.coupon_released_at is not null
     and new.coupon_code is not null then
    update public.coupons
       set used_count = coalesce(used_count, 0) + 1
     where code = new.coupon_code;
    new.coupon_released_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.reclaim_coupon_on_approval() from public, anon, authenticated;

drop trigger if exists orders_reclaim_coupon_on_approval on public.orders;
create trigger orders_reclaim_coupon_on_approval
  before update of payment_status on public.orders
  for each row
  execute function public.reclaim_coupon_on_approval();


-- ─── 4. Agendamento via pg_cron ──────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'release-stale-coupon-reservations';

    perform cron.schedule(
      'release-stale-coupon-reservations',
      '*/15 * * * *',
      $cmd$select public.release_stale_coupon_reservations()$cmd$
    );

    raise notice 'pg_cron: release-stale-coupon-reservations agendado.';
  else
    raise notice 'pg_cron indisponível; agende a chamada de release_stale_coupon_reservations() por fora.';
  end if;
exception when others then
  raise notice 'pg_cron schedule falhou (%); agende por fora.', sqlerrm;
end$$;
