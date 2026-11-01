-- Regra de devolução por download (Termos, seção 7):
--   • até 7 dias da aprovação e nenhum download → desistência simples;
--   • já baixou, ou passou de 7 dias → solicitação de suporte, com motivo.
-- O fluxo é decidido no servidor (handlers/refund-request.js) e gravado aqui
-- junto com a prova do momento do pedido: quando foi o primeiro download e
-- quantos houve. A loja reembolsa manualmente nos dois casos.
alter table public.refund_requests
  add column if not exists reason_category text
    check (reason_category is null
           or reason_category in ('desistencia', 'nao_abre', 'defeito', 'diferente_do_anunciado', 'outro')),
  add column if not exists flow text not null default 'simple'
    check (flow in ('simple', 'support')),
  add column if not exists first_download_at timestamptz,
  add column if not exists download_count integer not null default 0
    check (download_count >= 0);

-- Aceite da caixa de ciência do checkout ("o download é liberado na hora e,
-- depois de baixar, a devolução vale para defeito ou produto diferente do
-- anunciado"). Sem ele o create-payment recusa o pedido; pedidos antigos
-- ficam null.
alter table public.orders
  add column if not exists download_terms_accepted_at timestamptz;
