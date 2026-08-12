-- ════════════════════════════════════════════════════════════════════
-- Phase 2 — Habilita pg_cron e agenda purge_old_logs() diariamente
--
-- As migrations 20260526100000 (log retention) e 20260526110000
-- (security events) criaram a função public.purge_old_logs() mas o
-- agendamento foi pulado porque pg_cron não estava habilitada.
--
-- Esta migration:
--   1. Cria a extensão pg_cron no schema "extensions" (padrão Supabase).
--   2. Remove agendamento anterior se existir (idempotência).
--   3. Agenda execução diária às 03:00 UTC.
--
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.
-- Pré-requisito: a role do migration precisa ter privilégio para criar
-- extensão. Em Supabase, o postgres role tem.
-- ════════════════════════════════════════════════════════════════════

-- ⚠ pg_cron NÃO é relocável e depende de privilégio da plataforma. Esta era a
-- única migration do repo que chamava `create extension` e `cron.schedule` sem
-- guarda — um erro aqui abortava o `supabase db push` ANTES da phase6, que é
-- quem versiona o baseline de RLS. Resultado possível: banco novo em produção
-- sem RLS em tabela sensível. Tudo abaixo agora degrada com `raise notice`,
-- seguindo o mesmo padrão da 20260702000000_phase6_db_rls_hardening.sql.
do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron indisponível (%): agende purge_old_logs() manualmente no dashboard.', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron ausente — pulando agendamento de purge_old_logs_daily.';
    return;
  end if;

  -- Remove agendamento anterior (caso já exista de tentativa manual).
  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge_old_logs_daily';
  exception when others then
    raise notice 'unschedule (ok se inexistente): %', sqlerrm;
  end;

  -- Agenda diariamente às 03:00 UTC.
  perform cron.schedule(
    'purge_old_logs_daily',
    '0 3 * * *',
    $cmd$select public.purge_old_logs();$cmd$
  );
  raise notice 'purge_old_logs_daily agendado (03:00 UTC).';
exception when others then
  raise notice 'Falha ao agendar purge_old_logs_daily (%). Retenção LGPD NÃO está automatizada — verifique cron.job.', sqlerrm;
end $$;
