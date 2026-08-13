-- ════════════════════════════════════════════════════════════════════
-- Rate limiting que vale EM PRODUÇÃO (achado P1-3 / "API-03")
--
-- PROBLEMA: todos os limitadores do projeto são express-rate-limit com store
-- EM MEMÓRIA e vivem em server.js / routes/api-compat.routes.js — arquivos que
-- só rodam no Express de desenvolvimento. Em produção o deploy são ~43 funções
-- serverless isoladas na Vercel: sem processo longevo, sem memória
-- compartilhada entre invocações e sem middleware global. Ou seja, no ar não
-- existe rate limit nenhum:
--   • /api/admin-login     → brute force ilimitado da senha E do 2º fator;
--   • /api/validate-coupon → oráculo de enumeração de códigos;
--   • /api/verify-payment  → varredura de order_code (resposta com PII).
--
-- SOLUÇÃO: o único estado compartilhado que TODAS as funções já enxergam é o
-- Postgres do Supabase. Um contador atômico por (bucket, identificador, janela)
-- fecha o buraco sem introduzir infraestrutura nova (Redis/Upstash) e sem
-- dependência nova no package.json. Custo: 1 `insert ... on conflict do update`
-- por requisição limitada, no mesmo banco que o handler já consulta.
--
-- POR QUE JANELA FIXA (e não deslizante): é 1 linha por janela, sem varrer
-- histórico de timestamps, e é exatamente o comportamento do express-rate-limit
-- que estamos portando de dev para prod (paridade dev/prod é o objetivo aqui).
-- O custo conhecido é o efeito de borda — até 2x o limite na virada da janela.
-- Para 5 logins admin / 10 min isso é irrelevante perto de "nenhum limite".
--
-- RLS habilitada SEM policies → só o service_role enxerga, mesma estratégia de
-- security_events / download_logs / settings (docs/SECURITY.md §3). A função é
-- SECURITY DEFINER com search_path fixo e EXECUTE só para service_role, mesmo
-- padrão de public.increment_coupon_usage (20260701000001_phase5_payment_hardening).
--
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. Tabela do contador ───────────────────────────────────────────
-- Chave composta (bucket, identifier, window_start): a linha É a janela. Não
-- há sequência nem id sintético porque nunca se lê uma linha específica por id
-- — todo acesso é pelo upsert da PK, que é também o índice do lookup.
create table if not exists public.rate_limit_hit (
  -- Nome lógico do limite ('admin-login', 'validate-coupon', …). Permite que
  -- endpoints diferentes contem separadamente para o MESMO IP.
  bucket       text        not null,
  -- Identificador do cliente. Hoje é sempre o IP resolvido na borda
  -- (lib/security-logger.js → extractClientIp); o helper permite sobrescrever
  -- por algo mais forte quando houver (ex.: id de sessão).
  identifier   text        not null,
  -- Início da janela fixa, alinhado a múltiplos de p_window_seconds.
  window_start timestamptz not null,
  count        integer     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (bucket, identifier, window_start)
);

-- Índice para a purga (a PK começa por bucket, então não serve para varrer por
-- idade). Sem ele, a limpeza vira seq scan na tabela mais quente do projeto.
create index if not exists rate_limit_hit_window_start_idx
  on public.rate_limit_hit (window_start);

alter table public.rate_limit_hit enable row level security;
-- Sem policies — service_role bypassa; anon/authenticated não leem nem gravam.
-- Isso importa: a tabela é um mapa de "quem bateu onde e quantas vezes", ou
-- seja, IP + comportamento. Expor equivale a vazar telemetria de segurança.

comment on table public.rate_limit_hit is
  'Contador de rate limit por (bucket, identificador, janela fixa). Escrito só via public.rate_limit_hit(). Service role only; purgado por purge_old_rate_limit_hits().';


-- ─── 2. Função de incremento atômico ─────────────────────────────────
-- Nota sobre o nome: função e tabela se chamam rate_limit_hit. Postgres mantém
-- funções (pg_proc) e tipos/tabelas (pg_type/pg_class) em catálogos distintos,
-- então a coexistência é legal — a ambiguidade de notação funcional só existiria
-- para função de 1 argumento do tipo composto, e esta tem 4.
--
-- `drop function` antes do create: `create or replace` não consegue mudar o
-- tipo de retorno, então uma evolução futura da assinatura quebraria o push.
-- Mesmo padrão de purge_old_logs() nas migrations anteriores.
drop function if exists public.rate_limit_hit(text, text, int, int);

