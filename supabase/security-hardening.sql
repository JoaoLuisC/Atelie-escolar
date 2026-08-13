-- ════════════════════════════════════════════════════════════════════
-- security-hardening.sql
--
-- ⛔ ESTE ARQUIVO **NÃO** É FONTE DE VERDADE.
--
--   A fonte de verdade do estado de segurança do banco são as migrations
--   em supabase/migrations/ — aplicadas em ordem de timestamp por
--   `npm run supabase:db:push`. Este arquivo é APENAS conveniência de
--   troubleshooting: um script único, idempotente, para conferir/restaurar
--   o baseline de RLS quando o Security Advisor acusa CRITICAL e não dá
--   para rodar a esteira de migrations na hora.
--
--   POR QUE O AVISO É EM CAIXA ALTA: este script usa
--   `drop policy if exists` + `create policy`. Isso não é aditivo — ele
--   SOBRESCREVE a policy que estiver no banco. Se ele estiver desatualizado
--   em relação às migrations, rodá-lo REVERTE silenciosamente o hardening
--   mais recente. Já aconteceu: até 2026-08-12 este arquivo ainda trazia
--   `orders_own_read` autorizando por `customer_email = auth.jwt() ->> 'email'`,
--   condição que a migration 20260812000000_security_hardening_wave1.sql
--   havia removido (o claim `email` não prova posse do endereço: com
--   "Confirm email" OFF, registrar com o e-mail da vítima bastava para ler
--   os pedidos dela). Uma execução deste script num troubleshooting teria
--   reaberto esse IDOR — e o nome do arquivo ("hardening") convida
--   exatamente a isso.
--
--   REGRA DE MANUTENÇÃO: toda migration nova que crie, altere ou remova
--   POLICY, GRANT de coluna ou trigger de segurança precisa ser refletida
--   aqui NO MESMO commit. Se não der para refletir, apague o statement
--   correspondente daqui — é melhor este arquivo cobrir menos do que
--   cobrir errado.
--
-- Estado espelhado: pós-migration 20260812000000_security_hardening_wave1
--   (última migration que mexeu em policy/grant). Consolidado com
--   20260702000000_phase6_db_rls_hardening (baseline RLS + RLS-01/02/04/05),
--   20260524000000_phase0_analytics e 20260526000000_phase2_conversion
--   (policies públicas que foram REMOVIDAS depois — aqui só constam os
--   `drop`, nunca os `create`).
--
-- Ajustado ao schema REAL do banco (profiles.id é uuid e bate com
-- auth.uid(); user_products tem user_id, não email; etc).
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. Habilitar Row Level Security em todas as tabelas públicas ─
-- `if exists` porque o conjunto de tabelas depende de quantas migrations
-- já rodaram; `enable row level security` é idempotente (no-op se já ligado).
-- Espelha a seção 0 da phase6 — mantenha as duas listas iguais.
alter table if exists public.categories        enable row level security;
alter table if exists public.products          enable row level security;
alter table if exists public.orders            enable row level security;
alter table if exists public.order_items       enable row level security;
alter table if exists public.profiles          enable row level security;
alter table if exists public.user_products     enable row level security;
alter table if exists public.download_tokens   enable row level security;
alter table if exists public.download_logs     enable row level security;
alter table if exists public.analytics_events  enable row level security;
alter table if exists public.security_events   enable row level security;
alter table if exists public.page_views        enable row level security;
alter table if exists public.coupons           enable row level security;
alter table if exists public.abandoned_carts   enable row level security;
alter table if exists public.settings          enable row level security;
alter table if exists public.email_subscribers enable row level security;
alter table if exists public.email_sent_log    enable row level security;
alter table if exists public.admin_audit_log   enable row level security;


-- ─── 2. Catálogo público: ler categorias e produtos ativos ────────
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read
  on public.categories for select
  to anon, authenticated
  using (active = true);

drop policy if exists products_public_read on public.products;
create policy products_public_read
  on public.products for select
  to anon, authenticated
  using (active = true);


