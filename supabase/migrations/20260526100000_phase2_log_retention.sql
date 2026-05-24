-- ════════════════════════════════════════════════════════════════════
-- Phase 2 — Retenção de logs (LGPD princípio da minimização)
--
-- Cria função purge_old_logs() que:
--   • apaga download_logs com downloaded_at > 12 meses
--   • apaga analytics_events com created_at > 24 meses
--
-- Agenda via pg_cron diariamente às 03:00 UTC (idempotente: drop+create).
--
-- Justificativa de retenção:
--   • download_logs (IP + UA): 12 meses cobre auditoria de fraude e
--     investigação de incidentes; além disso vira ruído sem propósito.
--   • analytics_events: 24 meses permite comparação YoY; depois dilui.
--
-- Mitiga R12 do PLANO_SEGURANCA.md.
-- Idempotente: pode ser executado múltiplas vezes sem efeito colateral.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Função única que faz o purge ───────────────────────────────
create or replace function public.purge_old_logs()
returns table (download_logs_deleted bigint, analytics_events_deleted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_download_count bigint := 0;
  v_analytics_count bigint := 0;
begin
  -- download_logs > 12 meses
  with deleted as (
    delete from public.download_logs
    where downloaded_at < (now() - interval '12 months')
    returning 1
  )
  select count(*) into v_download_count from deleted;

  -- analytics_events > 24 meses (se a tabela existir)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'analytics_events'
  ) then
    with deleted as (
      delete from public.analytics_events
      where created_at < (now() - interval '24 months')
      returning 1
    )
    select count(*) into v_analytics_count from deleted;
  end if;

  return query select v_download_count, v_analytics_count;
end;
$$;

revoke execute on function public.purge_old_logs() from public, anon, authenticated;
comment on function public.purge_old_logs() is
  'LGPD retention purge: apaga download_logs >12m e analytics_events >24m. Agendado em pg_cron.';


-- ─── 2. Agendamento via pg_cron ────────────────────────────────────
-- Requer a extensão pg_cron (incluída por padrão no Supabase, schema "cron").
-- Se a extensão não estiver habilitada, este bloco é silenciosamente pulado
-- e o admin precisa rodar manualmente: select cron.schedule(...).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove agendamento anterior (se houver) e cria novo.
    perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'purge_old_logs_daily';

    perform cron.schedule(
      'purge_old_logs_daily',
      '0 3 * * *',
      $cron$ select public.purge_old_logs(); $cron$
    );
  else
    raise notice 'pg_cron não habilitada — rode "create extension pg_cron;" no schema "extensions" para ativar o agendamento.';
  end if;
exception when others then
  raise notice 'Falha ao agendar purge_old_logs_daily: %', sqlerrm;
end $$;
