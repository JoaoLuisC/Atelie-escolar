import PropTypes from 'prop-types';
import { useEffect, useId, useState } from 'react';
import { formatPrice } from '../../../utils/currency';
import { formatRatio } from '../../../utils/number';
import { fetchAdminKpis } from '../../../services/admin-panel';
import { Card } from '../ui/Card';
import { StatusChip } from '../ui/StatusChip';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { formatDateTime } from '../../../utils/date';
import {
  donutArcPath,
  donutSegments,
  formatPct,
  revenueChartGeometry,
  sparklineGeometry,
} from './dashboard-charts';

const CURVE_STYLES = {
  A: {
    label: 'A',
    desc: '80% da receita',
    chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    bar: 'from-emerald-500 to-emerald-400',
  },
  B: {
    label: 'B',
    desc: '15% da receita',
    chip: 'bg-amber-100 text-amber-700 ring-amber-200',
    bar: 'from-amber-500 to-amber-400',
  },
  C: {
    label: 'C',
    desc: '5% da receita',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    bar: 'from-slate-400 to-slate-300',
  },
};

function TrendBadge({ trend, pct }) {
  if (!trend || trend === 'stable') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        <i className="bi bi-dash" />
        estável
      </span>
    );
  }
  const isUp = trend === 'up';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
      }`}
    >
      <i className={`bi bi-arrow-${isUp ? 'up' : 'down'}-right`} />
      {formatPct(pct)}
    </span>
  );
}

TrendBadge.propTypes = {
  trend: PropTypes.oneOf(['up', 'down', 'stable']),
  pct: PropTypes.number,
};

function Sparkline({ values = [], accent = '#7c3aed' }) {
  const gradientId = useId();
  const geometria = sparklineGeometry(values);
  if (!geometria) return null;
  const { points, areaPath } = geometria;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full">
      <defs>
        <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={accent}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

Sparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  accent: PropTypes.string,
};

function HeroCard({
  label,
  value,
  icon,
  accent = 'primary',
  delta = null,
  sparkline = null,
  hint = null,
}) {
  const accents = {
    primary: {
      bg: 'from-violet-500/15 via-white to-white',
      ring: 'ring-violet-200',
      icon: 'bg-violet-100 text-violet-700',
      spark: '#7c3aed',
    },
    success: {
      bg: 'from-emerald-500/15 via-white to-white',
      ring: 'ring-emerald-200',
      icon: 'bg-emerald-100 text-emerald-700',
      spark: '#059669',
    },
    info: {
      bg: 'from-sky-500/15 via-white to-white',
      ring: 'ring-sky-200',
      icon: 'bg-sky-100 text-sky-700',
      spark: '#0284c7',
    },
    warning: {
      bg: 'from-amber-500/15 via-white to-white',
      ring: 'ring-amber-200',
      icon: 'bg-amber-100 text-amber-700',
      spark: '#d97706',
    },
    neutral: {
      bg: 'from-slate-500/10 via-white to-white',
      ring: 'ring-slate-200',
      icon: 'bg-slate-100 text-slate-700',
      spark: '#475569',
    },
  };
  const tone = accents[accent] || accents.primary;
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br ${tone.bg} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-widest text-slate-500">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-extrabold text-slate-900 sm:text-3xl">
            {value}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
            {delta ? <TrendBadge trend={delta.trend} pct={delta.pct} /> : null}
            {hint ? <span className="truncate">{hint}</span> : null}
          </div>
        </div>
        {icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${tone.icon} ${tone.ring}`}
          >
            <i className={`bi bi-${icon} text-lg`} />
          </span>
        ) : null}
      </header>
      {sparkline && sparkline.length ? (
        <div className="mt-3">
          <Sparkline values={sparkline} accent={tone.spark} />
        </div>
      ) : null}
    </article>
  );
}

HeroCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string,
  accent: PropTypes.oneOf(['primary', 'success', 'info', 'warning', 'neutral']),
  delta: PropTypes.shape({ trend: PropTypes.string, pct: PropTypes.number }),
  sparkline: PropTypes.arrayOf(PropTypes.number),
  hint: PropTypes.string,
};

