-- Visibilidade dos buckets do Storage declarada no banco, não só no código.
--
-- product_files é conteúdo PAGO: privado sempre, entregue só por URL assinada
-- depois do token de download (handlers/download.js). product_images e
-- product_videos são mídia da vitrine: públicos, para a página do produto
-- carregar <img>/<video> sem sessão. Antes, só handlers/admin/upload-url.js
-- convergia isso no primeiro upload; se aquela chamada falhasse, o vídeo não
-- tocava e nada avisava.
insert into storage.buckets (id, name, public)
values
  ('product_files', 'product_files', false),
  ('product_images', 'product_images', true),
  ('product_videos', 'product_videos', true)
on conflict (id) do update set public = excluded.public;
