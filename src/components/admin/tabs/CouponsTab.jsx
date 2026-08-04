import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { CouponWizard } from '../../CouponWizard';
import { useToast } from '../../../hooks/useToast';
import { formatPrice } from '../../../utils/currency';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCoupons,
  updateAdminCoupon,
} from '../../../services/admin-panel';

function formatDiscount(coupon) {
  return coupon.discountType === 'percent'
    ? `${coupon.discountValue}% OFF`
    : `${formatPrice(coupon.discountValue)} OFF`;
}

function formatValidity(coupon) {
  if (!coupon.validUntil) return 'Sem expiração';
  const date = new Date(coupon.validUntil);
  if (Number.isNaN(date.getTime())) return 'Sem expiração';
  const expired = date.getTime() < Date.now();
  return `${expired ? 'Expirou em' : 'Vale até'} ${date.toLocaleDateString('pt-BR')}`;
}

function usageLabel(coupon) {
  if (coupon.maxUses == null) return `${coupon.usedCount} uso(s)`;
  return `${coupon.usedCount}/${coupon.maxUses} usos`;
}

export function CouponsTab() {
  const { pushToast } = useToast();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminCoupons()
      .then((data) => { if (!cancelled) setCoupons(data.coupons || []); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Erro ao carregar cupons.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function reload() {
    const data = await fetchAdminCoupons();
    setCoupons(data.coupons || []);
  }

  function openCreate() {
    setEditing(null);
    setWizardOpen(true);
  }

  function openEdit(coupon) {
    setEditing(coupon);
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setEditing(null);
  }

  async function handleSave(payload) {
    try {
      if (payload.id) {
        await updateAdminCoupon(payload);
        pushToast('Cupom atualizado.', 'success');
      } else {
        await createAdminCoupon(payload);
        pushToast('Cupom criado.', 'success');
      }
      await reload();
      closeWizard();
    } catch (err) {
      pushToast(err?.message || 'Erro ao salvar cupom.', 'error');
    }
  }

  async function handleDelete(coupon) {
    if (typeof globalThis.window !== 'undefined' && !globalThis.window.confirm?.(`Excluir o cupom "${coupon.code}"?`)) {
      return;
    }
    try {
      await deleteAdminCoupon(coupon.id);
      await reload();
      pushToast('Cupom removido.', 'success');
    } catch (err) {
      pushToast(err?.message || 'Erro ao remover cupom.', 'error');
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <i className="bi bi-arrow-clockwise mr-2 animate-spin" /> Carregando cupons…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
    );
  }

  return (
    <>
      <Card
        title="Cupons de desconto"
        subtitle={`${coupons.length} cupom(ns) cadastrado(s) · validados no checkout`}
        action={<Button icon="plus-lg" onClick={openCreate}>Novo cupom</Button>}
      >
        {coupons.length === 0 ? (
          <EmptyState
            icon="ticket-perforated"
            title="Nenhum cupom"
            description="Crie cupons de desconto validados no checkout — sem precisar de SQL."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coupons.map((coupon) => (
              <article
                key={coupon.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-bold text-slate-900">{coupon.code}</span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                      coupon.active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200'
                    }`}
                  >
                    {coupon.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-lg font-extrabold text-brand-700">{formatDiscount(coupon)}</p>
                <ul className="flex flex-col gap-0.5 text-xs text-slate-500">
                  <li><i className="bi bi-calendar-event mr-1" aria-hidden="true" />{formatValidity(coupon)}</li>
                  <li><i className="bi bi-graph-up mr-1" aria-hidden="true" />{usageLabel(coupon)}</li>
                  {coupon.minOrderAmount ? (
                    <li><i className="bi bi-cart mr-1" aria-hidden="true" />Mín. {formatPrice(coupon.minOrderAmount)}</li>
                  ) : null}
                </ul>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(coupon)}>Editar</Button>
                  <Button variant="ghost" size="sm" icon="trash" onClick={() => handleDelete(coupon)} aria-label={`Excluir ${coupon.code}`} />
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <CouponWizard
        isOpen={wizardOpen}
        onClose={closeWizard}
        onSubmit={handleSave}
        initialCoupon={editing}
      />
    </>
  );
}
