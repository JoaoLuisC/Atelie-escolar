-- ════════════════════════════════════════════════════════════════════
-- Phase 5 — admin_audit_log append-only (review Área 2, achado AUTH-18)
--
-- RLS "sem policies" bloqueia anon/authenticated, mas a service_role tem
-- BYPASSRLS: com a service key (usada por toda a camada privilegiada) era
-- possível UPDATE/DELETE nas linhas do audit, destruindo a própria
-- evidência. Impomos imutabilidade no BANCO:
--   1. REVOKE UPDATE/DELETE dos roles do PostgREST (defesa por privilégio);
--   2. trigger BEFORE UPDATE/DELETE que lança exceção (defesa role-agnostic,
--      pega até quem tiver privilégio herdado).
--
-- INSERT continua permitido (o app só insere). Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- 1. Remove privilégios de mutação dos roles usados via PostgREST.
revoke update, delete on public.admin_audit_log from anon, authenticated, service_role;

-- 2. Trigger append-only: bloqueia qualquer UPDATE/DELETE, independente do role.
create or replace function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log e append-only: UPDATE/DELETE nao sao permitidos';
end;
$$;

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update on public.admin_audit_log
  for each row execute function public.prevent_admin_audit_mutation();

drop trigger if exists admin_audit_log_no_delete on public.admin_audit_log;
create trigger admin_audit_log_no_delete
  before delete on public.admin_audit_log
  for each row execute function public.prevent_admin_audit_mutation();

comment on function public.prevent_admin_audit_mutation() is
  'Impõe append-only em admin_audit_log (regra I1 / não-repúdio).';
