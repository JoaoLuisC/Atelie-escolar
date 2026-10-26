-- Marketplace: cada produto pertence a um vendedor (profiles.role = SELLER).
-- A coluna começa nullable para preservar produtos existentes; o administrador
-- atribui os legados no painel antes de torná-la obrigatória em uma migração futura.

alter table public.products
  add column if not exists seller_id uuid references public.profiles(id) on delete restrict;

create index if not exists products_seller_id_idx on public.products (seller_id);

comment on column public.products.seller_id is
  'Vendedor responsável pelo produto. NULL somente para catálogo legado ainda não atribuído.';
