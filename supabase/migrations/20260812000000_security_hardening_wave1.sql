-- ════════════════════════════════════════════════════════════════════
-- Wave 1 — Hardening de segurança (auditoria de 2026-08-12)
--
-- Idempotente e forward-only. Corrige, nesta ordem:
--   W1-01  products.download_url legível por anon. RLS controla LINHA, não
--          COLUNA: products_public_read (using active = true) entregava o
--          localizador do arquivo pago a qualquer portador da anon key, que é
--          pública por construção (está no bundle JS). Privilégio de coluna é
--          o único mecanismo que filtra coluna.
--   W1-02  orders_own_read / order_items_via_orders autorizavam por
--          `customer_email = auth.jwt() ->> 'email'`. O claim `email` não prova
--          posse do endereço: se "Confirm email" estiver OFF, basta registrar
--          com o e-mail da vítima (anon key + POST /auth/v1/signup) para ler
--          os pedidos dela — PII e, encadeado, o token de download. Passa a
--          ancorar em customer_id = auth.uid(), com backfill.
--   W1-03  Normaliza orders.customer_email para lowercase, condição para o
--          código trocar `ilike` por `eq` (o curinga `_`/`%` do e-mail vazava
--          pedidos de terceiros — ver api/customer-orders.js).
--   W1-04  analytics_events_public_insert permitia ao anônimo forjar
--          created_at/session_id/source e properties sem teto de tamanho,
--          pulando todas as validações de lib/analytics-events.js. Removida:
--          o front posta em /api/track-event, nunca direto no PostgREST.
--   W1-05  prevent_admin_audit_mutation() era a única função do projeto sem
--          search_path fixo.
--
-- NÃO cobre (exige ação no dashboard / fora do SQL):
--   • Rotação de segredos expostos no histórico do git.
--   • Toggle "Confirm email" e MFA no projeto hospedado.
--   • Rate limiting no runtime da Vercel (ver docs/SECURITY.md).
--   • Confirmar public=false nos buckets product_files/product_videos.
-- ════════════════════════════════════════════════════════════════════


-- ─── W1-03 — Normalizar e-mail dos pedidos (pré-requisito do eq) ──────
-- Todo insert novo já grava lowercase (api/create-payment.js). Isto acerta o
-- histórico, para que `eq` não perca pedidos antigos gravados em caixa mista.
update public.orders
   set customer_email = lower(customer_email)
 where customer_email is not null
   and customer_email <> lower(customer_email);


-- ─── W1-01 — products.download_url: privilégio de coluna ─────────────
-- A policy products_public_read continua valendo para as LINHAS (active = true);
-- o que muda é o conjunto de COLUNAS que anon/authenticated podem projetar.
-- Sem o revoke, `select=download_url` funciona mesmo com RLS correto.
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


-- ─── W1-02 — Autorização de pedidos ancorada em auth.uid() ───────────
-- Backfill: vincula pedidos de convidado ao usuário real ANTES de trocar a
-- policy, senão o comprador que criou conta depois perde o histórico.
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


-- ─── W1-04 — Remover INSERT anônimo em analytics_events ──────────────
-- Mesmo tratamento que a phase6 deu a page_views. Sem policy = service-role
-- only; o backend continua gravando via /api/track-event.
drop policy if exists analytics_events_public_insert on public.analytics_events;
revoke insert on public.analytics_events from anon, authenticated;


-- ─── W1-05 — search_path fixo no trigger de imutabilidade do audit ───
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
    raise notice 'W1-05: prevent_admin_audit_mutation() ausente — nada a fazer.';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- Verificação (rode e confira o resultado)
-- ════════════════════════════════════════════════════════════════════

-- 1. download_url NÃO deve aparecer para anon/authenticated:
select grantee, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'products'
   and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
   and column_name = 'download_url';
-- Esperado: 0 linhas.

-- 2. Nenhuma policy de orders/order_items deve mencionar 'email':
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public' and tablename in ('orders', 'order_items')
   and qual ilike '%email%';
-- Esperado: 0 linhas.

-- 3. RLS ativo em todas as tabelas públicas:
select c.relname as tabela,
       case when c.relrowsecurity then 'ATIVO' else 'INATIVO' end as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relrowsecurity, c.relname;
-- Esperado: nenhum INATIVO.

-- 4. Pedidos órfãos que o backfill não conseguiu vincular (o cliente perde o
--    histórico no /api/customer-orders até criar conta com esse e-mail):
select count(*) as pedidos_sem_customer_id from public.orders where customer_id is null;
