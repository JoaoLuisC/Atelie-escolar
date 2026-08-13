import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { fetchAdminFunnel } from '../../../services/admin-panel';
import { formatPrice } from '../../../utils/currency';

const RANGE_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

function formatPct(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '—';
  const value = ratio * 100;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}%`;
}

function FunnelBar({ step, maxCount }) {
  const widthPct = maxCount > 0 ? Math.max(6, Math.round((step.count / maxCount) * 100)) : 6;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-slate-700">{step.label}</span>
        <span className="shrink-0 text-right">
          <span className="font-bold text-slate-900">{step.count.toLocaleString('pt-BR')}</span>
          <span className="ml-2 text-xs text-slate-500">
            conv. {formatPct(step.conversionFromPrevious)}
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-violet-400"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </li>
  );
}

FunnelBar.propTypes = {
  step: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
    conversionFromPrevious: PropTypes.number,
  }).isRequired,
  maxCount: PropTypes.number.isRequired,
};

function AttributionTable({ items }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="bullseye"
        title="Sem pedidos atribuídos"
        description="Compras aprovadas com UTM aparecerão aqui."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Origem</th>
            <th className="px-3 py-2 text-right">Pedidos</th>
            <th className="px-3 py-2 text-right">Receita</th>
            <th className="px-3 py-2 text-right">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((entry) => (
            <tr key={entry.source} className="hover:bg-slate-50/60">
              <td className="px-3 py-2">
                <div className="font-semibold text-slate-800">{entry.source}</div>
                {entry.details?.length ? (
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {entry.details
                      .slice(0, 3)
                      .map((d) => `${d.medium || '—'} · ${d.campaign || '—'}`)
                      .join(' • ')}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">
                {entry.orders.toLocaleString('pt-BR')}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                {formatPrice(entry.revenue)}
              </td>
              <td className="px-3 py-2 text-right text-xs text-slate-600">
                {Math.round(entry.sharePct)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

AttributionTable.propTypes = {
  items: PropTypes.array,
};

export function FunnelTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const response = await fetchAdminFunnel(days);
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Erro ao carregar funil.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const funnel = data?.funnel || [];
  const maxCount = funnel.reduce((max, step) => (step.count > max ? step.count : max), 0);
  const totals = data?.totals || { sessions: 0, events: 0, approvedOrders: 0, revenue: 0 };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Funil de conversão
          </p>
          <p className="text-sm text-slate-700">Sessões únicas por etapa nos últimos {days} dias</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDays(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                days === option.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Sessões únicas
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {totals.sessions.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Eventos registrados
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {totals.events.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Compras aprovadas
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {totals.approvedOrders.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Receita no período
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {formatPrice(totals.revenue)}
          </p>
        </div>
      </div>

      <Card
        title="Funil canônico"
        subtitle="Cada barra mostra sessões únicas que dispararam o evento; conv. = taxa em relação à etapa anterior."
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            <i className="bi bi-arrow-clockwise mr-2 animate-spin" />
            Carregando funil…
          </p>
        ) : funnel.length === 0 || maxCount === 0 ? (
          <EmptyState
            icon="funnel"
            title="Sem eventos no período"
            description="Os trackers começarão a alimentar este funil assim que clientes navegarem com a Fase 0 ativa."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {funnel.map((step) => (
              <FunnelBar key={step.key} step={step} maxCount={maxCount} />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Atribuição por UTM source"
        subtitle="Receita aprovada com first-touch via UTM. 'direct' = sem UTM."
      >
        <AttributionTable items={data?.attribution?.items || []} />
      </Card>
    </div>
  );
}

FunnelTab.propTypes = {};
