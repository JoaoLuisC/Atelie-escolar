-- ════════════════════════════════════════════════════════════════════
-- Phase 5 — Hardening de pagamentos (review Área 1)
--
-- 1. download_tokens: UNIQUE(order_id, product_id) para tornar a criação de
--    tokens IDEMPOTENTE. Webhooks reentregues pelo Mercado Pago e o polling
--    concorrente do verify-payment não geram mais tokens duplicados (cada par
--    order/produto tem no máximo 1 token). Os handlers tratam a violação
--    (HTTP 409 / SQLSTATE 23505) como sucesso e recarregam o token vencedor.
--
-- 2. increment_coupon_usage(bigint): incremento ATÔMICO de coupons.used_count
--    respeitando max_uses no próprio UPDATE, eliminando a corrida
--    read-modify-write que permitia furar o limite de uso do cupom.
--
-- Idempotente (pode rodar mais de uma vez).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. download_tokens: dedupe + UNIQUE(order_id, product_id) ───────
-- Remove duplicatas pré-existentes antes de criar o índice único, mantendo,
-- por par (order_id, product_id): (a) o token já usado, se houver; senão
-- (b) o mais antigo; desempate final pelo token lexicograficamente menor.
delete from public.download_tokens t
using public.download_tokens d
where t.order_id = d.order_id
  and t.product_id = d.product_id
  and t.token <> d.token
  and (
    (d.used and not t.used)
    or (d.used = t.used and d.created_at < t.created_at)
    or (d.used = t.used and d.created_at = t.created_at and d.token < t.token)
  );

create unique index if not exists download_tokens_order_product_uidx
  on public.download_tokens (order_id, product_id);


-- ─── 2. increment_coupon_usage: incremento atômico respeitando max_uses ──
create or replace function public.increment_coupon_usage(p_coupon_id bigint)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.coupons
     set used_count = coalesce(used_count, 0) + 1
   where id = p_coupon_id
     and (max_uses is null or coalesce(used_count, 0) < max_uses)
  returning used_count;
$$;

comment on function public.increment_coupon_usage(bigint) is
  'Incrementa coupons.used_count de forma atômica, respeitando max_uses. Retorna o novo used_count, ou NULL se o cupom estava esgotado/inexistente.';

-- Só o backend (service_role) pode chamar; anon/authenticated não.
revoke execute on function public.increment_coupon_usage(bigint) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(bigint) to service_role;
