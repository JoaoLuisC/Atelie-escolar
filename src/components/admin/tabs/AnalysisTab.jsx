import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatCsvNumber } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import {
  fetchAdminAbcCustomers,
  fetchAdminAbcProducts,
  fetchAdminCohort,
} from '../../../services/admin-panel';
import { formatPrice } from '../../../utils/currency';
import { downloadCsv } from '../../../utils/csv-export';

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Último mês' },
  { value: 'quarter', label: 'Último trimestre' },
  { value: 'year', label: 'Último ano' },
];

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

const RELATIONSHIP_STYLES = {
  vip: { label: 'VIP', chip: 'bg-violet-100 text-violet-700 ring-violet-200' },
  recorrente: { label: 'Recorrente', chip: 'bg-sky-100 text-sky-700 ring-sky-200' },
  eventual: { label: 'Eventual', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

// ════════════════════════════════════════════════════════════════════
// Explicações: o que é, o que observar, como agir
// ════════════════════════════════════════════════════════════════════
const EXPLANATIONS = {
  products: {
    title: 'Curva ABC — Produtos',
    intro:
      'Aplicação do princípio de Pareto (80/20) ao seu catálogo. Cada produto é classificado pela receita que gera no período, e agrupado em três classes acumuladas.',
    how: [
      'Soma da receita real (preço × quantidade) de cada produto no período selecionado.',
      'Produtos ordenados do maior para o menor faturamento.',
      'Classe A: produtos que acumulam os primeiros 80% da receita.',
      'Classe B: próximos 15% (acumulado 80–95%).',
      'Classe C: cauda longa, últimos 5%.',
    ],
    observe: [
      'Quantos produtos formam a classe A? Saudável: 5–30% do catálogo. Menos = dependência perigosa de poucos itens. Mais = catálogo disperso sem hit definido.',
      'Receita total no período x perfil esperado (sazonal/normal). Se total caiu mas A se manteve, o problema é a cauda — não os campeões.',
      'Produto na classe C com tráfego alto (view_item) mas conversão baixa = oportunidade. Não é "produto morto", é vitrine ruim.',
      'Produto na classe C com ticket baixo pode ser "produto de entrada" — atrai cliente novo que depois compra A.',
    ],
    act: [
      'Classe A → vitrine sempre, lookalike de mídia paga, bundle com outros itens A, monitorar disponibilidade.',
      'Classe B → cross-sell agressivo combinando com itens A. Promover na sequência pós-compra D+15.',
      'Classe C com tráfego alto → revisar página de produto (título, imagens, depoimentos, preço).',
      'Classe C sem tráfego e sem ser produto de entrada → desativar trimestralmente (regra: 0 vendas em 90d).',
      'Nunca cortar produto C cegamente sem checar se é porta de entrada — pode matar aquisição de novos clientes.',
    ],
  },
  customers: {
    title: 'Curva ABC — Clientes',
    intro:
      'Mesma lógica aplicada a clientes. Quem gera quanto da sua receita, e qual o tipo de relacionamento que cada um tem com a loja.',
    how: [
      'Soma da receita por cliente no período (todos os pedidos aprovados).',
      'Classificação em A/B/C pela contribuição acumulada na receita.',
      'Sobreposto a isso: relação (VIP / Recorrente / Eventual) baseada em quantidade de pedidos e ticket médio.',
      'E-mails são mascarados na tela e no export por LGPD.',
    ],
    observe: [
      'Concentração: quanto % da receita está nos top 5 clientes? Acima de 30% = risco (LTV depende de poucos).',
      'Cliente classe A é VIP (recorrente) ou Eventual de ticket alto? Eventual de ticket alto pode ser uma compra única — não é base de receita previsível.',
      'Recompra geral: VIP + Recorrente / Total. Saudável: > 20%. Abaixo disso, pós-venda está vazando.',
      'Razão Eventual / Total alta = aquisição funciona, retenção não. Inverso = retenção boa mas aquisição parou.',
    ],
    act: [
      'VIPs → audiência semente de campanhas pagas (lookalike no Meta/Google). Acesso antecipado a lançamentos.',
      'Recorrentes → cross-sell por categoria comprada na sequência D+15 (regra D5: segmentação por categoria, não nome).',
      'Eventuais → puxar para segunda compra com email D+15 + cupom marginal (não maior que VOLTEI15).',
      'Cliente sem compra há 90–180d → entra no fluxo de reativação automaticamente (cron). > 180d: parar de enviar (regra D7).',
      'Nunca personalize nominalmente em escala ("Olá Maria,...") — Ferreira 2025: gera R$ 0 RPM. Segmente pelo comportamento, escreva para o grupo.',
    ],
  },
  cohort: {
    title: 'Retenção por coorte mensal',
    intro:
      'Cada linha é um grupo de clientes que comprou pela primeira vez no mesmo mês ("coorte de janeiro", "coorte de fevereiro"). As colunas mostram quantos % desse grupo voltaram a comprar nos meses seguintes.',
    how: [
      'M+0 = mês da primeira compra (sempre 100% por definição).',
      'M+1 = % do coorte que comprou de novo no mês seguinte.',
      'M+12 = % do coorte que ainda compra um ano depois.',
      'Cor da célula: verde escuro = retenção forte (≥ 50%); cinza = ninguém voltou.',
      'Coluna "Tam." = quantos clientes únicos compraram pela primeira vez naquele mês.',
    ],
    observe: [
      'Queda grande de M+0 para M+1 → pós-venda imediato (D+3 / D+15) não está convertendo. Email não chega, ou produto não fideliza.',
      'Coortes mais recentes com retenção pior que antigos → algo mudou (preço, produto destaque, atendimento, layout). Investigar.',
      'Sazonalidade: picos em fev (volta às aulas) e jun (festa junina) são esperados para esse nicho.',
      'Coorte grande com retenção baixa = aquisição cara que não vira LTV. Pior cenário comercial.',
      'Coorte pequeno com retenção alta = nicho fiel. Vale investir em expandir aquisição para esse perfil.',
    ],
    act: [
      'Retenção M+1 baixa → reforçar templates D+3 (review/satisfação) e D+15 (cross-sell). Considerar um produto barato de "segunda compra fácil".',
      'Coorte recente com queda → diagnóstico qualitativo: mudou preço? mudou produto destaque? mudou layout do checkout?',
      'Coortes sazonais (festa junina, formatura) → usar para prever caixa do próximo ciclo. Receita esperada = (coorte M+0) × (retenção média histórica) × ticket médio.',
      'Quando expandir mídia paga (Fase 5): mirar perfil de coorte com maior retenção histórica.',
    ],
  },
};

function ExplainModal({ data, onClose }) {
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar explicação"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <dialog
        open
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        aria-labelledby="explain-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
              Como ler este gráfico
            </p>
            <h2
              id="explain-modal-title"
              className="mt-0.5 text-lg font-bold text-slate-900 sm:text-xl"
            >
              {data.title}
            </h2>
          </div>
          <Button variant="ghost" size="sm" icon="x-lg" onClick={onClose} aria-label="Fechar" />
        </div>

        <p className="text-sm leading-relaxed text-slate-600">{data.intro}</p>

        <ExplainSection title="Como o cálculo funciona" icon="gear" tone="slate" items={data.how} />
        <ExplainSection title="O que observar" icon="eye" tone="amber" items={data.observe} />
        <ExplainSection
          title="Como agir com base na análise"
          icon="lightning-charge-fill"
          tone="emerald"
          items={data.act}
        />

        <div className="mt-6 flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Entendi
          </Button>
        </div>
      </dialog>
    </div>
  );
}

ExplainModal.propTypes = {
  data: PropTypes.shape({
    title: PropTypes.string.isRequired,
    intro: PropTypes.string.isRequired,
    how: PropTypes.arrayOf(PropTypes.string).isRequired,
    observe: PropTypes.arrayOf(PropTypes.string).isRequired,
    act: PropTypes.arrayOf(PropTypes.string).isRequired,
  }),
  onClose: PropTypes.func.isRequired,
};

const SECTION_TONES = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

function ExplainSection({ title, icon, tone, items }) {
  return (
    <section className={`mt-4 rounded-xl border p-4 ${SECTION_TONES[tone]}`}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <i className={`bi bi-${icon}`} aria-hidden="true" />
        {title}
      </h3>
      <ul className="space-y-1.5 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-current opacity-60"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

ExplainSection.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['slate', 'amber', 'emerald']).isRequired,
  items: PropTypes.arrayOf(PropTypes.string).isRequired,
};

// ════════════════════════════════════════════════════════════════════
// Pareto bar list — barra horizontal + chip de classe
// ════════════════════════════════════════════════════════════════════
function ParetoList({ items, limit = 12, getMeta }) {
  const top = (items || []).slice(0, limit);
  if (top.length === 0) {
    return (
      <EmptyState
        icon="bar-chart"
        title="Sem dados no período"
        description="Quando houver pedidos aprovados, o Pareto aparece aqui."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {top.map((item) => {
        const curveStyle = CURVE_STYLES[item.curve] || CURVE_STYLES.C;
        const meta = getMeta ? getMeta(item) : null;
        return (
          <li key={item.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${curveStyle.chip}`}
                >
                  {curveStyle.label}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                  <span className="text-slate-400">#{item.rank}</span>{' '}
                  {item.name || item.email || item.id}
                  {meta ? <span className="ml-2 text-xs text-slate-500">{meta}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-semibold text-slate-900">{formatPrice(item.revenue)}</span>
                <span className="ml-2 text-xs text-slate-500">{Math.round(item.sharePct)}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full bg-gradient-to-r ${curveStyle.bar}`}
                style={{ width: `${Math.max(4, Math.min(100, item.sharePct))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

ParetoList.propTypes = {
  items: PropTypes.array,
  limit: PropTypes.number,
  getMeta: PropTypes.func,
};

// ════════════════════════════════════════════════════════════════════
// Cohort heatmap — table com células coloridas por retentionPct
// ════════════════════════════════════════════════════════════════════
function cellTone(pct) {
  if (pct >= 50) return 'bg-emerald-500 text-white';
  if (pct >= 30) return 'bg-emerald-300 text-emerald-900';
  if (pct >= 15) return 'bg-amber-200 text-amber-900';
  if (pct >= 5) return 'bg-orange-200 text-orange-900';
  if (pct > 0) return 'bg-slate-200 text-slate-700';
  return 'bg-slate-50 text-slate-400';
}

function CohortHeatmap({ cohorts, months }) {
  if (!cohorts || cohorts.length === 0) {
    return (
      <EmptyState
        icon="grid-3x3"
        title="Sem coortes"
        description="Coorte aparece com pelo menos 1 mês de pedidos aprovados."
      />
    );
  }
  const headerOffsets = Array.from({ length: months }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-semibold uppercase tracking-wide">
              Coorte
            </th>
            <th className="px-2 py-2 text-center font-semibold uppercase tracking-wide">Tam.</th>
            {headerOffsets.map((offset) => (
              <th key={offset} className="px-2 py-2 text-center font-semibold">
                M+{offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.cohortMonth} className="border-t border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-semibold text-slate-700">
                {cohort.cohortMonth}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500">{cohort.cohortSize}</td>
              {headerOffsets.map((offset) => {
                const cell = cohort.retention.find((r) => r.offset === offset);
                if (!cell) return <td key={offset} className="px-1 py-1" />;
                return (
                  <td key={offset} className="px-1 py-1">
                    <div
                      className={`flex h-7 w-12 items-center justify-center rounded font-semibold ${cellTone(cell.retentionPct)}`}
                      title={`${cell.activeCount}/${cohort.cohortSize} ativos em ${cell.monthKey}`}
                    >
                      {Math.round(cell.retentionPct)}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

CohortHeatmap.propTypes = {
  cohorts: PropTypes.array,
  months: PropTypes.number.isRequired,
};

// ════════════════════════════════════════════════════════════════════
// AnalysisTab
// ════════════════════════════════════════════════════════════════════
export function AnalysisTab({ categories = [] }) {
  const [period, setPeriod] = useState('month');
  const [customerPeriod, setCustomerPeriod] = useState('quarter');
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [explainKey, setExplainKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      fetchAdminAbcProducts({ period, categoryId: categoryId || null }),
      fetchAdminAbcCustomers({ period: customerPeriod }),
      fetchAdminCohort({ months: 12 }),
    ])
      .then(([prodData, custData, cohortData]) => {
        if (cancelled) return;
        setProducts(prodData);
        setCustomers(custData);
        setCohort(cohortData);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar análise.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, customerPeriod, categoryId]);

  const productSummary = products?.summary || { A: 0, B: 0, C: 0 };
  const customerSummary = customers?.relationshipSummary || { vip: 0, recorrente: 0, eventual: 0 };

  const categoryOptions = useMemo(
    () => [{ id: '', name: 'Todas as categorias' }, ...categories],
    [categories],
  );

  function exportProductsCsv() {
    if (!products?.items?.length) return;
    downloadCsv({
      filename: `curva-abc-produtos-${period}.csv`,
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'curve', label: 'Classe' },
        { key: 'name', label: 'Produto' },
        { key: 'categoryName', label: 'Categoria' },
        { key: 'qty', label: 'Quantidade' },
        { key: 'revenue', label: 'Receita', format: formatCsvNumber },
        { key: 'sharePct', label: '% Share', format: formatCsvNumber },
        { key: 'cumulativePct', label: '% Acumulado', format: formatCsvNumber },
      ],
      rows: products.items,
    });
  }

  function exportCustomersCsv() {
    if (!customers?.items?.length) return;
    downloadCsv({
      filename: `curva-abc-clientes-${customerPeriod}.csv`,
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'curve', label: 'Classe' },
        { key: 'relationship', label: 'Relação' },
        { key: 'email', label: 'Email (mascarado)' },
        { key: 'orderCount', label: 'Pedidos' },
        { key: 'revenue', label: 'Receita', format: formatCsvNumber },
        { key: 'avgTicket', label: 'Ticket médio', format: formatCsvNumber },
        { key: 'sharePct', label: '% Share', format: formatCsvNumber },
      ],
      rows: customers.items,
    });
  }

  function exportCohortCsv() {
    if (!cohort?.cohorts?.length) return;
    const maxOffset = Math.max(
      0,
      ...cohort.cohorts.flatMap((c) => c.retention.map((r) => r.offset)),
    );
    const columns = [
      { key: 'cohortMonth', label: 'Coorte' },
      { key: 'cohortSize', label: 'Tamanho' },
      ...Array.from({ length: maxOffset + 1 }, (_, offset) => ({
        key: `m${offset}`,
        label: `M+${offset}`,
        format: (v) =>
          v === null || v === undefined ? '' : Number(v).toFixed(1).replace('.', ','),
      })),
    ];
    const rows = cohort.cohorts.map((c) => {
      const row = { cohortMonth: c.cohortMonth, cohortSize: c.cohortSize };
      for (const r of c.retention) row[`m${r.offset}`] = r.retentionPct;
      return row;
    });
    downloadCsv({ filename: 'cohort-mensal.csv', columns, rows });
  }

  if (loading && !products) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <i className="bi bi-arrow-clockwise mr-2 animate-spin" /> Calculando análise…
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

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Curva ABC + Coorte
          </p>
          <p className="text-sm text-slate-700">
            Decisões de produto, estoque e campanha baseadas em receita real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Período da Curva ABC de produtos"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Produtos: {opt.label.toLowerCase()}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Filtro de categoria"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            {categoryOptions.map((cat) => (
              <option key={cat.id || 'all'} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={customerPeriod}
            onChange={(e) => setCustomerPeriod(e.target.value)}
            aria-label="Período da Curva ABC de clientes"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Clientes: {opt.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Curva ABC Produtos */}
      <Card
        title="Curva ABC — Produtos"
        subtitle="Princípio de Pareto: A acumula 80% da receita; B vai até 95%; C é cauda longa."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExplainKey('products')}
              icon="question-circle"
            >
              Como ler
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportProductsCsv}
              disabled={!products?.items?.length}
            >
              <i className="bi bi-download mr-1" /> CSV
            </Button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {['A', 'B', 'C'].map((curve) => {
            const style = CURVE_STYLES[curve];
            return (
              <div key={curve} className={`rounded-xl px-3 py-2 ring-1 ${style.chip}`}>
                <p className="text-lg font-bold leading-none">{productSummary[curve] || 0}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                  Classe {style.label}
                </p>
                <p className="text-[10px] opacity-80">{style.desc}</p>
              </div>
            );
          })}
        </div>
        <ParetoList items={products?.items} getMeta={(item) => item.categoryName} />
        <p className="mt-3 text-xs text-slate-500">
          Receita total no período: <strong>{formatPrice(products?.totalRevenue || 0)}</strong>
        </p>
      </Card>

      {/* Curva ABC Clientes */}
      <Card
        title="Curva ABC — Clientes"
        subtitle="Quem gera quanto. Use para definir público de campanha (lookalike de VIP). Regra D5: segmentação por categoria, não personalização nominal."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExplainKey('customers')}
              icon="question-circle"
            >
              Como ler
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCustomersCsv}
              disabled={!customers?.items?.length}
            >
              <i className="bi bi-download mr-1" /> CSV
            </Button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {Object.entries(RELATIONSHIP_STYLES).map(([key, style]) => (
            <div key={key} className={`rounded-xl px-3 py-2 ring-1 ${style.chip}`}>
              <p className="text-lg font-bold leading-none">{customerSummary[key] || 0}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                {style.label}
              </p>
            </div>
          ))}
        </div>
        <ParetoList
          items={customers?.items}
          getMeta={(item) =>
            `${item.orderCount} pedido${item.orderCount === 1 ? '' : 's'} · ticket ${formatPrice(item.avgTicket)}`
          }
        />
        <p className="mt-3 text-xs text-slate-500">
          E-mails são mascarados na visualização — export CSV usa a mesma máscara.
        </p>
      </Card>

      {/* Cohort */}
      <Card
        title="Retenção por coorte (últimos 12 meses)"
        subtitle="Linha = mês da 1ª compra; coluna = meses depois. Sazonalidade do ano letivo aparece aqui."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExplainKey('cohort')}
              icon="question-circle"
            >
              Como ler
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCohortCsv}
              disabled={!cohort?.cohorts?.length}
            >
              <i className="bi bi-download mr-1" /> CSV
            </Button>
          </div>
        }
      >
        <CohortHeatmap cohorts={cohort?.cohorts || []} months={cohort?.months || 12} />
        {cohort?.totalCustomers ? (
          <p className="mt-3 text-xs text-slate-500">
            {cohort.totalCustomers} clientes únicos no período.
          </p>
        ) : null}
      </Card>

      <p className="text-xs text-slate-500">
        Dados em cache por 1h (regra F5). Adicione <code>?nocache=1</code> à URL para forçar
        recálculo.
      </p>

      <ExplainModal
        data={explainKey ? EXPLANATIONS[explainKey] : null}
        onClose={() => setExplainKey(null)}
      />
    </div>
  );
}

AnalysisTab.propTypes = {
  categories: PropTypes.array,
};
