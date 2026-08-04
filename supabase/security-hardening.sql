-- ════════════════════════════════════════════════════════════════════
-- security-hardening.sql
-- Corrige todas as issues CRITICAL do Security Advisor.
-- Ajustado ao schema REAL do banco (profiles.id é uuid e bate com
-- auth.uid(); user_products tem user_id, não email; etc).
--
-- ⚠ Este baseline de RLS agora também é versionado como migration
--   supabase/migrations/20260702000000_phase6_db_rls_hardening.sql
--   (review Área 3, RLS-03). Mantenha os dois em sincronia; a migration
--   é a fonte de verdade para deploy/DR.
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

-- RLS-01: RLS não filtra COLUNAS. Sem a trava abaixo, o dono do perfil
-- poderia gravar profiles.role='ADMIN' (escalonamento). O trigger (invoker)
-- preserva id/email/role/provider para qualquer papel que não seja backend.
create or replace function public.profiles_guard_privileged_cols()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.id       := old.id;
    new.email    := old.email;
    new.role     := old.role;
    new.provider := old.provider;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_cols on public.profiles;
create trigger profiles_guard_privileged_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_cols();


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


-- ─── 6. page_views: SEM escrita pública (RLS-04) ──────────────────
-- Antes havia policy anon INSERT `with check(true)`, que permitia forjar
-- IP/UA/path (envenenamento de log). Nenhum código grava page_views pelo
-- client; a escrita deve ser feita pelo backend (service-role, IP do
-- servidor). Sem policy = service-role only.
drop policy if exists page_views_public_insert on public.page_views;


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