function MiniStat({ label, value, icon, accent = 'neutral' }) {
  const tones = {
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-sky-50 text-sky-700',
    neutral: 'bg-slate-50 text-slate-700',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[accent] || tones.neutral}`}
      >
        <i className={`bi bi-${icon}`} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="truncate text-base font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

MiniStat.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string.isRequired,
  accent: PropTypes.oneOf(['success', 'warning', 'info', 'neutral']),
};

function RevenueLineChart({ entries }) {
  const gradientId = useId();
  if (!entries || entries.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">Sem vendas registradas no período.</p>
    );
  }

  const width = 100;
  const height = 100;
  const { points, linePath, areaPath } = revenueChartGeometry(entries, { width, height });

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-44 w-full">
          <defs>
            <linearGradient id={`revenue-area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              x2={width}
              y1={height * ratio}
              y2={height * ratio}
              stroke="#e2e8f0"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={areaPath} fill={`url(#revenue-area-${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="#7c3aed"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p) => (
            <circle
              key={`${p.x}-${p.y}`}
              cx={p.x}
              cy={p.y}
              r="1.6"
              fill="#7c3aed"
              stroke="#fff"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500">
        {entries.map((entry) => (
          <div key={entry.label} className="truncate">
            <div>{entry.label}</div>
            <div className="mt-0.5 truncate font-semibold text-slate-700">
              {formatPrice(entry.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

RevenueLineChart.propTypes = {
  entries: PropTypes.array,
};

function CategoryDonut({ entries }) {
  if (!entries || entries.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem dados de categoria.</p>;
  }

  const { total, segments } = donutSegments(entries);
  const arcPath = (startAngle, endAngle) => donutArcPath(startAngle, endAngle);
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[140px_1fr]">
      <div className="relative">
        <svg viewBox="0 0 100 100" className="h-32 w-32 sm:h-36 sm:w-36">
          {segments.map((segment) => (
            <path
              key={segment.label}
              d={arcPath(segment.startAngle, segment.endAngle)}
              fill={segment.color}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Total
          </span>
          <span className="text-sm font-bold text-slate-900">{formatPrice(total)}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: segment.color }}
              />
              <span className="truncate text-slate-700">{segment.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-900">
              {Math.round(segment.sharePct)}%
              <span className="ml-1 text-xs font-normal text-slate-500">
                {formatPrice(segment.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

CategoryDonut.propTypes = {
  entries: PropTypes.array,
};

function CustomerMixCard({ mix }) {
  const total = Math.max(1, mix.total);
  const recurringPct = Math.round((mix.recurring / total) * 100);
  const newPct = 100 - recurringPct;
  return (
    <Card title="Mix de clientes" subtitle="Novos vs recorrentes (compras aprovadas)">
      <div className="flex flex-col gap-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-gradient-to-r from-violet-500 to-violet-400"
            style={{ width: `${recurringPct}%` }}
          />
          <div
            className="bg-gradient-to-r from-sky-400 to-sky-300"
            style={{ width: `${newPct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-violet-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              Recorrentes
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-900">{mix.recurring}</p>
            <p className="text-xs text-violet-700">{recurringPct}% dos compradores</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Novos</p>
            <p className="mt-1 text-2xl font-bold text-sky-900">{mix.newCustomers}</p>
            <p className="text-xs text-sky-700">{newPct}% dos compradores</p>
          </div>
        </div>
        {mix.inactive > 0 ? (
          <p className="text-xs text-slate-500">
            <i className="bi bi-info-circle mr-1" />
            {mix.inactive} cadastros ainda sem nenhuma compra aprovada.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

CustomerMixCard.propTypes = {
  mix: PropTypes.shape({
    total: PropTypes.number,
    recurring: PropTypes.number,
    newCustomers: PropTypes.number,
    recurringPct: PropTypes.number,
    inactive: PropTypes.number,
  }).isRequired,
};

function AbcCurveCard({ abc }) {
  const items = abc?.items || [];
  if (!items.length) {
    return (
      <Card
        title="Curva ABC"
        subtitle="Classifica produtos por participação no faturamento (Pareto 80/15/5)"
      >
        <EmptyState
          icon="bar-chart"
          title="Sem vendas para classificar"
          description="A curva ABC aparece quando houver pedidos aprovados com produtos identificados."
        />
      </Card>
    );
  }
  const top = items.slice(0, 8);
  return (
    <Card title="Curva ABC" subtitle="Top produtos ordenados por receita (princípio de Pareto)">
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        {['A', 'B', 'C'].map((curve) => {
          const style = CURVE_STYLES[curve];
          return (
            <div key={curve} className={`rounded-xl px-3 py-2 ring-1 ${style.chip}`}>
              <p className="text-lg font-bold leading-none">{abc.summary?.[curve] || 0}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                Classe {style.label}
              </p>
              <p className="text-[10px] opacity-80">{style.desc}</p>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-col gap-2.5">
        {top.map((item) => {
          const style = CURVE_STYLES[item.curve];
          return (
            <li key={item.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${style.chip}`}
                  >
                    {style.label}
                  </span>
                  <span className="truncate font-medium text-slate-700">
                    <span className="text-slate-400">#{item.rank}</span> {item.name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold text-slate-900">{formatPrice(item.rev)}</span>
                  <span className="ml-2 text-xs text-slate-500">{Math.round(item.sharePct)}%</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full bg-gradient-to-r ${style.bar}`}
                  style={{ width: `${Math.max(6, Math.min(100, item.sharePct))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > top.length ? (
        <p className="mt-3 text-xs text-slate-500">
          + {items.length - top.length} produtos restantes na cauda C.
        </p>
      ) : null}
    </Card>
  );
}

AbcCurveCard.propTypes = {
  abc: PropTypes.object,
};

function PendingDataCard({ title, icon, message, hint }) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
          <i className={`bi bi-${icon}`} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-700">{title}</h2>
          <p className="text-xs text-slate-500">Instrumentação pendente</p>
        </div>
      </div>
      <p className="text-sm text-slate-600">{message}</p>
      {hint ? (
        <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">
          <i className="bi bi-lightbulb mr-1 text-amber-500" />
          {hint}
        </p>
      ) : null}
    </section>
  );
}

PendingDataCard.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  hint: PropTypes.string,
};

export function DashboardTab({
  summary,
  dailyRevenue,
  categoryRevenue,
  recentOrders,
  ticketMedio,
  customerMix,
  abcCurve,
  comparisonDelta,
  sparkline,
  onOpenOrder,
}) {
  const safeSummary = summary || {};
  const monthDelta = comparisonDelta || { pct: 0, trend: 'stable' };
  const ticket = ticketMedio || { value: 0, pct: 0, trend: 'stable', qty: 0 };
  const mix = customerMix || {
    total: 0,
    newCustomers: 0,
    recurring: 0,
    recurringPct: 0,
    inactive: 0,
  };

  // KPIs avançados (LTV, recompra, LTV/CAC) — carregados sob demanda
  // para não bloquear o render do resto do dashboard.
  const [advancedKpis, setAdvancedKpis] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchAdminKpis({ window: 12 })
      .then((data) => {
        if (!cancelled) setAdvancedKpis(data?.kpis || null);
      })
      .catch(() => {
        if (!cancelled) setAdvancedKpis(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Hero KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeroCard
          label="Faturamento do mês"
          value={formatPrice(safeSummary.revenueMonth || 0)}
          icon="cash-stack"
          accent="success"
          delta={monthDelta}
          sparkline={sparkline}
          hint="vs mês anterior"
        />
        <HeroCard
          label="Ticket médio"
          value={formatPrice(ticket.value)}
          icon="receipt-cutoff"
          accent="primary"
          delta={{ trend: ticket.trend, pct: ticket.pct }}
          hint={ticket.qty ? `${ticket.qty} pedidos no mês` : 'sem pedidos no mês'}
        />
        <HeroCard
          label="Pedidos aprovados"
          value={safeSummary.approvedOrders || 0}
          icon="bag-check"
          accent="info"
          hint={`${safeSummary.pendingOrders || 0} pendentes`}
        />
        <HeroCard
          label="Clientes recorrentes"
          value={mix.recurring}
          icon="people-fill"
          accent="warning"
          hint={`${mix.recurringPct}% dos compradores`}
        />
      </div>

      {/* Secondary mini stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label="Receita total"
          value={formatPrice(safeSummary.revenueTotal || 0)}
          icon="bank2"
          accent="info"
        />
        <MiniStat
          label="Produtos ativos"
          value={safeSummary.activeProducts || 0}
          icon="box-seam"
          accent="success"
        />
        <MiniStat
          label="Pendentes"
          value={safeSummary.pendingOrders || 0}
          icon="hourglass-split"
          accent="warning"
        />
        <MiniStat
          label="Clientes cadastrados"
          value={safeSummary.totalUsers || 0}
          icon="people"
          accent="neutral"
        />
      </div>

      {/* KPIs avançados (Fase 4) — LTV, recompra, LTV/CAC ratio */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label="LTV médio (12m)"
          value={advancedKpis ? formatPrice(advancedKpis.ltvAvg) : '—'}
          icon="cash-coin"
          accent="info"
        />
        <MiniStat
          label="Taxa de recompra"
          value={advancedKpis ? `${Math.round(advancedKpis.repurchaseRate)}%` : '—'}
          icon="arrow-repeat"
          accent="success"
        />
        <MiniStat
          label="Ticket médio (12m)"
          value={advancedKpis ? formatPrice(advancedKpis.ticketMedio) : '—'}
          icon="receipt"
          accent="neutral"
        />
        <MiniStat
          label="LTV / CAC"
          value={advancedKpis?.ltvCacRatio ? formatRatio(advancedKpis.ltvCacRatio) : 'Fase 5'}
          icon="speedometer2"
          accent={advancedKpis?.ltvCacRatio >= 3 ? 'success' : 'warning'}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card title="Receita dos últimos 7 dias" subtitle="Pedidos aprovados por dia">
            <RevenueLineChart entries={dailyRevenue} />
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card title="Receita por categoria" subtitle="Top 5 categorias">
            <CategoryDonut entries={categoryRevenue} />
          </Card>
        </div>
      </div>

      {/* ABC + customer mix */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AbcCurveCard abc={abcCurve} />
        </div>
        <div className="lg:col-span-2">
          <CustomerMixCard mix={mix} />
        </div>
      </div>

      {/* Placeholders for KPIs requiring backend instrumentation */}
      <div className="grid gap-5 lg:grid-cols-2">
        <PendingDataCard
          title="Vendas por região"
          icon="geo-alt"
          message="O mapa de pedidos por estado aparecerá aqui assim que o checkout passar a coletar o UF do cliente."
          hint="Adicione a coluna shipping_state na tabela orders e capture o estado no formulário de checkout para destravar este painel."
        />
        <PendingDataCard
          title="Funil de conversão"
          icon="funnel"
          message="Visitas → carrinho → checkout → pagamento. Requer rastreamento de eventos no front."
          hint="Instrumentar eventos page_view, add_to_cart, begin_checkout e purchase (ex.: tabela page_views) para construir o funil."
        />
      </div>

      {/* Recent orders */}
      <Card title="Pedidos recentes" subtitle="Últimos 8 pedidos">
        {recentOrders.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Nenhum pedido recente"
            description="Os pedidos aparecerão aqui assim que forem criados."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Pedido</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentOrders.map((order) => (
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
                      <Button variant="secondary" size="sm" onClick={() => onOpenOrder(order)}>
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

DashboardTab.propTypes = {
  summary: PropTypes.object,
  dailyRevenue: PropTypes.array.isRequired,
  categoryRevenue: PropTypes.array.isRequired,
  recentOrders: PropTypes.array.isRequired,
  ticketMedio: PropTypes.shape({
    value: PropTypes.number,
    pct: PropTypes.number,
    trend: PropTypes.string,
    qty: PropTypes.number,
  }),
  customerMix: PropTypes.shape({
    total: PropTypes.number,
    newCustomers: PropTypes.number,
    recurring: PropTypes.number,
    recurringPct: PropTypes.number,
    inactive: PropTypes.number,
  }),
  abcCurve: PropTypes.object,
  comparisonDelta: PropTypes.shape({
    pct: PropTypes.number,
    trend: PropTypes.string,
  }),
  sparkline: PropTypes.arrayOf(PropTypes.number),
  onOpenOrder: PropTypes.func.isRequired,
};
