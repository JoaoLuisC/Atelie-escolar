-- ════════════════════════════════════════════════════════════════════
-- Phase 1 — URLs amigáveis (slugs) para SEO técnico
-- Adiciona coluna `slug` em products, faz backfill a partir do nome
-- e cria índice + unique constraint. Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Extensão unaccent para slugify com acentos ────────────────
create extension if not exists unaccent;

-- ─── 2. Helper genérico de slugify ────────────────────────────────
-- Reutilizável por categories também (que já tem slug, mas pode usar isto).
create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(input, ''))),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

-- ─── 3. Coluna slug em products ───────────────────────────────────
alter table public.products
  add column if not exists slug text;

-- ─── 4. Backfill — slugify(name) + sufixo de id para garantir unicidade
update public.products
set slug = public.slugify(name) || '-' || id::text
where slug is null or slug = '';

-- ─── 5. Unique constraint + índice ────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_slug_unique'
  ) then
    alter table public.products add constraint products_slug_unique unique (slug);
  end if;
end$$;

create index if not exists products_slug_idx on public.products (slug);

-- ─── 6. Trigger: gera slug em INSERT/UPDATE se não vier preenchido
--      Usa o id da linha como sufixo de desempate. Sempre escreve, nunca
--      lê de fora — seguro para clientes não-admin (RLS já fechada para
--      escrita em products, então só backend service-role chega aqui).
create or replace function public.products_ensure_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 0;
begin
  if new.slug is null or new.slug = '' then
    base_slug := public.slugify(new.name);
    if base_slug = '' then
      base_slug := 'produto';
    end if;

    candidate := base_slug;
    while exists (
      select 1 from public.products
      where slug = candidate and id <> new.id
    ) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix::text;
    end loop;

    new.slug := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists products_ensure_slug_before_insert on public.products;
create trigger products_ensure_slug_before_insert
  before insert on public.products
  for each row execute function public.products_ensure_slug();

drop trigger if exists products_ensure_slug_before_update on public.products;
create trigger products_ensure_slug_before_update
  before update on public.products
  for each row
  when (new.slug is distinct from old.slug or new.slug is null)
  execute function public.products_ensure_slug();
