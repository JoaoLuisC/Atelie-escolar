import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CouponWizard, maxUsesPerCustomerFor, parseEligibleEmails } from '../CouponWizard';

const pushToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ pushToast }) }));

function renderWizard(onSubmit = vi.fn(async () => {})) {
  render(<CouponWizard isOpen onClose={vi.fn()} onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText('Código *'), { target: { value: 'TESTE10' } });
  fireEvent.change(screen.getByLabelText('Desconto (%) *'), { target: { value: '10' } });
  return onSubmit;
}

function escolherPublico(value) {
  fireEvent.change(screen.getByLabelText('Quem pode usar'), { target: { value } });
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: /Salvar Cupom/ }));
}

describe('CouponWizard · público do cupom', () => {
  beforeEach(() => pushToast.mockClear());

  it('"Primeira compra" esconde "Usos por cliente" e grava 1 fixo', async () => {
    const onSubmit = renderWizard();
    expect(screen.getByLabelText('Usos por cliente')).toBeInTheDocument();

    escolherPublico('new_customers');

    expect(screen.queryByLabelText('Usos por cliente')).toBeNull();
    expect(screen.getByText(/vale uma vez por cliente/)).toBeInTheDocument();

    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ audience: 'new_customers', maxUsesPerCustomer: 1 });
    expect(payload).not.toHaveProperty('eligibleEmails');
  });

  it('"Recompensa por compras" esconde o campo: quem limita é a recompensa', async () => {
    const onSubmit = renderWizard();

    escolherPublico('purchase_milestone');

    expect(screen.queryByLabelText('Usos por cliente')).toBeNull();
    expect(screen.getByText(/A recompensa já limita/)).toBeInTheDocument();
    expect(screen.getByLabelText('Compras aprovadas para ganhar cada uso')).toHaveValue(5);

    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      audience: 'purchase_milestone',
      maxUsesPerCustomer: null,
      purchasesRequired: 5,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('eligibleEmails');
  });

  it('"Pessoas específicas" sem e-mail não envia; com e-mails, normaliza a lista', async () => {
    const onSubmit = renderWizard();

    escolherPublico('emails');
    salvar();

    expect(pushToast).toHaveBeenCalledWith('Informe ao menos um e-mail.', 'error');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('E-mails permitidos'), {
      target: { value: 'Ana@Exemplo.com\n bia@exemplo.com; ' },
    });
    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      audience: 'emails',
      eligibleEmails: ['ana@exemplo.com', 'bia@exemplo.com'],
    });
  });

  it('"Todos" leva o limite digitado e não leva eligibleEmails', async () => {
    const onSubmit = renderWizard();

    fireEvent.change(screen.getByLabelText('Usos por cliente'), { target: { value: '3' } });
    salvar();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ audience: 'all', maxUsesPerCustomer: 3 });
    expect(payload).not.toHaveProperty('eligibleEmails');
  });

  it('edição nasce com os dados do cupom, sem efeito de sincronização', () => {
    render(
      <CouponWizard
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        initialCoupon={{
          id: 'c1',
          code: 'VOLTEI15',
          discountValue: 15,
          audience: 'emails',
          eligibleEmails: ['x@y.com'],
        }}
      />,
    );
    expect(screen.getByLabelText('Código *')).toHaveValue('VOLTEI15');
    expect(screen.getByLabelText('E-mails permitidos')).toHaveValue('x@y.com');
  });
});

describe('helpers de público', () => {
  it('maxUsesPerCustomerFor segue a regra de cada público', () => {
    expect(maxUsesPerCustomerFor({ audience: 'new_customers', maxUsesPerCustomer: '7' })).toBe(1);
    expect(
      maxUsesPerCustomerFor({ audience: 'purchase_milestone', maxUsesPerCustomer: '7' }),
    ).toBeNull();
    expect(maxUsesPerCustomerFor({ audience: 'all', maxUsesPerCustomer: '' })).toBeNull();
    expect(maxUsesPerCustomerFor({ audience: 'customers', maxUsesPerCustomer: '2' })).toBe(2);
  });

  it('parseEligibleEmails aceita quebra de linha, vírgula e ponto e vírgula', () => {
    expect(parseEligibleEmails('A@b.com, c@d.com;\n\ne@f.com ')).toEqual([
      'a@b.com',
      'c@d.com',
      'e@f.com',
    ]);
    expect(parseEligibleEmails('')).toEqual([]);
  });
});
