import { useCallback, useEffect, useState } from 'react';
import { fetchMyRefundRequests } from '../services/downloads';

/**
 * As solicitações de devolução da conta e o fluxo que vale para cada pedido
 * aprovado (`simple`/`support`, decidido pelo servidor). Falha de carga fica
 * em `loadError` — sem elegibilidade a tela não pode chutar "desistência"
 * para quem já baixou.
 */
export function useRefundRequests(enabled) {
  const [requests, setRequests] = useState([]);
  const [eligibility, setEligibility] = useState({});
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Estado só muda quando a resposta chega (regra D5): o efeito abaixo chama
  // isto na montagem, e um setState síncrono aqui seria render em cascata.
  const reload = useCallback(
    () =>
      fetchMyRefundRequests()
        .then((data) => {
          setRequests(data.requests);
          setEligibility(Object.fromEntries(data.eligibility.map((item) => [item.orderId, item])));
          setLoadError('');
          setLoaded(true);
        })
        .catch((error) => {
          setLoadError(error?.message || 'Não foi possível verificar o prazo de devolução.');
        }),
    [],
  );

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return {
    requests,
    eligibility,
    loadError,
    loaded,
    reload,
    /** Solicitação (ativa ou não) de um pedido, pelo id interno. */
    requestFor: (internalOrderId) =>
      requests.find((item) => String(item.order_id) === String(internalOrderId)) || null,
    /** Fluxo e prova de download de um pedido, pelo código. */
    eligibilityFor: (orderCode) => eligibility[orderCode] || null,
  };
}
