-- ════════════════════════════════════════════════════════════════════
-- Retenção de abandoned_carts — a promessa que nunca virou código.
--
-- O QUE MOTIVOU (achado da rodada de 01/09/2026, §7)
-- A migration que criou a tabela documenta, na linha 54, que ela "limpa
-- quando o cliente conclui a compra ou após 7 dias". Nenhuma função de purga
-- foi escrita, nenhum job foi agendado: a linha era intenção, não mecanismo.
-- `abandoned_carts` guarda o **e-mail digitado no checkout** junto com o
-- conteúdo do carrinho — dado pessoal de gente que nunca comprou, retido por
-- tempo indeterminado. É a única tabela de PII do projeto sem prazo.
--
-- (A verificação de 02/09 contra produção contou linhas nesta tabela, então
-- não é hipótese: há dado real esperando prazo.)
--
-- POR QUE 90 DIAS, E NÃO OS 7 DO COMENTÁRIO ORIGINAL
-- Os 7 dias descreviam o carrinho como fila de recuperação, e para ISSO eles
-- bastam: `cron-email-jobs` só olha carrinho com `updated_at` de 1h e 24h
-- atrás. Mas a mesma tabela alimenta a base de reativação e os relatórios de
-- funil do painel, que trabalham em janela de meses — apagar em 7 dias
-- esvaziaria os dois. 90 dias mantém o valor analítico e ainda é bem menor
-- que os 180 de `analytics_events`, porque aqui o dado é identificável
-- (e-mail), e lá não é.
--
-- ⚠️ O NÚMERO É DECISÃO DE NEGÓCIO. Se a política de privacidade publicada
-- declarar outro prazo, quem manda é ela — mude o `interval` abaixo e o texto
-- da política JUNTOS, nunca só um dos dois.
--
-- `recovered_at is null` no filtro: carrinho recuperado virou pedido, e o
-- pedido tem retenção fiscal própria (5 anos). Apagar a linha do carrinho
-- recuperado não apaga PII nenhuma que o pedido já não guarde, mas remove a
-- rastreabilidade da recuperação — que é o dado que mede se o e-mail de
-- carrinho abandonado funciona.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Função de limpeza ─────────────────────────────────────────
-- SECURITY DEFINER + search_path fixo: mesmas regras das outras funções do
-- projeto (ver `cleanup_old_analytics_events`).
create or replace function public.cleanup_old_abandoned_carts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  with deleted as (
    delete from public.abandoned_carts
    where recovered_at is null
      and updated_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into deleted_count from deleted;
  return deleted_count;
end;
$$;

-- Bloqueia execução pela API anon/authenticated; só service_role chama.
revoke execute on function public.cleanup_old_abandoned_carts() from public;
revoke execute on function public.cleanup_old_abandoned_carts() from anon;
revoke execute on function public.cleanup_old_abandoned_carts() from authenticated;


-- ─── 2. Agendamento mensal via pg_cron ────────────────────────────
-- Dia 1 às 03:20 UTC — 20 minutos depois do `cleanup-analytics-events`, para
-- as duas purgas não competirem pela mesma janela de I/O.
-- Falha silenciosa se a extensão não existir, como nas outras.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Idempotência: remove agendamento anterior antes de recriar.
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-abandoned-carts-monthly';

    perform cron.schedule(
      'cleanup-abandoned-carts-monthly',
      '20 3 1 * *',
      $cmd$select public.cleanup_old_abandoned_carts()$cmd$
    );

    raise notice 'pg_cron: cleanup-abandoned-carts-monthly agendado.';
  else
    raise notice 'pg_cron indisponível; agende a chamada de cleanup_old_abandoned_carts() por fora.';
  end if;
exception when others then
  raise notice 'pg_cron schedule falhou (%); agende por fora.', sqlerrm;
end$$;
