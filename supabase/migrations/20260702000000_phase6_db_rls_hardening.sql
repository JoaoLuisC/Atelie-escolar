-- ════════════════════════════════════════════════════════════════════
-- Phase 6 — DB & RLS hardening (review Área 3 — Banco de Dados & RLS)
--
-- Corrige, de forma idempotente e forward-only (serve tanto para bancos
-- já existentes quanto para bootstrap novo):
--   RLS-01  Escalonamento de privilégio: cliente gravava o próprio
--           profiles.role → vira ADMIN. Trigger trava colunas privilegiadas.
--   RLS-02  abandoned_carts: policies anon INSERT/UPDATE `true` (adulteração
--           cross-user / relay de e-mail). Removidas → service-role only.
--   RLS-03  RLS das tabelas núcleo morava só em security-hardening.sql (fora
--           da sequência de migrations). Aqui o baseline de RLS + policies
--           essenciais passa a ser versionado.
--   RLS-04  page_views: INSERT anônimo `true` (envenenamento de log) +
--           sem retenção. Policy removida; retenção adicionada.
--   RLS-05  handle_new_user() era referenciada/alterada mas nunca DEFINIDA
--           no SQL versionado (e sem trigger em auth.users). Versionada.
--   RLS-06  Retenção incompleta: page_views / admin_audit_log / email_*.
--   RLS-07  FKs sem índice (order_items.product_id, download_logs.order_id,
--           analytics_events.{order_id,product_id}, user_products.*).
--   RLS-09  Retenção de analytics_events duplicada/conflitante (24m x 180d).
--           purge_old_logs deixa de tocar analytics; 180d (D7) fica como
--           única política, via cleanup_old_analytics_events.
--
-- NÃO cobre (ver docs/REVIEW-RESULTS.md, Área 3):
--   RLS-08  Anonimização de PII órfã em orders (camada de app / Área 6).
--   RLS-11  Validação de analytics_events.properties (camada de app).
-- ════════════════════════════════════════════════════════════════════


-- ─── 0. RLS-03 — Garante RLS habilitado em TODAS as tabelas públicas ──
-- `enable row level security` é idempotente (no-op se já ligado). Assim,
-- um ambiente que rode só as migrations (sem security-hardening.sql) não
-- fica com tabela sensível exposta ao grant default de `anon`.
alter table if exists public.categories        enable row level security;
alter table if exists public.products           enable row level security;
alter table if exists public.orders             enable row level security;
alter table if exists public.order_items        enable row level security;
alter table if exists public.profiles           enable row level security;
alter table if exists public.user_products      enable row level security;
alter table if exists public.download_tokens    enable row level security;
alter table if exists public.download_logs      enable row level security;
alter table if exists public.analytics_events   enable row level security;
alter table if exists public.security_events    enable row level security;
alter table if exists public.page_views         enable row level security;
alter table if exists public.coupons            enable row level security;
alter table if exists public.abandoned_carts    enable row level security;
alter table if exists public.settings           enable row level security;
alter table if exists public.email_subscribers  enable row level security;
alter table if exists public.email_sent_log     enable row level security;
alter table if exists public.admin_audit_log    enable row level security;


-- ─── 1. RLS-03 — Policies essenciais versionadas (espelha, corrigido, o
--       security-hardening.sql). Catálogo público + acesso do próprio dono.
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

drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- A policy de UPDATE do próprio perfil continua existindo, MAS as colunas
-- privilegiadas ficam travadas pelo trigger da seção 2 (RLS-01). RLS não
-- filtra colunas — por isso a trava é feita via trigger.
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

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

drop policy if exists user_products_own_read on public.user_products;
create policy user_products_own_read
  on public.user_products for select
  to authenticated
  using (user_id = auth.uid());


-- ─── 2. RLS-01 — Impede escalonamento de privilégio via profiles ─────
-- Um cliente autenticado podia `PATCH /profiles?id=eq.<uid>` com
-- {"role":"ADMIN"} porque a policy só checa id=auth.uid() e RLS não
-- restringe colunas. profiles.role é fonte de autorização
-- (middleware/auth.middleware.js checkRole + api/admin-login.js).
--
-- Trigger (invoker, NÃO security definer → current_user é o papel real
-- da requisição): qualquer papel que não seja backend/DBA tem
-- id/email/role/provider preservados; só display_name (e updated_at) mudam.
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

-- NB: o trigger é a ENFORCEMENT (independe de grants). Um `revoke update(role)`
-- de coluna NÃO é confiável quando o papel tem UPDATE em nível de tabela
-- (privilégios de coluna e de tabela são aditivos no Postgres). Hardening
-- extra opcional, se confirmado que o cliente só edita display_name:
--   revoke update on public.profiles from authenticated;
--   grant  update (display_name) on public.profiles to authenticated;


-- ─── 3. RLS-02 — abandoned_carts: remover escrita pública ────────────
-- O backend grava via service-role (api/abandoned-cart.js, cron-email-jobs.js);
-- nenhuma escrita direta do front. Sem policy = service-role only.
drop policy if exists abandoned_carts_public_insert on public.abandoned_carts;
drop policy if exists abandoned_carts_public_update on public.abandoned_carts;


