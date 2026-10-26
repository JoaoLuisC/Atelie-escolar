import { lazy, Suspense, useState } from 'react';
import PropTypes from 'prop-types';

const lazyNamed = (name, load) => lazy(() => load().then((m) => ({ default: m[name] })));

const FunnelTab = lazyNamed('FunnelTab', () => import('./FunnelTab'));
const AnalysisTab = lazyNamed('AnalysisTab', () => import('./AnalysisTab'));
const SalesStudyTab = lazyNamed('SalesStudyTab', () => import('./SalesStudyTab'));

const SUBTABS = [
  { id: 'estudo', label: 'Estudo de vendas', icon: 'stars' },
  { id: 'funil', label: 'Funil', icon: 'funnel' },
  { id: 'abc', label: 'Curva ABC e coorte', icon: 'bar-chart-line' },
];

/**
 * Aba "Vendas" do painel: agrupa o Funil, a Curva ABC/coorte e o Estudo de
 * vendas (IA) em subabas, para o menu lateral não crescer a cada relatório.
 * Cada subaba só baixa o próprio código quando é aberta.
 */
export function SalesHub({ categories }) {
  const [active, setActive] = useState('estudo');

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Relatórios de vendas" className="flex flex-wrap gap-2">
        {SUBTABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active === tab.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <i className={`bi bi-${tab.icon}`} aria-hidden="true" /> {tab.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<p className="text-sm text-slate-500">Carregando…</p>}>
        {active === 'estudo' ? <SalesStudyTab /> : null}
        {active === 'funil' ? <FunnelTab /> : null}
        {active === 'abc' ? <AnalysisTab categories={categories} /> : null}
      </Suspense>
    </div>
  );
}

SalesHub.propTypes = {
  categories: PropTypes.array,
};
