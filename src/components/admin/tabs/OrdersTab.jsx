import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { fetchRefundRequests, updateRefundRequest } from '../../../services/admin-panel';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/StatusChip';
import { EmptyState } from '../ui/EmptyState';
import { formatDateTime } from '../../../utils/date';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'pending', label: 'Pendente' },
  { value: 'rejected', label: 'Recusado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'failed', label: 'Falhou' },
];

// Rótulos do motivo e do fluxo (lib/refund-policy.js decide o fluxo no servidor).
const REASON_LABELS = {
  desistencia: 'Desistência',
  nao_abre: 'O arquivo não abre',
  defeito: 'Arquivo com defeito',
  diferente_do_anunciado: 'Diferente do anunciado',
  outro: 'Outro',
};
const FLOW_LABELS = {
  simple: 'Desistência simples (até 7 dias, sem download)',
  support: 'Suporte (já baixou ou passou de 7 dias)',
};

/** "Nunca baixou" ou "Baixou em dd/mm hh:mm · N downloads · IP". */
export function downloadProofText(item) {
  const count = Number(item?.download_count || 0);
  if (!count || !item?.first_download_at) return 'Nunca baixou';
  const parts = [`Baixou em ${formatDateTime(item.first_download_at)}`];
  parts.push(`${count} download${count === 1 ? '' : 's'}`);
  if (item.firstDownloadIp) parts.push(`IP ${item.firstDownloadIp}`);
  return parts.join(' · ');
}

export function OrdersTab({ orders, statusFilter, onStatusFilterChange, onOpenOrder }) {
  const [refunds, setRefunds] = useState([]);
  const [refundError, setRefundError] = useState('');
  const [refundEdits, setRefundEdits] = useState({});
  const [savingRefund, setSavingRefund] = useState('');
  useEffect(() => {
    let active = true;
    fetchRefundRequests()
      .then((data) => {
        if (active) {
          const list = data.requests || [];
          setRefunds(list);
          setRefundEdits(
            Object.fromEntries(
              list.map((item) => [
                item.id,
                { status: item.status, response: item.admin_response || '' },
              ]),
            ),
          );
        }
      })
      .catch(() => {
        if (active) setRefundError('Não foi possível carregar as solicitações de devolução.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveRefund(item) {
    const edit = refundEdits[item.id] || { status: item.status, response: '' };
    setSavingRefund(item.id);
    setRefundError('');
    try {
      await updateRefundRequest({ id: item.id, ...edit });
      setRefunds((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: edit.status, admin_response: edit.response }
            : entry,
        ),
      );
    } catch (error) {
      setRefundError(error?.message || 'Não foi possível salvar a solicitação.');
    } finally {
      setSavingRefund('');
    }
  }
  return (
    <div className="space-y-4">
      <Card
        title="Solicitações de devolução"
        subtitle="Pedidos recebidos; entre em contato para tratar cada solicitação."
      >
        {refundError ? (
          <p role="alert" className="text-sm text-rose-700">
            {refundError}
          </p>
        ) : null}
        {!refundError && refunds.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma solicitação encontrada.</p>
        ) : null}
        <ul className="space-y-3">
          {refunds.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <strong>Pedido #{item.order?.order_code}</strong>
              <p>
                {item.order?.customer_name || 'Cliente'} · {item.order?.customer_email}
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {FLOW_LABELS[item.flow] || FLOW_LABELS.simple}
              </p>
              <p>{downloadProofText(item)}</p>
              <p className="mt-1">
                Motivo: {REASON_LABELS[item.reason_category] || 'Não informado'}
                {item.reason ? ` — ${item.reason}` : ''}
              </p>
              <p>Telefone: {item.phone || 'Não informado'}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                <select
                  aria-label={`Status da solicitação ${item.order?.order_code}`}
                  value={refundEdits[item.id]?.status || item.status}
                  onChange={(event) =>
                    setRefundEdits((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] || {}),
                        status: event.target.value,
                      },
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-2 py-2"
                >
                  <option value="open">Aberta</option>
                  <option value="contacted">Em conversa</option>
                  <option value="accepted">Devolução aceita</option>
                  <option value="declined">Não aceita</option>
                  <option value="resolved">Resolvida</option>
                </select>
                <textarea
                  aria-label={`Resposta ao cliente ${item.order?.order_code}`}
                  value={refundEdits[item.id]?.response || ''}
                  onChange={(event) =>
                    setRefundEdits((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] || {}),
                        status: current[item.id]?.status || item.status,
                        response: event.target.value,
                      },
                    }))
                  }
                  maxLength={4000}
                  rows={2}
                  placeholder="Registre a proposta ou resposta ao cliente"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
                <Button
                  size="sm"
                  onClick={() => saveRefund(item)}
                  disabled={savingRefund === item.id}
                >
                  {savingRefund === item.id ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
              {item.order?.customer_email ? (
                <a
                  href={`mailto:${encodeURIComponent(item.order.customer_email)}?subject=${encodeURIComponent(`Solicitação do pedido ${item.order.order_code}`)}`}
                  className="mt-2 inline-block font-semibold text-violet-700 underline"
                >
                  Responder por e-mail
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title="Pedidos"
        subtitle={`${orders.length} pedido(s) no filtro atual`}
        action={
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value)}
            aria-label="Filtrar pedidos por status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
      >
        {orders.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Nenhum pedido"
            description="Nenhum pedido corresponde ao filtro selecionado."
          />
        ) : (
          // overflow-x-auto: no celular o "Detalhes" ficava fora da tela (ADM-40).
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Pedido / Cliente</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">
                        {order.orderId || order.id}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {order.customerEmail || order.customerName || 'Cliente não identificado'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip status={order.paymentStatus} />
                      <div className="mt-1 text-xs text-slate-500">
                        {formatDateTime(order.createdAt)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatPrice(order.totalAmount || 0)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenOrder(order)}
                        aria-label={`Detalhes do pedido ${order.orderId || order.id}`}
                      >
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

OrdersTab.propTypes = {
  orders: PropTypes.array.isRequired,
  statusFilter: PropTypes.string.isRequired,
  onStatusFilterChange: PropTypes.func.isRequired,
  onOpenOrder: PropTypes.func.isRequired,
};
