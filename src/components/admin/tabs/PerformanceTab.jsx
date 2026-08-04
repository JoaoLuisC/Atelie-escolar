import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

export function PerformanceTab({ productPerformance }) {
  return (
    <Card title="Desempenho de produtos" subtitle="Ordenado por unidades vendidas">
      {productPerformance.length === 0 ? (
        <EmptyState icon="graph-up" title="Sem dados de desempenho" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-right">Vendas</th>
                <th className="px-3 py-2 text-right">Receita</th>
                <th className="px-3 py-2 text-right">Downloads</th>
                <th className="px-3 py-2 text-left">Taxa de download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {productPerformance.map((product) => {
                const conversionPct = Math.min(
                  100,
                  Math.round(((product.downloads || 0) / Math.max(product.qty || 1, 1)) * 100),
                );

                return (
                  <tr key={product.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-3 font-semibold text-slate-800">{product.name}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{product.qty}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatPrice(product.rev)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{product.downloads || 0}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${Math.max(6, conversionPct)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold text-slate-600">{conversionPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

PerformanceTab.propTypes = {
  productPerformance: PropTypes.array.isRequired,
};