-- ─── 4. RLS-04 — page_views: remover INSERT anônimo ──────────────────
-- Nenhum código grava page_views hoje; a policy só era superfície de
-- ataque (envenenamento de log com IP/UA forjados). Se voltar a ser usada,
-- gravar pelo backend com IP do servidor.
drop policy if exists page_views_public_insert on public.page_views;


-- ─── 5. RLS-05 — handle_new_user() + trigger versionados ─────────────
-- Comportamento documentado (docs/ProjectDocs/04-BANCO-DE-DADOS.md §Triggers):
-- AFTER INSERT em auth.users → cria profiles com role='CUSTOMER'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, role, provider)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    'CUSTOMER',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Hardening (idempotente): search_path fixo já no corpo; sem execução pública.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Cria o trigger em auth.users SOMENTE se ainda não houver um trigger que
-- chame handle_new_user (evita duplicar o que já existe em prod, criado
-- manualmente). Em banco novo, cria; em prod, é no-op.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%handle_new_user%'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
exception when insufficient_privilege then
  raise notice 'Sem privilégio para criar trigger em auth.users; crie manualmente on_auth_user_created.';
end;
$$;


-- ─── 6. RLS-07 — Índices para FKs sem índice ─────────────────────────
create index if not exists order_items_product_id_idx
  on public.order_items (product_id);
create index if not exists download_logs_order_id_idx
  on public.download_logs (order_id);
create index if not exists analytics_events_order_id_idx
  on public.analytics_events (order_id);
create index if not exists analytics_events_product_id_idx
  on public.analytics_events (product_id);
create index if not exists user_products_user_id_idx
  on public.user_products (user_id);
create index if not exists user_products_product_id_idx
  on public.user_products (product_id);
create index if not exists user_products_order_id_idx
  on public.user_products (order_id);


-- ─── 7. RLS-06 + RLS-09 — Retenção consolidada ───────────────────────
-- Redefine purge_old_logs(): download_logs(12m) + security_events(6m)
-- + page_views(6m) + admin_audit_log(18m). REMOVE a limpeza de
-- analytics_events daqui — passa a ser feita SÓ por
-- cleanup_old_analytics_events (180 dias / regra D7), eliminando o
-- conflito de janelas (RLS-09).
drop function if exists public.purge_old_logs();

create function public.purge_old_logs()
returns table (
  download_logs_deleted   bigint,
  security_events_deleted bigint,
  page_views_deleted      bigint,
  admin_audit_deleted     bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_download bigint := 0;
  v_security bigint := 0;
  v_pageviews bigint := 0;
  v_audit bigint := 0;
begin
  with d as (
    delete from public.download_logs
    where downloaded_at < (now() - interval '12 months')
    returning 1
  ) select count(*) into v_download from d;

  with d as (
    delete from public.security_events
    where created_at < (now() - interval '6 months')
    returning 1
  ) select count(*) into v_security from d;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'page_views'
  ) then
    with d as (
      delete from public.page_views
      where viewed_at < (now() - interval '6 months')
      returning 1
    ) select count(*) into v_pageviews from d;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_audit_log'
  ) then
    with d as (
      delete from public.admin_audit_log
      where created_at < (now() - interval '18 months')
      returning 1
    ) select count(*) into v_audit from d;
  end if;

  return query select v_download, v_security, v_pageviews, v_audit;
end;
$$;

revoke execute on function public.purge_old_logs() from public, anon, authenticated;
comment on function public.purge_old_logs() is
  'LGPD retention: download_logs>12m, security_events>6m, page_views>6m, admin_audit_log>18m. Agendado em pg_cron (purge_old_logs_daily). analytics_events é tratado por cleanup_old_analytics_events (180d).';

-- RLS-06 — Purga de subscribers obsoletos (unconfirmed >30d, unsubscribed >90d)
create or replace function public.purge_stale_email_subscribers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  with d as (
    delete from public.email_subscribers
    where (confirmed = false and confirmation_sent_at < now() - interval '30 days')
       or (unsubscribed_at is not null and unsubscribed_at < now() - interval '90 days')
    returning 1
  ) select count(*) into deleted_count from d;
  return deleted_count;
end;
$$;

revoke execute on function public.purge_stale_email_subscribers() from public, anon, authenticated;


-- ─── 8. RLS-06 — Agendamentos pg_cron que faltavam ───────────────────
-- purge_old_logs_daily já existe (chama a função por nome — pega a nova
-- definição automaticamente). Aqui agendamos os jobs ausentes:
--   • cleanup_old_email_logs (existia sem agendamento)
--   • purge_stale_email_subscribers (novo)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('cleanup-email-logs-monthly', 'purge-stale-subscribers-monthly');

    perform cron.schedule(
      'cleanup-email-logs-monthly',
      '15 3 1 * *',
      $cmd$ select public.cleanup_old_email_logs(); $cmd$
    );
    perform cron.schedule(
      'purge-stale-subscribers-monthly',
      '30 3 1 * *',
      $cmd$ select public.purge_stale_email_subscribers(); $cmd$
    );
    raise notice 'pg_cron: agendados cleanup-email-logs-monthly e purge-stale-subscribers-monthly.';
  else
    raise notice 'pg_cron indisponível — agende cleanup_old_email_logs e purge_stale_email_subscribers manualmente.';
  end if;
exception when others then
  raise notice 'Falha ao agendar jobs de retenção de e-mail: %', sqlerrm;
end;
$$;
