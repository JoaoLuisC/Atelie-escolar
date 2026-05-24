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

create extension if not exists pg_cron with schema extensions;

-- Remove agendamento anterior (caso já exista de tentativa manual).
do $$
begin
  perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'purge_old_logs_daily';
exception when others then
  raise notice 'unschedule (ok se inexistente): %', sqlerrm;
end $$;

-- Agenda diariamente às 03:00 UTC.
select cron.schedule(
  'purge_old_logs_daily',
  '0 3 * * *',
  $$select public.purge_old_logs();$$
);
