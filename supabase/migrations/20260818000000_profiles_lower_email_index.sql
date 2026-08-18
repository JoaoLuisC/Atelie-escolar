-- ════════════════════════════════════════════════════════════════════
-- Índice funcional em profiles(lower(email))
--
-- PROBLEMA: `findUserByEmail` (lib/customer-account-provisioning.js) procurava
-- um e-mail PAGINANDO a Admin API do Supabase — `listUsers({ page, perPage:
-- 200 })` num `while (page <= 10)`, filtrando em memória. Até DEZ chamadas
-- sequenciais à Admin API para achar um endereço, e isso roda DENTRO do
-- webhook de pagamento, no caminho de provisionar a conta de quem acabou de
-- comprar.
--
-- Pior que a latência: havia um TETO. Passando de 2.000 usuários a função
-- devolvia `null` para quem existe, e o chamador seguia para criar a conta
-- duplicada — falha por crescimento, em silêncio, exatamente quando a loja dá
-- certo.
--
-- A troca é para uma consulta indexada em `public.profiles`, que já tem
-- `email` e é populada pelo trigger `handle_new_user()` (migration
-- 20260702000000_phase6_db_rls_hardening).
--
-- POR QUE `lower(email)` E NÃO `email`: a busca normaliza o endereço para
-- minúsculas antes de comparar (o chamador faz `.toLowerCase()`), então um
-- índice na coluna crua não seria usado pelo planejador — a troca ficaria
-- COSMÉTICA, com o seq scan intacto. O índice precisa casar a EXPRESSÃO da
-- consulta.
--
-- `profiles.email` já tem UNIQUE (schema.sql), e este índice não o substitui:
-- aquele garante unicidade sensível a caixa, este serve à busca insensível.
-- Manter os dois é o correto — remover o UNIQUE trocaria uma garantia de
-- integridade por bytes de disco.
--
-- CONCURRENTLY não é usado de propósito: `supabase db push` roda a migration
-- dentro de uma transação, e CREATE INDEX CONCURRENTLY não pode rodar em
-- transação. Mesmo racional da migration 20260813000002.
-- ════════════════════════════════════════════════════════════════════

create index if not exists profiles_lower_email_idx on public.profiles (lower(email));

-- ─── RPC de busca, para o índice acima ser REALMENTE usado ───────────
-- O PostgREST não expressa `lower(email) = $1` num filtro de query string:
-- `email=eq.<valor>` casaria a coluna crua (e não usaria este índice), e
-- `email=ilike.<valor>` traria de volta o problema de metacaractere que a
-- rodada de hardening já pagou uma vez — o `_` e o `%` de um e-mail viram
-- curinga, e a consulta passa a casar o registro de OUTRA pessoa.
--
-- Então a busca vira função, como já é o caso de `rate_limit_hit`. Ela
-- devolve só o `id`: quem chama precisa da chave para consultar a Admin API,
-- e não do restante do perfil.
create or replace function public.find_profile_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.profiles
  where lower(email) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

-- Só o service_role: esta função responde "existe conta com este e-mail?", que
-- é enumeração de base de clientes se exposta a `anon`.
revoke execute on function public.find_profile_id_by_email(text) from public, anon, authenticated;
grant  execute on function public.find_profile_id_by_email(text) to service_role;