create function public.rate_limit_hit(
  p_bucket         text,
  p_identifier     text,
  p_limit          int,
  p_window_seconds int
)
returns table (
  allowed             boolean,
  hit_count           integer,
  remaining           integer,
  limit_value         integer,   -- `limit` é palavra reservada; não dá pra usar como coluna sem aspas
  reset_at            timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Saneamento defensivo: os parâmetros vêm de constantes do backend, mas a
  -- função é SECURITY DEFINER — tratamos entrada como não confiável por regra.
  v_window_seconds int  := greatest(1, coalesce(p_window_seconds, 60));
  v_limit          int  := greatest(1, coalesce(p_limit, 60));
  v_bucket         text := left(coalesce(nullif(btrim(p_bucket), ''), 'default'), 64);
  v_identifier     text := left(coalesce(nullif(btrim(p_identifier), ''), 'unknown'), 200);
  v_window_start   timestamptz;
  v_reset_at       timestamptz;
  v_count          int;
begin
  -- Janela fixa: trunca o epoch atual para o múltiplo inferior de
  -- v_window_seconds. Todas as funções serverless calculam o MESMO
  -- window_start para o mesmo instante, que é o que permite compartilhar a linha.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_window_seconds)::double precision * v_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => v_window_seconds);

  -- O incremento e a leitura acontecem NA MESMA instrução: é isto que elimina a
  -- corrida read-modify-write (duas lambdas concorrentes lendo 4 e gravando 5).
  -- O alias `rl` evita que `rate_limit_hit.count` seja resolvido contra o rótulo
  -- implícito do bloco plpgsql (que tem o mesmo nome da função).
  insert into public.rate_limit_hit as rl (bucket, identifier, window_start, count, updated_at)
  values (v_bucket, v_identifier, v_window_start, 1, now())
  on conflict (bucket, identifier, window_start)
  do update set count = rl.count + 1,
                updated_at = now()
  returning rl.count into v_count;

  return query
  select
    v_count <= v_limit,
    v_count,
    greatest(0, v_limit - v_count),
    v_limit,
    v_reset_at,
    greatest(1, ceil(extract(epoch from (v_reset_at - now())))::int);
end;
$$;

comment on function public.rate_limit_hit(text, text, int, int) is
  'Incrementa atomicamente o contador da janela fixa atual e devolve allowed/hit_count/remaining/limit_value/reset_at/retry_after_seconds. Chamada via PostgREST rpc pelo lib/rate-limit.js. Service role only.';

-- Só o backend conta: exposto a anon/authenticated, o próprio contador viraria
-- uma primitiva de negação de serviço (qualquer um estouraria o balde do vizinho).
revoke execute on function public.rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant  execute on function public.rate_limit_hit(text, text, int, int) to service_role;


-- ─── 3. Limpeza das janelas vencidas ─────────────────────────────────
-- A tabela cresce em 1 linha por (bucket, IP, janela). Sem purga, meses de
-- tráfego viram milhões de linhas mortas — e nenhuma delas tem valor depois que
-- a janela fecha (a decisão já foi tomada). 24h de folga preserva material para
-- investigar um ataque recente sem virar arquivo histórico de IPs (LGPD).
create or replace function public.purge_old_rate_limit_hits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  with d as (
    delete from public.rate_limit_hit
    where window_start < (now() - interval '24 hours')
    returning 1
  ) select count(*) into v_deleted from d;
  return v_deleted;
end;
$$;

comment on function public.purge_old_rate_limit_hits() is
  'Remove janelas de rate limit com mais de 24h. Agendado em pg_cron (purge-rate-limit-hits-hourly).';

revoke execute on function public.purge_old_rate_limit_hits() from public, anon, authenticated;
grant  execute on function public.purge_old_rate_limit_hits() to service_role;


-- ─── 4. Agendamento (degrada com notice se pg_cron não existir) ───────
-- Mesmo padrão de 20260526120000_phase2_enable_pg_cron.sql: um erro aqui NÃO
-- pode abortar o `supabase db push`, senão uma migration posterior de RLS deixa
-- de ser aplicada. Falha = notice + limpeza manual, nunca deploy quebrado.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível — agende public.purge_old_rate_limit_hits() manualmente (a cada hora).';
    return;
  end if;

  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-rate-limit-hits-hourly';
  exception when others then
    raise notice 'unschedule (ok se inexistente): %', sqlerrm;
  end;

  perform cron.schedule(
    'purge-rate-limit-hits-hourly',
    '20 * * * *',
    $cmd$ select public.purge_old_rate_limit_hits(); $cmd$
  );
  raise notice 'purge-rate-limit-hits-hourly agendado (:20 de cada hora).';
exception when others then
  raise notice 'Falha ao agendar purge-rate-limit-hits-hourly (%). rate_limit_hit vai crescer sem limpeza — verifique cron.job.', sqlerrm;
end $$;


-- Recarrega o cache de schema do PostgREST. Sem isto, a primeira chamada a
-- /rest/v1/rpc/rate_limit_hit pode responder 404 até o Supabase recarregar
-- sozinho — e o helper trataria isso como falha de infra (fail-open).
notify pgrst, 'reload schema';
