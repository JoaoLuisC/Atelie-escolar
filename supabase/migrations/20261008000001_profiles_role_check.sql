-- ════════════════════════════════════════════════════════════════════
-- `profiles.check_valid_role` passa a existir no repositório.
--
-- O QUE MOTIVOU (ACH-02 da validação de 05/10/2026)
-- Trocar o papel de um usuário no painel dava 500 sempre:
--   new row for relation "profiles" violates check constraint "check_valid_role"
-- O handler gravava 'seller' em minúsculas; o banco usa MAIÚSCULAS
-- ('CUSTOMER', ver supabase/schema.sql). O handler foi corrigido
-- (handlers/admin/users.js grava a forma canônica), mas a constraint que
-- recusou o valor não estava em NENHUMA migration — produção e
-- `supabase/migrations` divergiam, e ninguém lendo o repo tinha como saber
-- quais papéis o banco aceita.
--
-- O QUE ESTA MIGRATION FAZ
-- Recria a constraint com os papéis que o código usa: CUSTOMER e SELLER
-- (atribuíveis pelo painel) e ADMIN e MASTER (só por fora, ver
-- validation/admin.schemas.js). `upper(role)` porque toda leitura de papel no
-- código compara sem caixa (admin/login.js, admin/users.js) — a constraint não
-- deve ser mais estrita que o resto do sistema.
--
-- `not valid`: não reverifica as linhas existentes, só as escritas novas.
-- Se alguma linha antiga tiver um papel fora da lista, ela continua lá (e o
-- `validate constraint` abaixo, comentado, é o que a acusaria).
--
-- ⚠️ ANTES DE APLICAR, confira a definição atual em produção:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'check_valid_role';
-- Se ela já aceitar SELLER, esta migration só documenta; se tiver papéis
-- além destes quatro, acrescente-os aqui antes do `db push`.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  drop constraint if exists check_valid_role;

alter table public.profiles
  add constraint check_valid_role
  check (upper(role) in ('CUSTOMER', 'SELLER', 'ADMIN', 'MASTER'))
  not valid;

-- alter table public.profiles validate constraint check_valid_role;