-- ─── 2b. W1-01 — products.download_url fora do alcance de anon ────
-- RLS controla LINHA, não COLUNA: a policy acima libera a linha inteira do
-- produto ativo, inclusive o localizador do arquivo pago. A anon key é
-- pública por construção (vai no bundle JS), então `select=download_url`
-- entregava o produto sem passar pelo gate de pagamento. Privilégio de
-- coluna é o único mecanismo que filtra coluna — por isso o revoke + grant
-- explícito da lista de colunas públicas.
--
-- ⚠ Se você adicionar uma coluna nova em public.products, ela NÃO entra
--   automaticamente nesta lista (o grant é enumerado). Colunas públicas
--   devem ser acrescentadas aqui E na migration wave1; colunas sensíveis
--   ficam de fora de propósito.
do $$
begin
  revoke select on public.products from anon, authenticated;

  execute $g$
    grant select (
      id, category_id, name, slug, description, price, original_price,
      image_url, images, tags, product_type, page_size, paper_type,
      kit_items, panel_sizes, videos, is_kit, active, featured,
      faq, reviews, benefits, created_at, updated_at
    ) on public.products to anon, authenticated
  $g$;

  raise notice 'W1-01: download_url removido do SELECT de anon/authenticated em public.products.';
exception when others then
  raise notice 'W1-01 falhou (%): revise manualmente os grants de coluna de public.products.', sqlerrm;
end $$;


-- ─── 3. Profile: id é uuid e bate com auth.uid() ──────────────────
drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- RLS-01: RLS não filtra COLUNAS. Sem a trava abaixo, o dono do perfil
-- poderia gravar profiles.role='ADMIN' (escalonamento). O trigger (invoker)
-- preserva id/email/role/provider para qualquer papel que não seja backend.
create or replace function public.profiles_guard_privileged_cols()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.id       := old.id;
    new.email    := old.email;
    new.role     := old.role;
    new.provider := old.provider;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_cols on public.profiles;
create trigger profiles_guard_privileged_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_cols();


-- ─── 4. Pedidos do próprio cliente (W1-02 / W1-03) ────────────────
-- Escopo é SÓ `customer_id = auth.uid()`. A condição antiga
-- `or customer_email = (auth.jwt() ->> 'email')` foi REMOVIDA pela wave1 e
-- NÃO pode voltar: o claim `email` do JWT prova apenas que o usuário digitou
-- aquele endereço no cadastro, não que ele o possui. Com "Confirm email"
-- desligado no projeto hospedado, qualquer um registra com o e-mail da
-- vítima (anon key + POST /auth/v1/signup) e passa a ler pedidos, PII e —
-- encadeando com order_items — os tokens de download dela.

-- W1-03: normaliza o histórico para lowercase. Inserts novos já gravam assim
-- (api/create-payment.js); isto acerta linhas antigas em caixa mista para que
-- o backfill abaixo (e o `eq` do código) não perca pedidos.
update public.orders
   set customer_email = lower(customer_email)
 where customer_email is not null
   and customer_email <> lower(customer_email);

-- Backfill ANTES de trocar a policy: vincula pedido de convidado ao usuário
-- que depois criou conta com o mesmo e-mail. Sem isso, ancorar em customer_id
-- faz o comprador legítimo perder o histórico. Idempotente (só toca NULL).
update public.orders o
   set customer_id = u.id
  from auth.users u
 where o.customer_id is null
   and lower(o.customer_email) = lower(u.email);

drop policy if exists orders_own_read on public.orders;
create policy orders_own_read
  on public.orders for select
  to authenticated
  using (customer_id = auth.uid());

-- exists(...) em vez de `order_id in (select ...)`: aproveita o índice e não
-- materializa a lista de pedidos do usuário a cada linha avaliada.
drop policy if exists order_items_via_orders on public.order_items;
create policy order_items_via_orders
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.uid()
    )
  );


-- ─── 5. Produtos comprados pelo próprio usuário ───────────────────
-- user_products.user_id é uuid, bate com auth.uid()
drop policy if exists user_products_own_read on public.user_products;
create policy user_products_own_read
  on public.user_products for select
  to authenticated
  using (user_id = auth.uid());


-- ─── 6. Escrita pública removida (RLS-02, RLS-04, W1-04) ──────────
-- Três tabelas tinham policy de escrita anônima com `with check (true)`.
-- Em todas elas quem grava é o backend com service-role (que bypassa RLS),
-- então a policy só existia como superfície de ataque. Aqui ficam APENAS os
-- `drop` — se algum dia uma delas voltar a precisar de escrita pública, a
-- decisão passa por migration, não por este arquivo.
--
--   RLS-04  page_views        — anon forjava IP/UA/path (envenenamento de log).
--   RLS-02  abandoned_carts   — adulteração cross-user / relay de e-mail.
--   W1-04   analytics_events  — anon forjava created_at/session_id/source e
--                               properties sem teto, pulando lib/analytics-events.js.
--                               O front posta em /api/track-event, nunca direto
--                               no PostgREST.
-- `drop policy if exists` ignora a policy ausente mas NÃO a tabela ausente:
-- num banco parcialmente migrado ele lança 42P01 e, como o SQL Editor roda o
-- script colado numa transação, derruba TUDO acima (mesma armadilha descrita
-- na seção 8+9). Por isso cada tabela é testada com to_regclass antes.
do $$
begin
  if to_regclass('public.page_views') is not null then
    drop policy if exists page_views_public_insert on public.page_views;
  end if;

  if to_regclass('public.abandoned_carts') is not null then
    drop policy if exists abandoned_carts_public_insert on public.abandoned_carts;
    drop policy if exists abandoned_carts_public_update on public.abandoned_carts;
  end if;

  if to_regclass('public.analytics_events') is not null then
    drop policy if exists analytics_events_public_insert on public.analytics_events;
    revoke insert on public.analytics_events from anon, authenticated;
  end if;

  raise notice 'Escrita pública removida de page_views / abandoned_carts / analytics_events (nas que existem).';
