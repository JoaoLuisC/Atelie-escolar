-- Público-alvo e limite individual de cupons.
alter table public.coupons
  add column if not exists audience text not null default 'all'
    check (audience in ('all', 'customers', 'new_customers', 'returning_customers', 'emails', 'purchase_milestone')),
  add column if not exists eligible_emails text[] not null default '{}',
  add column if not exists purchases_required integer
    check (purchases_required is null or purchases_required > 0),
  add column if not exists max_uses_per_customer integer
    check (max_uses_per_customer is null or max_uses_per_customer > 0);

alter table public.orders
  add column if not exists coupon_customer_key text;

create table if not exists public.coupon_customer_usage (
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  customer_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (coupon_id, customer_key)
);

alter table public.coupon_customer_usage enable row level security;
revoke all on public.coupon_customer_usage from public, anon, authenticated;
grant all on public.coupon_customer_usage to service_role;

-- Reserva os limites global e individual na mesma transação.
-- A versão antiga, de um argumento, sai: com as duas no banco, toda chamada só
-- com `p_coupon_id` falha com "function is not unique". Sem ela, a chamada de
-- um argumento cai nesta (o segundo tem default).
drop function if exists public.increment_coupon_usage(bigint);
create or replace function public.increment_coupon_usage(
  p_coupon_id bigint,
  p_customer_key text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  coupon_row public.coupons%rowtype;
  individual_count integer;
  earned_count integer;
  customer_uuid uuid;
begin
  select * into coupon_row from public.coupons where id = p_coupon_id for update;
  if not found or (coupon_row.max_uses is not null and coupon_row.used_count >= coupon_row.max_uses) then
    return null;
  end if;

  if coupon_row.max_uses_per_customer is not null or coupon_row.audience = 'purchase_milestone' then
    if nullif(trim(p_customer_key), '') is null then return null; end if;
    insert into public.coupon_customer_usage(coupon_id, customer_key, used_count)
      values (p_coupon_id, p_customer_key, 0)
      on conflict (coupon_id, customer_key) do nothing;
    select used_count into individual_count
      from public.coupon_customer_usage
      where coupon_id = p_coupon_id and customer_key = p_customer_key
      for update;
    if coupon_row.max_uses_per_customer is not null
       and individual_count >= coupon_row.max_uses_per_customer then return null; end if;

    if coupon_row.audience = 'purchase_milestone' then
      if p_customer_key !~ '^user:[0-9a-fA-F-]{36}$' then return null; end if;
      customer_uuid := substring(p_customer_key from 6)::uuid;
      select floor(count(*)::numeric / greatest(coupon_row.purchases_required, 1))::integer
        into earned_count
        from public.orders
       where customer_id = customer_uuid and payment_status = 'approved';
      if individual_count >= earned_count then return null; end if;
    end if;
    update public.coupon_customer_usage
      set used_count = used_count + 1, updated_at = now()
      where coupon_id = p_coupon_id and customer_key = p_customer_key;
  end if;

  update public.coupons set used_count = used_count + 1 where id = p_coupon_id
    returning used_count into individual_count;
  return individual_count;
end;
$$;

drop function if exists public.decrement_coupon_usage(bigint);
create or replace function public.decrement_coupon_usage(
  p_coupon_id bigint,
  p_customer_key text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_count integer;
begin
  update public.coupons set used_count = greatest(used_count - 1, 0)
    where id = p_coupon_id returning used_count into new_count;
  if nullif(trim(p_customer_key), '') is not null then
    update public.coupon_customer_usage
      set used_count = greatest(used_count - 1, 0), updated_at = now()
      where coupon_id = p_coupon_id and customer_key = p_customer_key;
  end if;
  return new_count;
end;
$$;

revoke execute on function public.increment_coupon_usage(bigint, text) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(bigint, text) to service_role;
revoke execute on function public.decrement_coupon_usage(bigint, text) from public, anon, authenticated;
grant execute on function public.decrement_coupon_usage(bigint, text) to service_role;

-- Atualiza a compensação de um pedido para também devolver o uso individual.
create or replace function public.release_coupon_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released_coupon_id bigint;
  released_customer_key text;
begin
  update public.orders o
     set coupon_released_at = now()
    from public.coupons c
   where o.id = p_order_id and c.code = o.coupon_code
     and o.coupon_released_at is null
     and o.payment_status in ('pending', 'rejected', 'cancelled')
  returning c.id, o.coupon_customer_key into released_coupon_id, released_customer_key;
  if released_coupon_id is null then return false; end if;
  perform public.decrement_coupon_usage(released_coupon_id, released_customer_key);
  return true;
end;
$$;

revoke execute on function public.release_coupon_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_coupon_reservation(uuid) to service_role;

create or replace function public.release_stale_coupon_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released record;
  released_count integer := 0;
begin
  for released in
    update public.orders o
       set coupon_released_at = now()
     where o.coupon_code is not null
       and o.coupon_released_at is null
       and o.payment_status in ('pending', 'rejected', 'cancelled')
       and o.created_at < now() - interval '2 hours'
    returning o.coupon_code, o.coupon_customer_key
  loop
    perform public.decrement_coupon_usage(
      (select id from public.coupons where code = released.coupon_code),
      released.coupon_customer_key
    );
    released_count := released_count + 1;
  end loop;
  return released_count;
end;
$$;

revoke execute on function public.release_stale_coupon_reservations() from public, anon, authenticated;
grant execute on function public.release_stale_coupon_reservations() to service_role;

create or replace function public.reclaim_coupon_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare coupon_row public.coupons%rowtype;
begin
  if new.payment_status = 'approved'
     and old.payment_status is distinct from 'approved'
     and old.coupon_released_at is not null
     and new.coupon_code is not null then
    select * into coupon_row from public.coupons where code = new.coupon_code for update;
    if found then
      update public.coupons set used_count = used_count + 1 where id = coupon_row.id;
      -- A meta de compras também conta por cliente: sem recontar aqui, uma
      -- recompensa devolvida pelo cron e paga depois voltava ao saldo.
      if (coupon_row.max_uses_per_customer is not null or coupon_row.audience = 'purchase_milestone')
         and new.coupon_customer_key is not null then
        insert into public.coupon_customer_usage(coupon_id, customer_key, used_count)
          values (coupon_row.id, new.coupon_customer_key, 1)
          on conflict (coupon_id, customer_key) do update
            set used_count = public.coupon_customer_usage.used_count + 1, updated_at = now();
      end if;
    end if;
    new.coupon_released_at := null;
  end if;
  return new;
end;
$$;
