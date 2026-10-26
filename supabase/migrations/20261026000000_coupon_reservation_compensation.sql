-- Compensação imediata da reserva de cupom quando o checkout falha antes de
-- criar uma preferência no Mercado Pago. O cron de 2h continua como rede de
-- segurança para preferências abandonadas; esta migration cobre a janela sem
-- pedido/preferência, que o cron não consegue distinguir nem recuperar cedo.

create or replace function public.decrement_coupon_usage(p_coupon_id bigint)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.coupons
     set used_count = greatest(coalesce(used_count, 0) - 1, 0)
   where id = p_coupon_id
  returning used_count;
$$;

revoke execute on function public.decrement_coupon_usage(bigint) from public, anon, authenticated;
grant execute on function public.decrement_coupon_usage(bigint) to service_role;

create or replace function public.release_coupon_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released_coupon_code text;
begin
  update public.orders
     set coupon_released_at = now()
   where id = p_order_id
     and coupon_code is not null
     and coupon_released_at is null
     and payment_status in ('pending', 'rejected', 'cancelled')
   returning coupon_code into released_coupon_code;

  if released_coupon_code is null then
    return false;
  end if;

  update public.coupons
     set used_count = greatest(coalesce(used_count, 0) - 1, 0)
   where code = released_coupon_code;

  return true;
end;
$$;

revoke execute on function public.release_coupon_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_coupon_reservation(uuid) to service_role;
