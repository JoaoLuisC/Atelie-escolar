-- Limites dos buckets declarados no banco, iguais aos de
-- handlers/admin/upload-url.js (BUCKETS). Antes só o primeiro upload de cada
-- cold start aplicava isso por PUT na API de buckets; se a chamada falhasse, o
-- bucket ficava sem teto e sem lista de tipos — e um erro do Storage aparecia
-- no painel como "Upload falhou (HTTP 400)", sem motivo.
--
-- 50 MB é o teto de arquivo do plano atual do Supabase; vídeo maior vai pelo
-- YouTube (o painel aceita o link). `application/octet-stream` entra porque o
-- navegador nem sempre reconhece o tipo e o painel só manda Content-Type
-- quando reconhece.
update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
         'application/octet-stream'
       ]
 where id = 'product_images';

update storage.buckets
   set file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = array[
         'video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream'
       ]
 where id = 'product_videos';

update storage.buckets
   set file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = null
 where id = 'product_files';
