import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../../../hooks/useToast';
import { fetchSalesStudy, generateSalesStudy } from '../../../services/admin-panel';
import { formatPrice } from '../../../utils/currency';
import { friendlyAdminError } from '../utils/errors';

const PERIODS = [
  { days: 30, label: 'Últimos 30 dias' },
  { days: 60, label: 'Últimos 60 dias' },
  { days: 90, label: 'Últimos 90 dias' },
];

const CONFIDENCE = {
  alta: { label: 'Confiança alta', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  media: { label: 'Confiança média', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  baixa: { label: 'Confiança baixa', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

/** Variação do atual contra o anterior; sem base, não inventa percentual. */
function variation(current, previous) {
  if (!previous) return current ? 'novo' : '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function InsightList({ title, icon, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <i className={`bi bi-${icon}`} aria-hidden="true" /> {title}
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

InsightList.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.string),
  tone: PropTypes.string.isRequired,
};

function MetricsTable({ data }) {
  const atual = data?.periodoAtual || {};
  const anterior = data?.periodoAnterior || {};
  const rows = [
    ['Visitas (sessões)', atual.sessoesNoSite, anterior.sessoesNoSite, (v) => v ?? 0],
    ['Pedidos aprovados', atual.pedidosAprovados, anterior.pedidosAprovados, (v) => v ?? 0],
    ['Receita', atual.receita, anterior.receita, (v) => formatPrice(v || 0)],
    ['Ticket médio', atual.ticketMedio, anterior.ticketMedio, (v) => formatPrice(v || 0)],
    [
      'Conversão visita → compra',
      atual.conversaoSessaoParaCompraPct,
      anterior.conversaoSessaoParaCompraPct,
      (v) => `${(v || 0).toLocaleString('pt-BR')}%`,
    ],
    [
      'Clientes que recompraram',
      atual.compradoresQueRecompraram,
      anterior.compradoresQueRecompraram,
      (v) => v ?? 0,
    ],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <th className="py-2 pr-4 font-semibold">Indicador</th>
            <th className="py-2 pr-4 font-semibold">Período atual</th>
            <th className="py-2 pr-4 font-semibold">Período anterior</th>
            <th className="py-2 font-semibold">Variação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, current, previous, format]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="py-2 pr-4 text-slate-700">{label}</td>
              <td className="py-2 pr-4 font-semibold text-slate-900">{format(current)}</td>
              <td className="py-2 pr-4 text-slate-500">{format(previous)}</td>
              <td className="py-2 text-slate-600">
                {variation(Number(current) || 0, Number(previous) || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

MetricsTable.propTypes = {
  data: PropTypes.object,
};

/**
 * Vendas → Estudo de vendas: números do período (atual × anterior) e a leitura
 * da IA em português simples. Abrir a aba mostra a última análise salva;
 * só o botão gasta a cota da IA.
 */
export function SalesStudyTab() {
  const { pushToast } = useToast();
  const [state, setState] = useState({
    loading: true,
    study: null,
    aiConfigured: false,
    error: '',
  });
  const [days, setDays] = useState(30);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSalesStudy()
      .then((data) => {
        if (!cancelled) {
          setState({
            loading: false,
            study: data.study || null,
            aiConfigured: Boolean(data.aiConfigured),
            error: '',
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: friendlyAdminError(error, 'Erro ao carregar o estudo de vendas.'),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate() {
    try {
      setGenerating(true);
      const data = await generateSalesStudy(days);
      setState({
        loading: false,
        study: data.study,
        aiConfigured: Boolean(data.aiConfigured),
        error: '',
      });
      pushToast('Análise gerada.', 'success');
    } catch (error) {
      pushToast(friendlyAdminError(error, 'Erro ao gerar a análise.'), 'error');
    } finally {
      setGenerating(false);
    }
  }

  const { study } = state;
  const insights = study?.insights;
  const confidence = CONFIDENCE[insights?.confianca] || null;

  return (
    <div className="space-y-4">
      <Card
        title="Estudo de vendas"
        subtitle="A IA lê os números da loja (funil, Curva ABC, receita e origem das vendas) e explica o que está acontecendo, em linguagem simples."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sales-study-period" className="sr-only">
              Período
            </label>
            <select
              id="sales-study-period"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {PERIODS.map((period) => (
                <option key={period.days} value={period.days}>
                  {period.label}
                </option>
              ))}
            </select>
            <Button icon="stars" onClick={handleGenerate} disabled={generating || state.loading}>
              {generating ? 'Analisando…' : 'Gerar nova análise'}
            </Button>
          </div>
        }
      >
        {state.loading ? <p className="text-sm text-slate-500">Carregando…</p> : null}
        {state.error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {!state.loading && !state.aiConfigured ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A IA não está configurada neste ambiente. Os números aparecem normalmente; a leitura da
            IA funciona no site publicado.
          </p>
        ) : null}
        {!state.loading && !study ? (
          <p className="text-sm text-slate-600">
            Nenhuma análise ainda. Escolha o período e clique em <strong>Gerar nova análise</strong>
            .
          </p>
        ) : null}

        {study ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Gerada em {formatDateTime(study.generatedAt)} · últimos {study.days} dias comparados
              aos {study.days} anteriores
              {study.model ? ` · ${study.model}` : ''}
            </p>

            {study.aiMessage ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {study.aiMessage}
              </p>
            ) : null}

            {insights ? (
              <>
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                      <i className="bi bi-stars" aria-hidden="true" /> Resumo
                    </h3>
                    {confidence ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${confidence.cls}`}
                      >
                        {confidence.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">
                    {insights.resumo}
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <InsightList
                    title="O que está bom"
                    icon="hand-thumbs-up"
                    items={insights.destaques}
                    tone="border-emerald-200 bg-emerald-50/50 text-emerald-900"
                  />
                  <InsightList
                    title="Onde está perdendo venda"
                    icon="exclamation-triangle"
                    items={insights.pontosDeAtencao}
                    tone="border-amber-200 bg-amber-50/50 text-amber-900"
                  />
                  <InsightList
                    title="O que fazer agora"
                    icon="lightbulb"
                    items={insights.acoes}
                    tone="border-sky-200 bg-sky-50/50 text-sky-900"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  A leitura é gerada por IA a partir dos números abaixo e pode errar. Use como apoio
                  à decisão, não como verdade absoluta.
                </p>
              </>
            ) : null}

            <MetricsTable data={study.data} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
