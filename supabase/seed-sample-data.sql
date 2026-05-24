-- ════════════════════════════════════════════════════════════════════
-- seed-sample-data.sql
-- Popula categorias + produtos de exemplo. Idempotente (ON CONFLICT).
-- Imagens são placeholders do Unsplash com keywords pedagógicos.
-- ════════════════════════════════════════════════════════════════════

-- ─── Categorias ───────────────────────────────────────────────────
insert into public.categories (name, slug, color, active, featured, badge_label, sort_order)
values
  ('Festa Junina',          'festa-junina',           '#FFB627', true, true,  'MAIS VENDIDO', 1),
  ('Formatura',             'formatura',              '#9B5DE5', true, true,  'DESTAQUE',     2),
  ('Volta às Aulas',        'volta-as-aulas',         '#00BBF9', true, true,  'LANÇAMENTO',  3),
  ('Datas Comemorativas',   'datas-comemorativas',    '#F15BB5', true, false, 'PROMO',       4),
  ('Decoração de Sala',     'decoracao-de-sala',      '#00F5D4', true, false, 'EXCLUSIVO',   5),
  ('Atividades Pedagógicas','atividades-pedagogicas', '#FEE440', true, false, '',            6)
on conflict (slug) do update set
  name        = excluded.name,
  color       = excluded.color,
  active      = excluded.active,
  featured    = excluded.featured,
  badge_label = excluded.badge_label,
  sort_order  = excluded.sort_order;


-- ─── Produtos ─────────────────────────────────────────────────────
-- Inserção condicional via NOT EXISTS para evitar duplicados pelo nome
insert into public.products (
  name, slug, description, price, original_price,
  image_url, images, download_url, category_id,
  active, featured, tags, product_type, is_kit,
  page_size, paper_type
)
select * from (values
  -- Festa Junina
  (
    'Kit Festa Junina Completo',
    'kit-festa-junina-completo',
    'Pacote com banners, painéis, lembrancinhas e atividades temáticas. PDF em alta resolução, pronto para imprimir.',
    49.90, 79.90,
    'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=800',
    '["https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=800","https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800"]'::jsonb,
    'https://drive.google.com/exemplo-festa-junina',
    (select id from public.categories where slug = 'festa-junina'),
    true, true, '["festa","junina","kit"]'::jsonb, 'kit', true,
    'A3', 'PDF'
  ),
  (
    'Banner Quadrilha',
    'banner-quadrilha',
    'Banner decorativo para festa junina. Tamanho 2x1m, alta resolução.',
    29.90, null,
    'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800',
    '[]'::jsonb,
    'https://drive.google.com/exemplo-banner-quadrilha',
    (select id from public.categories where slug = 'festa-junina'),
    true, false, '["banner","festa"]'::jsonb, 'individual', false,
    '2x1m', 'PDF'
  ),

  -- Formatura
  (
    'Painel Formatura Infantil',
    'painel-formatura-infantil',
    'Painel completo com nome dos alunos, espaço para foto e moldura decorada.',
    59.90, 89.90,
    'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=800',
    '["https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=800","https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=800"]'::jsonb,
    'https://drive.google.com/exemplo-formatura',
    (select id from public.categories where slug = 'formatura'),
    true, true, '["formatura","painel"]'::jsonb, 'individual', false,
    'A2', 'PDF'
  ),
  (
    'Convite Formatura ABC',
    'convite-formatura-abc',
    'Modelo de convite para formatura do 5º ano. Editável no Canva.',
    19.90, null,
    'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=800',
    '[]'::jsonb,
    'https://drive.google.com/exemplo-convite',
    (select id from public.categories where slug = 'formatura'),
    true, false, '["convite","formatura"]'::jsonb, 'individual', false,
    '10x15cm', 'PDF'
  ),

  -- Volta às Aulas
  (
    'Kit Volta às Aulas',
    'kit-volta-as-aulas',
    'Etiquetas, calendário, varal de boas-vindas e atividades introdutórias.',
    39.90, 64.90,
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800',
    '["https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800","https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800"]'::jsonb,
    'https://drive.google.com/exemplo-volta-aulas',
    (select id from public.categories where slug = 'volta-as-aulas'),
    true, true, '["volta","aulas","kit"]'::jsonb, 'kit', true,
    'A4', 'PDF'
  ),

  -- Datas Comemorativas
  (
    'Dia das Mães Premium',
    'dia-das-maes-premium',
    'Cartões, painéis e lembrancinhas temáticas para o Dia das Mães.',
    34.90, null,
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
    '[]'::jsonb,
    'https://drive.google.com/exemplo-dia-maes',
    (select id from public.categories where slug = 'datas-comemorativas'),
    true, false, '["dia-das-maes","cartao"]'::jsonb, 'individual', false,
    'A4', 'PDF'
  ),
  (
    'Páscoa Pedagógica',
    'pascoa-pedagogica',
    'Atividades, máscaras e enfeites de Páscoa para Educação Infantil.',
    24.90, null,
    'https://images.unsplash.com/photo-1521967906867-14ec9d64bee8?w=800',
    '[]'::jsonb,
    'https://drive.google.com/exemplo-pascoa',
    (select id from public.categories where slug = 'datas-comemorativas'),
    true, false, '["pascoa","atividades"]'::jsonb, 'individual', false,
    'A4', 'PDF'
  ),

  -- Decoração de Sala
  (
    'Varal Alfabeto Colorido',
    'varal-alfabeto-colorido',
    'Letras de A a Z em estilo cartoon para decorar a sala de aula.',
    27.90, null,
    'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800',
    '["https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800"]'::jsonb,
    'https://drive.google.com/exemplo-varal-abc',
    (select id from public.categories where slug = 'decoracao-de-sala'),
    true, true, '["alfabeto","varal","decoracao"]'::jsonb, 'individual', false,
    'A4', 'PDF'
  ),

  -- Atividades Pedagógicas
  (
    'Caderno de Atividades 1º Ano',
    'caderno-atividades-1o-ano',
    'Coletânea de 50 atividades alfabetização e numeralização para 1º ano.',
    44.90, null,
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
    '[]'::jsonb,
    'https://drive.google.com/exemplo-caderno',
    (select id from public.categories where slug = 'atividades-pedagogicas'),
    true, false, '["atividades","alfabetizacao"]'::jsonb, 'individual', false,
    'A4', 'PDF'
  )
) as new_products(
  name, slug, description, price, original_price,
  image_url, images, download_url, category_id,
  active, featured, tags, product_type, is_kit,
  page_size, paper_type
)
where not exists (
  select 1 from public.products p where p.slug = new_products.slug
);


