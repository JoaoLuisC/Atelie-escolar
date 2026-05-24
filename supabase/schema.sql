-- ════════════════════════════════════════════════════════════════════
-- Supabase schema — Ateliê da Escola (estado canônico em prod)
--
-- Atualizado em 2026-05-24, refletindo o banco real (project ref
-- npgtngcdskwcsmgymkql). Para setup zero: rodar este arquivo + todas
-- as migrations em supabase/migrations/ na ordem cronológica.
--
-- ⚠ NÃO editar manualmente sem refletir uma mudança real do banco.
-- Para regenerar: ver scripts/dump-schema.js (requer pg_dump ou pg
-- client com acesso ao pooler).
--
-- Tabelas: 14
--   • Núcleo (catálogo + pedido + auth): categories, products,
--     orders, order_items, profiles, user_products
--   • Entrega digital: download_tokens, download_logs
--   • LGPD + funil: analytics_events, security_events, page_views
--   • UX/conversão: coupons, abandoned_carts
--   • Config: settings
-- ════════════════════════════════════════════════════════════════════

-- ─── Extensões obrigatórias ──────────────────────────────────────
-- pgcrypto: gen_random_uuid()
-- unaccent: slugify (migration phase1)
-- pg_cron:  agendamento de purge_old_logs (migration phase2)
create extension if not exists pgcrypto;
create extension if not exists unaccent;
-- create extension if not exists pg_cron with schema extensions;  -- via SQL Editor


-- ════════════════════════════════════════════════════════════════════
-- 1. Núcleo (catálogo + pedido + auth)
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null default '#9B5DE5',
  active boolean not null default true,
  featured boolean not null default false,
  badge_label text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text unique,                                    -- migration phase1
  description text not null default '',
  price numeric(12,2) not null default 0,
  original_price numeric(12,2),
  image_url text not null default '',
  images jsonb not null default '[]'::jsonb,
  download_url text not null default '',
  tags jsonb not null default '[]'::jsonb,
  product_type text not null default 'individual',
  page_size text not null default '',
  paper_type text not null default '',
  kit_items jsonb not null default '[]'::jsonb,
  panel_sizes jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  is_kit boolean not null default false,
  active boolean not null default true,
  featured boolean not null default false,
  faq jsonb not null default '[]'::jsonb,              -- migration phase2_conversion
  reviews jsonb not null default '[]'::jsonb,          -- migration phase2_conversion
  benefits jsonb not null default '[]'::jsonb,         -- migration phase2_conversion
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null,
  customer_cpf text,
  customer_phone text,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  payment_status text not null default 'pending',
  payment_provider text not null default 'mercadopago',
  payment_id text,
  preference_id text,
  mercadopago_preference_id text,
  mercadopago_payment_id text,
  mercadopago_data jsonb,
  download_tokens jsonb,
  metadata jsonb,
  attribution_data jsonb not null default '{}'::jsonb,  -- migration phase0
  coupon_code text,                                     -- migration phase2_conversion
  discount_amount numeric(12,2) not null default 0,     -- migration phase2_conversion
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price numeric(12,2) not null default 0,
  quantity integer not null default 1,
  total_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Vinculado 1:1 com auth.users; criado pelo trigger handle_new_user.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'CUSTOMER',                -- CUSTOMER | ADMIN | MASTER
  provider text not null default 'email',               -- email | google | etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 linha por (user, produto comprado). Substitui o user_products legado
-- que era 1 linha por user com array de produtos — divergência conhecida.
create table if not exists public.user_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  purchased_at timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════
-- 2. Entrega digital
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.download_tokens (
  token text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null default '',
  used boolean not null default false,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.download_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  token text not null default '',
  ip_address text not null default '',
  user_agent text not null default '',
  downloaded_at timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════
-- 3. LGPD + funil
-- ════════════════════════════════════════════════════════════════════

-- Eventos canônicos do funil. RLS permite anon INSERT só pra eventos
-- na whitelist + sem PII. Ver migration phase0_analytics.
create table if not exists public.analytics_events (
  id bigint generated by default as identity primary key,
  event_name text not null,
  session_id text not null default '',
  customer_email text,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

-- Coletor de eventos de segurança (HMAC inválido, login admin falho,
-- tentativa de enumeração). RLS sem policies = service-role only.
-- Retenção 6 meses via purge_old_logs(). Ver migration phase2_security_events.
create table if not exists public.security_events (
  id bigint generated by default as identity primary key,
  event_name text not null,
  severity text not null default 'warn',
  ip text,
  user_agent text,
  request_id text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  ip_address text not null default '',
  user_agent text not null default '',
  referrer text not null default '',
  viewed_at timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════
-- 4. UX / conversão (migration phase2_conversion)
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.coupons (
  id bigint generated by default as identity primary key,
  code text not null unique,
  discount_type text not null,                          -- 'percent' | 'fixed'
  discount_value numeric(12,2) not null,
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  applies_to jsonb not null default '[]'::jsonb,        -- IDs de categorias/produtos
  min_order_amount numeric(12,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abandoned_carts (
  id bigint generated by default as identity primary key,
  email text,
  session_id text,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric(12,2) not null default 0,
  attribution_data jsonb not null default '{}'::jsonb,
  reminder_sent_at timestamptz,
  recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════
-- 5. Config
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.settings (
  setting_key text primary key,
  setting_value jsonb,
  updated_at timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════
-- 6. Índices (todos com `if not exists`)
-- ════════════════════════════════════════════════════════════════════

create index if not exists products_active_created_at_idx
  on public.products (active, created_at desc);
create index if not exists products_category_idx
  on public.products (category_id);
create index if not exists products_slug_idx
  on public.products (slug);

create index if not exists orders_customer_email_idx
  on public.orders (customer_email);
create index if not exists orders_payment_status_idx
  on public.orders (payment_status);
create index if not exists orders_attribution_source_idx
  on public.orders ((attribution_data->>'utm_source'));

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists download_tokens_order_id_idx
  on public.download_tokens (order_id);
create index if not exists download_logs_product_id_idx
  on public.download_logs (product_id);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id, created_at desc);
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists security_events_event_created_idx
  on public.security_events (event_name, created_at desc);
create index if not exists security_events_ip_idx
  on public.security_events (ip, created_at desc)
  where ip is not null;
create index if not exists security_events_created_at_idx
  on public.security_events (created_at desc);

create index if not exists page_views_viewed_at_idx
  on public.page_views (viewed_at desc);


-- ════════════════════════════════════════════════════════════════════
-- 7. Triggers de updated_at + trigger de slug
--    Funções e policies RLS ficam em supabase/security-hardening.sql
--    e nas migrations (phase0, phase1, phase2_*).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

drop trigger if exists abandoned_carts_set_updated_at on public.abandoned_carts;
create trigger abandoned_carts_set_updated_at
  before update on public.abandoned_carts
  for each row execute function public.set_updated_at();
