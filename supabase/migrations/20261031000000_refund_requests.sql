create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 2000),
  phone text not null default '' check (char_length(phone) <= 40),
  status text not null default 'open' check (status in ('open', 'contacted', 'accepted', 'declined', 'resolved')),
  admin_response text not null default '' check (char_length(admin_response) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refund_requests_order_id_idx on public.refund_requests(order_id);
create unique index if not exists refund_requests_one_open_per_order
  on public.refund_requests(order_id) where status not in ('declined', 'resolved');
alter table public.refund_requests enable row level security;
revoke all on public.refund_requests from anon, authenticated;
grant select, insert, update on public.refund_requests to service_role;
