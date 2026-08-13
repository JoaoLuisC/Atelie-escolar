import PropTypes from 'prop-types';
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

export function OrdersTab({ orders, statusFilter, onStatusFilterChange, onOpenOrder }) {
  return (
    <Card
      title="Pedidos"
      subtitle={`${orders.length} pedido(s) no filtro atual`}
      action={
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
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
        <div className="overflow-hidden rounded-xl border border-slate-200">
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
                    <div className="font-semibold text-slate-800">{order.orderId || order.id}</div>
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
  );
}

OrdersTab.propTypes = {
  orders: PropTypes.array.isRequired,
  statusFilter: PropTypes.string.isRequired,
  onStatusFilterChange: PropTypes.func.isRequired,
  onOpenOrder: PropTypes.func.isRequired,
};
