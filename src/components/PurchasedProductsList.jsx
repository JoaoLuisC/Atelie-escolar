import { useState } from 'react';
import PropTypes from 'prop-types';
import { buildDownloadUrl, fetchOrderStatus } from '../services/downloads';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { errorMessageOf } from '../utils/api';

/** Itens de pedidos aprovados = o que a cliente pode baixar. */
export function countAvailableProducts(orders) {
  return (orders || [])
    .filter((entry) => entry.paymentStatus === 'approved')
    .reduce((total, entry) => total + (entry.items || []).length, 0);
}

/**
 * Aba "Produtos" de Meus produtos: cada item de pedido aprovado com o seu
 * "Baixar". O link é pedido na hora (token de uso único), nunca fica na tela
 * antes do clique.
 */
export function PurchasedProductsList({ orders, loading, statusText, onRefresh }) {
  const { customerSession } = useAuth();
  const { pushToast } = useToast();
  const [prepared, setPrepared] = useState({});
  const [preparing, setPreparing] = useState('');
  const available = countAvailableProducts(orders);

  async function prepareDownload(entry, item) {
    const orderCode = entry.orderId || entry.internalOrderId;
    const key = `${orderCode}:${item.id}`;
    setPreparing(key);
    try {
      const { response, data } = await fetchOrderStatus({
        orderId: orderCode,
        email: customerSession.email,
      });
      if (!response.ok || !data.success || data.order?.paymentStatus !== 'approved') {
        throw new Error(errorMessageOf(data) || 'Não foi possível preparar o download.');
      }
      const token = (data.order.downloadTokens || []).find(
        (candidate) =>
          String(candidate.productId) === String(item.id) && candidate.available !== false,
      );
      if (!token?.token) throw new Error('Arquivo indisponível. Entre em contato com a loja.');
      setPrepared((previous) => ({ ...previous, [key]: token.token }));
    } catch (error) {
      pushToast(error.message || 'Não foi possível preparar o download.', 'error');
    } finally {
      setPreparing('');
    }
  }

  return (
    <article className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold text-slate-900">
          Seus produtos{' '}
          <span className="ml-1 rounded-full bg-brand-50 px-2.5 py-0.5 align-middle text-sm font-bold text-brand-700">
            {available}
          </span>
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />{' '}
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      {loading ? <p className="mt-2 text-sm text-slate-500">Carregando seus produtos...</p> : null}
      {!loading && available === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {statusText ||
            'Nenhum produto liberado ainda. Quando um pedido for aprovado, os arquivos aparecem aqui.'}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {orders
          .filter((entry) => entry.paymentStatus === 'approved')
          .flatMap((entry) =>
            (entry.items || []).map((item) => {
              const key = `${entry.orderId || entry.internalOrderId}:${item.id}`;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <div>
                    <strong className="block text-sm text-slate-800">{item.title}</strong>
                    <span className="text-xs text-slate-500">
                      Pedido #{entry.orderId || entry.internalOrderId}
                    </span>
                  </div>
                  {prepared[key] ? (
                    <a
                      href={buildDownloadUrl(prepared[key])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Baixar arquivo
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(preparing)}
                      onClick={() => prepareDownload(entry, item)}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {preparing === key ? 'Preparando…' : 'Baixar'}
                    </button>
                  )}
                </li>
              );
            }),
          )}
      </ul>
    </article>
  );
}

PurchasedProductsList.propTypes = {
  orders: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  statusText: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
};
