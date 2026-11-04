-- Revisão geral de 04/11/2026 — correções no banco.
--
-- 1. purge_old_logs() tentava apagar admin_audit_log > 18 meses, mas o trigger
--    admin_audit_log_no_delete (phase5) lança exceção para QUALQUER papel: na
--    primeira linha com 18 meses a função inteira abortaria e a retenção
--    diária de download_logs/security_events/page_views pararia em silêncio.
--    A trilha de auditoria passa a ser PERMANENTE (não-repúdio); a função
--    mantém a assinatura (admin_audit_deleted sempre 0).
-- 2. TRUNCATE não passa por trigger de linha: revoga também.
-- 3. profiles_own_update (phase6) deixava o usuário logado gravar display_name
--    pelo PostgREST sem nenhum limite — o site nunca usou esse caminho (o nome
--    é salvo por /api/me-profile com a service role). Policy removida e teto
--    de 120 caracteres na coluna (NOT VALID: não trava o push por linha antiga).
-- 4. slugify() chama unaccent() sem schema; num projeto onde a extensão foi
--    ligada pelo dashboard ela vive em `extensions` e todo INSERT em products
--    sem slug falharia. O search_path passa a incluir `extensions`.

-- 1 ─────────────────────────────────────────────────────────────────
create or replace function public.purge_old_logs()
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

  -- admin_audit_log é append-only e permanente: nunca apagar aqui.
  return query select v_download, v_security, v_pageviews, 0::bigint;
end;
$$;

revoke execute on function public.purge_old_logs() from public, anon, authenticated;
comment on function public.purge_old_logs() is
  'Retenção: download_logs 12 meses, security_events e page_views 6 meses. admin_audit_log é permanente (trigger append-only).';

-- 2 ─────────────────────────────────────────────────────────────────
revoke truncate on public.admin_audit_log from anon, authenticated, service_role;

-- 3 ─────────────────────────────────────────────────────────────────
drop policy if exists profiles_own_update on public.profiles;
revoke update on public.profiles from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_name_len'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_len
      check (display_name is null or char_length(display_name) <= 120) not valid;
  end if;
end;
$$;

-- 4 ─────────────────────────────────────────────────────────────────
alter function public.slugify(text) set search_path = public, extensions, pg_temp;