-- ─── Vitrine da home (setting homeSections) ───────────────────────
insert into public.settings (setting_key, setting_value)
values (
  'homeSections',
  '{
    "sections": [
      { "type": "best_sellers",  "title": "Mais vendidos", "limit": 8,  "enabled": true },
      { "type": "category",      "title": "Festa Junina",  "limit": 8,  "enabled": true },
      { "type": "category",      "title": "Formatura",     "limit": 8,  "enabled": true },
      { "type": "new_arrivals",  "title": "Novidades",     "limit": 8,  "enabled": true }
    ]
  }'::jsonb
)
on conflict (setting_key) do update
  set setting_value = excluded.setting_value;

-- Atualiza categoryId real nas seções (precisa rodar depois das categorias)
update public.settings
set setting_value = jsonb_set(
  setting_value,
  '{sections}',
  (
    select jsonb_agg(
      case
        when (s ->> 'type') = 'category' and (s ->> 'title') = 'Festa Junina'
          then s || jsonb_build_object('categoryId', (select id::text from public.categories where slug = 'festa-junina'))
        when (s ->> 'type') = 'category' and (s ->> 'title') = 'Formatura'
          then s || jsonb_build_object('categoryId', (select id::text from public.categories where slug = 'formatura'))
        else s
      end
    )
    from jsonb_array_elements(setting_value -> 'sections') as s
  )
)
where setting_key = 'homeSections';


-- ─── Verificação ──────────────────────────────────────────────────
select
  'categorias' as tabela, count(*) as total from public.categories
union all
select
  'produtos',    count(*) from public.products
union all
select
  'home sections', jsonb_array_length(setting_value->'sections')
  from public.settings where setting_key='homeSections';
