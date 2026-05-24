-- ════════════════════════════════════════════════════════════════════
-- Phase 0 — Retenção de analytics_events
-- Alinhado à regra D7: não manter dados de quem não engaja há +180 dias.
-- Mesma janela aplica para eventos de funil (privacidade + custo de
-- armazenamento + relatórios olham só dados recentes).
--
-- Estratégias possíveis:
--   A) pg_cron (Supabase Pro) → schedule mensal automático
--   B) Vercel Cron / GitHub Actions chamando /api/admin-cleanup-events
--   C) Trigger manual no admin
--
-- Esta migration cria a função SQL (B + C dependem dela) e tenta
-- agendar via pg_cron se a extensão estiver disponível. Falha
-- silenciosa se não estiver — sem quebrar a migration.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Função de limpeza ─────────────────────────────────────────
-- SECURITY DEFINER + search_path fixo (mesmas regras das outras
-- funções do projeto, ver docs/SECURITY.md §4).
create or replace function public.cleanup_old_analytics_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  with deleted as (
    delete from public.analytics_events
    where created_at < now() - interval '180 days'
    returning 1
  )
  select count(*) into deleted_count from deleted;
  return deleted_count;
end;
$$;

-- Bloqueia execução pela API anon/authenticated; só service_role chama.
revoke execute on function public.cleanup_old_analytics_events() from public;
revoke execute on function public.cleanup_old_analytics_events() from anon;
revoke execute on function public.cleanup_old_analytics_events() from authenticated;


-- ─── 2. Tentativa de agendamento via pg_cron (Supabase Pro) ───────
-- Se a extensão estiver disponível, roda no dia 1 de cada mês às 03:00 UTC.
-- Se não estiver, segue sem erro e o admin usa /api/admin-cleanup-events.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove agendamento anterior (idempotência)
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-analytics-events';

    perform cron.schedule(
      'cleanup-analytics-events',
      '0 3 1 * *',
      $cmd$select public.cleanup_old_analytics_events()$cmd$
    );

    raise notice 'pg_cron: agendamento mensal de cleanup-analytics-events criado.';
  else
    raise notice 'pg_cron não disponível neste projeto. Use /api/admin-cleanup-events para limpar manualmente, ou agende via Vercel Cron / GitHub Actions.';
  end if;
exception when others then
  raise notice 'pg_cron schedule falhou (%); use o endpoint admin manualmente.', sqlerrm;
end$$;
