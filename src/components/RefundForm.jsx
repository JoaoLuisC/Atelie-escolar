import PropTypes from 'prop-types';
import { formatDate, formatDateTime } from '../utils/date';

// Formulário de devolução em "Meus produtos" (Termos, seção 7). O servidor
// decide o fluxo (lib/refund-policy.js) e o GET de /api/refund-request o
// devolve por pedido; aqui só se escolhe qual tela mostrar.
//   • simple  — até 7 dias e nenhum download: desistência, motivo opcional;
//   • support — já baixou ou passou de 7 dias: categoria + descrição.

export const SUPPORT_REASONS = [
  { value: 'nao_abre', label: 'O arquivo não abre' },
  { value: 'defeito', label: 'O arquivo tem defeito (incompleto, ilegível, corrompido)' },
  { value: 'diferente_do_anunciado', label: 'É diferente do que foi anunciado' },
  { value: 'outro', label: 'Outro problema' },
];
const MIN_DESCRIPTION = 20;

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 p-2';

export function RefundForm({
  orderId,
  eligibility,
  category,
  reason,
  phone,
  pending,
  onCategoryChange,
  onReasonChange,
  onPhoneChange,
  onSubmit,
  onCancel,
}) {
  const support = eligibility?.flow === 'support';

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
      {support ? (
        <>
          <h5 className="font-semibold text-slate-900">Suporte para o pedido #{orderId}</h5>
          <p role="note" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            {eligibility?.flowReason === 'downloaded' && eligibility?.firstDownloadAt
              ? `O arquivo deste pedido já foi baixado em ${formatDateTime(eligibility.firstDownloadAt)}.`
              : `O prazo de desistência de 7 dias terminou em ${formatDate(eligibility?.deadline)}.`}{' '}
            Conte o que aconteceu: a loja tenta resolver primeiro (reenviar, corrigir ou trocar o
            arquivo) e devolve o valor se não houver solução ou se o produto for diferente do
            anunciado. Resposta em até 5 dias úteis.
          </p>
          <label className="block text-sm text-slate-700">
            O que aconteceu?
            <select
              required
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              className={INPUT}
            >
              <option value="">Escolha uma opção</option>
              {SUPPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            Descreva o problema
            <textarea
              required
              minLength={MIN_DESCRIPTION}
              maxLength={2000}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              className={INPUT}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Ao menos {MIN_DESCRIPTION} caracteres (ex.: qual arquivo, o que aparece ao abrir).
            </span>
          </label>
        </>
      ) : (
        <>
          <h5 className="font-semibold text-slate-900">Desistir da compra do pedido #{orderId}</h5>
          <p className="text-xs text-slate-600">
            Você ainda não baixou nenhum arquivo deste pedido e está no prazo de 7 dias
            {eligibility?.deadline ? ` (até ${formatDate(eligibility.deadline)})` : ''}. Não precisa
            justificar: a loja devolve o valor pelo Mercado Pago, no mesmo meio de pagamento.
          </p>
          <label className="block text-sm text-slate-700">
            Motivo (opcional)
            <textarea
              maxLength={2000}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              className={INPUT}
            />
          </label>
        </>
      )}
      <label className="block text-sm text-slate-700">
        Telefone (opcional)
        <input
          type="tel"
          value={phone}
          maxLength={40}
          onChange={(event) => onPhoneChange(event.target.value)}
          className={INPUT}
        />
      </label>
      <div className="flex gap-2">
        <button
          disabled={pending}
          type="submit"
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Enviando…' : support ? 'Enviar pedido de suporte' : 'Confirmar desistência'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

RefundForm.propTypes = {
  orderId: PropTypes.string.isRequired,
  eligibility: PropTypes.shape({
    flow: PropTypes.oneOf(['simple', 'support']),
    flowReason: PropTypes.string,
    deadline: PropTypes.string,
    firstDownloadAt: PropTypes.string,
  }),
  category: PropTypes.string.isRequired,
  reason: PropTypes.string.isRequired,
  phone: PropTypes.string.isRequired,
  pending: PropTypes.bool.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
  onReasonChange: PropTypes.func.isRequired,
  onPhoneChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
