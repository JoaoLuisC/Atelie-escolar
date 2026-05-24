-- ════════════════════════════════════════════════════════════════════
-- security-hardening.sql
-- Corrige todas as issues CRITICAL do Security Advisor.
-- Ajustado ao schema REAL do banco (profiles.id é uuid e bate com
-- auth.uid(); user_products tem user_id, não email; etc).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Habilitar Row Level Security em todas as tabelas públicas ─
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.download_tokens  enable row level security;
alter table public.download_logs    enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_products    enable row level security;
alter table public.settings         enable row level security;
alter table public.page_views       enable row level security;


-- ─── 2. Catálogo público: ler categorias e produtos ativos ────────
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read
  on public.categories for select
  to anon, authenticated
  using (active = true);

drop policy if exists products_public_read on public.products;
create policy products_public_read
  on public.products for select
  to anon, authenticated
  using (active = true);


-- ─── 3. Profile: id é uuid e bate com auth.uid() ──────────────────
drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ─── 4. Pedidos do próprio cliente ────────────────────────────────
-- Match por customer_id (uuid, bate com auth.uid()) OU customer_email
-- (caso pedido tenha sido feito por convidado e depois logado).
drop policy if exists orders_own_read on public.orders;
create policy orders_own_read
  on public.orders for select
  to authenticated
  using (
    customer_id = auth.uid()
    or customer_email = (auth.jwt() ->> 'email')
  );

drop policy if exists order_items_via_orders on public.order_items;
create policy order_items_via_orders
  on public.order_items for select
  to authenticated
  using (
    order_id in (
      select id from public.orders
      where customer_id = auth.uid()
         or customer_email = (auth.jwt() ->> 'email')
    )
  );


-- ─── 5. Produtos comprados pelo próprio usuário ───────────────────
-- user_products.user_id é uuid, bate com auth.uid()
drop policy if exists user_products_own_read on public.user_products;
create policy user_products_own_read
  on public.user_products for select
  to authenticated
  using (user_id = auth.uid());


-- ─── 6. Tracking anônimo: page_views aceita INSERT de qualquer um ─
drop policy if exists page_views_public_insert on public.page_views;
create policy page_views_public_insert
  on public.page_views for insert
  to anon, authenticated
  with check (true);


-- ─── 7. settings, download_tokens, download_logs ───────────────────
-- DELIBERADAMENTE sem policies. Service role (backend) bypassa RLS.
-- Anon e usuários autenticados perdem acesso — resolve "Sensitive
-- Columns Exposed" e protege adminConfig (TOTP/PIN) em settings.


-- ─── 8. Corrigir search_path MUTÁVEL nas funções ──────────────────
alter function public.set_updated_at()  set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;


-- ─── 9. Bloquear execução pública de handle_new_user ──────────────
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 10. Verificação final
-- ════════════════════════════════════════════════════════════════════
select
  c.relname                                                          as tabela,
  case when c.relrowsecurity then 'ATIVO' else 'INATIVO' end         as rls,
  coalesce((
    select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  ), 0)                                                              as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