end $$;


-- ─── 7. Tabelas DELIBERADAMENTE sem policies ──────────────────────
-- settings, download_tokens, download_logs, security_events, coupons,
-- abandoned_carts, email_subscribers, email_sent_log, admin_audit_log,
-- page_views e analytics_events: RLS ligado + zero policy = service-role only
-- (o backend bypassa RLS). Anon e usuários autenticados perdem acesso — é o
-- que resolve "Sensitive Columns Exposed" e protege adminConfig
-- (TOTP/fallbackPin) em settings.
-- Os INFO "RLS Enabled No Policy" do Security Advisor para essas tabelas são
-- esperados; ver docs/SECURITY.md §Auditoria periódica.


-- ─── 8+9. search_path e EXECUTE das funções ───────────────────────
-- ⚠ handle_new_user() NÃO é criada por schema.sql — a única definição versionada
-- está em migrations/20260702000000_phase6_db_rls_hardening.sql, aplicada DEPOIS
-- deste arquivo no bootstrap documentado. Referenciá-la diretamente lançava
-- ERROR 42883 e, como o SQL Editor roda o script colado numa transação, fazia
-- ROLLBACK de TUDO acima — inclusive dos `enable row level security` da seção 1
-- e das policies das seções 2-6. O operador via o erro no fim de um script
-- chamado "security-hardening" e seguia para o seed com o banco sem RLS.
-- Mesmo motivo para o bloco condicional de prevent_admin_audit_mutation().
alter function public.set_updated_at() set search_path = public, pg_temp;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    execute 'alter function public.handle_new_user() set search_path = public, pg_temp';
    execute 'revoke execute on function public.handle_new_user() from public';
    execute 'revoke execute on function public.handle_new_user() from anon';
    execute 'revoke execute on function public.handle_new_user() from authenticated';
    raise notice 'handle_new_user(): search_path fixado e EXECUTE revogado.';
  else
    raise notice 'handle_new_user() ainda não existe — será criada e endurecida por migrations/20260702000000_phase6_db_rls_hardening.sql. Aplique as migrations.';
  end if;
end $$;

-- W1-05 — prevent_admin_audit_mutation() era a única função do projeto sem
-- search_path fixo (trigger de imutabilidade do admin_audit_log).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prevent_admin_audit_mutation'
  ) then
    execute 'alter function public.prevent_admin_audit_mutation() set search_path = public, pg_temp';
    raise notice 'W1-05: search_path fixado em prevent_admin_audit_mutation().';
  else
    raise notice 'W1-05: prevent_admin_audit_mutation() ausente — aplique migrations/20260701000000_phase5_audit_immutability.sql.';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 10. Verificação final
-- ════════════════════════════════════════════════════════════════════

-- 10.1 RLS ativo e contagem de policies por tabela:
select
  c.relname                                                          as tabela,
  case when c.relrowsecurity then 'ATIVO' else 'INATIVO' end         as rls,
  coalesce((
    select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  ), 0)                                                              as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
-- Esperado: nenhum INATIVO.

-- 10.2 Nenhuma policy de orders/order_items pode mencionar 'email'
--      (se voltar a aparecer, o IDOR do W1-02 está reaberto):
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public' and tablename in ('orders', 'order_items')
   and qual ilike '%email%';
-- Esperado: 0 linhas.

-- 10.3 download_url NÃO pode aparecer para anon/authenticated:
select grantee, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'products'
   and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
   and column_name = 'download_url';
-- Esperado: 0 linhas.

-- 10.4 Pedidos órfãos que o backfill não conseguiu vincular (esse cliente só
--      recupera o histórico ao criar conta com o mesmo e-mail):
select count(*) as pedidos_sem_customer_id from public.orders where customer_id is null;
