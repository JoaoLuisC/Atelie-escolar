import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/currency';
import { Card } from '../ui/Card';
import { BarList } from '../ui/BarList';
import { StatCard } from '../ui/StatCard';

export function FinanceTab({ approvedOrders, faturamentoSeries }) {
  const totalGross = approvedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const avgTicket = approvedOrders.length ? totalGross / approvedOrders.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Bruto acumulado" value={formatPrice(totalGross)} icon="cash-stack" accent="success" />
        <StatCard label="Pedidos aprovados" value={approvedOrders.length} icon="check2-circle" accent="primary" />
        <StatCard label="Ticket médio" value={formatPrice(avgTicket)} icon="calculator" accent="info" />
      </div>

      <Card title="Faturamento dos últimos 6 meses" subtitle="Apenas pedidos aprovados">
        <BarList entries={faturamentoSeries} accent="success" emptyText="Sem vendas no período." />
      </Card>
    </div>
  );
}

FinanceTab.propTypes = {
  approvedOrders: PropTypes.array.isRequired,
  faturamentoSeries: PropTypes.array.isRequired,
};
