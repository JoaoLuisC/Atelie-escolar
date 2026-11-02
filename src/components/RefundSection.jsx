import { useState } from 'react';
import PropTypes from 'prop-types';
import { RefundForm } from './RefundForm';
import { requestRefund } from '../services/downloads';
import { useToast } from '../hooks/useToast';

export const REFUND_STATUS_LABELS = {
  open: 'aberta',
  contacted: 'em conversa',
  accepted: 'aceita',
  declined: 'não aceita',
  resolved: 'resolvida',
};

/**
 * Devolução de UM pedido aprovado, dentro do pedido aberto em Meus produtos:
 * situação da solicitação existente, ou o botão (desistir / pedir suporte,
 * conforme o fluxo que o servidor decidiu) e o formulário. O recibo vem da
 * resposta do servidor (`flow`, `alreadyRequested`), não do que a tela achava.
 */
export function RefundSection({ orderCode, internalOrderId, refunds }) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState('');

  const existing = refunds.requestFor(internalOrderId);
  const eligibility = refunds.eligibilityFor(orderCode);
  const support = eligibility?.flow === 'support';

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    try {
      const data = await requestRefund({
        orderId: orderCode,
        reasonCategory: support ? category : 'desistencia',
        reason,
        phone,
      });
      if (data.alreadyRequested) {
        setReceipt(`O pedido #${orderCode} já tem uma solicitação em andamento.`);
      } else if (data.flow === 'support') {
        setReceipt(
          `Pedido de suporte do pedido #${orderCode} recebido. A loja responde em até 5 dias úteis pelo e-mail da conta.`,
        );
      } else {
        setReceipt(
          `Desistência do pedido #${orderCode} registrada. A loja faz o reembolso pelo Mercado Pago e avisa pelo e-mail da conta.`,
        );
      }
      setOpen(false);
      setCategory('');
      setReason('');
      setPhone('');
      refunds.reload();
    } catch (error) {
      pushToast(error?.message || 'Não foi possível registrar a solicitação.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      {existing ? (
        <p className="text-sm text-slate-700">
          <strong className="text-violet-700">
            Devolução {REFUND_STATUS_LABELS[existing.status] || existing.status}.
          </strong>
          {existing.admin_response
            ? ` Resposta da loja: ${existing.admin_response}`
            : ' A loja responde pelo e-mail da sua conta e aqui mesmo.'}
        </p>
      ) : receipt ? (
        <p role="status" className="text-sm text-emerald-800">
          {receipt}
        </p>
      ) : refunds.loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="text-sm text-rose-700">
            Não foi possível verificar o prazo de devolução deste pedido.
          </p>
          <button
            type="button"
            onClick={() => refunds.reload()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Tentar de novo
          </button>
        </div>
      ) : open ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {support
              ? 'Problema com o arquivo? Peça suporte ou devolução.'
              : 'Mudou de ideia? Você pode desistir desta compra.'}
          </p>
          <button
            type="button"
            disabled={!refunds.loaded}
            onClick={() => {
              setReceipt('');
              setCategory('');
              setReason('');
              setPhone('');
              setOpen(true);
            }}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
          >
            {support ? 'Pedir suporte ou devolução' : 'Desistir da compra'}
          </button>
        </div>
      )}
      {open ? (
        <RefundForm
          orderId={orderCode}
          eligibility={eligibility}
          category={category}
          reason={reason}
          phone={phone}
          pending={pending}
          onCategoryChange={setCategory}
          onReasonChange={setReason}
          onPhoneChange={setPhone}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

RefundSection.propTypes = {
  orderCode: PropTypes.string.isRequired,
  internalOrderId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  refunds: PropTypes.shape({
    requestFor: PropTypes.func.isRequired,
    eligibilityFor: PropTypes.func.isRequired,
    reload: PropTypes.func.isRequired,
    loadError: PropTypes.string,
    loaded: PropTypes.bool,
  }).isRequired,
};
