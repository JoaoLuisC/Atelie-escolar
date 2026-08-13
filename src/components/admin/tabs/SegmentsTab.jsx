import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { fetchAdminSegments } from '../../../services/admin-panel';

const TAG_LABELS = {
  cliente_ativo: { label: 'Cliente ativo', color: 'emerald', hint: 'Comprou nos últimos 90 dias' },
  cliente_recorrente: { label: 'Recorrente', color: 'sky', hint: '2 ou mais pedidos aprovados' },
  cliente_vip: { label: 'VIP', color: 'amber', hint: '5+ pedidos OU LTV alto' },
  inativo_30d: { label: 'Inativo 30d', color: 'slate', hint: 'Último pedido entre 30-89 dias' },
  inativo_90d: {
    label: 'Inativo 90d (reativar)',
    color: 'rose',
    hint: 'Janela ideal para cupom de reativação',
  },
  inativo_180d: { label: 'Inativo 180d+', color: 'slate', hint: 'NÃO enviar marketing (regra D7)' },
};

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-800 ring-rose-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

function formatTagLabel(tag) {
  if (tag.startsWith('categoria:')) {
    return {
      label: `Comprou: ${tag.slice('categoria:'.length)}`,
      color: 'violet',
      hint: 'Por categoria comprada',
    };
  }
  return TAG_LABELS[tag] || { label: tag, color: 'slate', hint: '' };
}

export function SegmentsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminSegments()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar segmentação.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <i className="bi bi-arrow-clockwise mr-2 animate-spin" /> Calculando segmentos…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const byTag = data.byTag || {};
  const sortedTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Inscritos totais
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {(data.totalSubscribers || 0).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Confirmados
          </p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">
            {(data.confirmedCount || 0).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Aguardando opt-in
          </p>
          <p className="mt-2 text-2xl font-extrabold text-amber-700">
            {(data.pendingConfirmation || 0).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Cancelaram
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-700">
            {(data.unsubscribedCount || 0).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <Card
        title="Tags por número de assinantes"
        subtitle="Use para definir público de campanhas (regra D5: segmentação por categoria, nunca por nome)."
      >
        {sortedTags.length === 0 ? (
          <EmptyState
            icon="tags"
            title="Sem assinantes classificados ainda"
            description="Tags ficam disponíveis quando há pedidos aprovados ou inscritos confirmados."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedTags.map(([tag, count]) => {
              const meta = formatTagLabel(tag);
              const tone = TONE[meta.color] || TONE.slate;
              return (
                <li key={tag} className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${tone}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{meta.label}</p>
                    {meta.hint ? <p className="mt-0.5 text-xs opacity-75">{meta.hint}</p> : null}
                  </div>
                  <span className="shrink-0 text-lg font-extrabold">
                    {count.toLocaleString('pt-BR')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Gerado em {new Date(data.generatedAt || Date.now()).toLocaleString('pt-BR')}. Cache de 30
        min. Adicione <code>?nocache=1</code> à URL para forçar recálculo.
      </p>
    </div>
  );
}
