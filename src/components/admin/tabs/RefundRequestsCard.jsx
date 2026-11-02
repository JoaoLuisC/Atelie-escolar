import { useEffect, useState } from 'react';
import { fetchRefundRequests, updateRefundRequest } from '../../../services/admin-panel';
import { useToast } from '../../../hooks/useToast';
import { formatDateTime } from '../../../utils/date';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { friendlyAdminError } from '../utils/errors';

// Rótulos do motivo e do fluxo (lib/refund-policy.js decide o fluxo no servidor).
export const REASON_LABELS = {
  desistencia: 'Desistência',
  nao_abre: 'O arquivo não abre',
  defeito: 'Arquivo com defeito',
  diferente_do_anunciado: 'Diferente do anunciado',
  outro: 'Outro',
};

export const FLOW_LABELS = {
  simple: 'Desistência simples (até 7 dias, sem download)',
  support: 'Suporte (já baixou ou passou de 7 dias)',
};

// Solicitação gravada antes de o fluxo existir, ou com valor que o painel não
// conhece: dizer "Desistência simples" afirmaria uma regra que não foi aplicada.
const UNKNOWN_FLOW_LABEL = 'Fluxo não registrado';

const STATUS_OPTIONS = [
  ['open', 'Aberta'],
  ['contacted', 'Em conversa'],
  ['accepted', 'Devolução aceita'],
  ['declined', 'Não aceita'],
  ['resolved', 'Resolvida'],
];

/** "Nunca baixou" ou "Baixou em dd/mm/aaaa hh:mm · N downloads · IP x". */
export function downloadProofText(item) {
  const count = Number(item?.download_count || 0);
  if (!count || !item?.first_download_at) return 'Nunca baixou';
  const parts = [`Baixou em ${formatDateTime(item.first_download_at)}`];
  parts.push(`${count} download${count === 1 ? '' : 's'}`);
  if (item.firstDownloadIp) parts.push(`IP ${item.firstDownloadIp}`);
  return parts.join(' · ');
}

function editsFrom(list) {
  return Object.fromEntries(
    list.map((item) => [item.id, { status: item.status, response: item.admin_response || '' }]),
  );
}

export function RefundRequestsCard() {
  const { pushToast } = useToast();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    let active = true;
    fetchRefundRequests()
      .then((data) => {
        if (!active) return;
        const list = data.requests || [];
        setRefunds(list);
        setEdits(editsFrom(list));
      })
      .catch((err) => {
        if (!active) return;
        setError(
          friendlyAdminError(err, 'Não foi possível carregar as solicitações de devolução.'),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function baseEdit(item) {
    return { status: item.status, response: item.admin_response || '' };
  }

  function editOf(item) {
    return edits[item.id] || baseEdit(item);
  }

  function patchEdit(item, patch) {
    setEdits((current) => ({
      ...current,
      [item.id]: { ...(current[item.id] || baseEdit(item)), ...patch },
    }));
  }

  async function save(item) {
    const edit = editOf(item);
    setSavingId(item.id);
    setError('');
    try {
      await updateRefundRequest({ id: item.id, ...edit });
      setRefunds((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: edit.status, admin_response: edit.response }
            : entry,
        ),
      );
      pushToast('Solicitação atualizada.', 'success');
    } catch (err) {
      setError(friendlyAdminError(err, 'Não foi possível salvar a solicitação.'));
    } finally {
      setSavingId('');
    }
  }

  return (
    <Card
      title="Solicitações de devolução"
      subtitle="Pedidos recebidos; entre em contato para tratar cada solicitação."
    >
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">Carregando…</p> : null}
      {!loading && !error && refunds.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma solicitação encontrada.</p>
      ) : null}
      <ul className="space-y-3">
        {refunds.map((item) => {
          const code = item.order?.order_code;
          const edit = editOf(item);
          return (
            <li key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <strong>Pedido #{code}</strong>
              <p>
                {item.order?.customer_name || 'Cliente'} · {item.order?.customer_email}
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {FLOW_LABELS[item.flow] || UNKNOWN_FLOW_LABEL}
              </p>
              <p>{downloadProofText(item)}</p>
              <p className="mt-1">
                Motivo: {REASON_LABELS[item.reason_category] || 'Não informado'}
                {item.reason ? ` — ${item.reason}` : ''}
              </p>
              <p>Telefone: {item.phone || 'Não informado'}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                <select
                  aria-label={`Status da solicitação ${code}`}
                  value={edit.status}
                  onChange={(event) => patchEdit(item, { status: event.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2"
                >
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label={`Resposta ao cliente ${code}`}
                  value={edit.response}
                  onChange={(event) => patchEdit(item, { response: event.target.value })}
                  maxLength={4000}
                  rows={2}
                  placeholder="Registre a proposta ou resposta ao cliente"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
                <Button size="sm" onClick={() => save(item)} disabled={savingId === item.id}>
                  {savingId === item.id ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
              {item.order?.customer_email ? (
                <a
                  href={`mailto:${encodeURIComponent(item.order.customer_email)}?subject=${encodeURIComponent(`Solicitação do pedido ${code}`)}`}
                  className="mt-2 inline-block font-semibold text-violet-700 underline"
                >
                  Responder por e-mail
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
