import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SecurityTab } from '../SecurityTab';
import { buildOtpAuthUri, generateTotpSecret, securitySaveProblem } from '../security-rules';

// ════════════════════════════════════════════════════════════════════
// ADM-38/ADM-49 da validação de 2026-10-01 — a aba que podia trancar o admin
// fora. Com adminConfig VAZIO o checkbox "Exigir 2FA" nascia marcado, e um
// "Salvar" gravava 2FA sem método: o login passava a responder 500 e só SQL
// resolvia. O servidor tem a mesma trava (admin-settings-guard.test.js); aqui
// fica travado que a TELA não chega a mandar.
// ════════════════════════════════════════════════════════════════════

describe('securitySaveProblem', () => {
  it('exigir 2FA sem TOTP nem PIN é bloqueado', () => {
    expect(securitySaveProblem({ enabled: true })).toMatch(/cadastre antes/);
  });

  it('PIN desabilitado não conta como método', () => {
    expect(securitySaveProblem({ enabled: true, hasPin: true, pinAllowed: false })).toMatch(
      /cadastre antes/,
    );
  });

  it('exigir 2FA com PIN novo é permitido', () => {
    expect(securitySaveProblem({ enabled: true, nextPin: '918273' })).toBeNull();
  });

  it('segredo TOTP novo exige o código de 6 dígitos do app', () => {
    expect(securitySaveProblem({ enabled: true, nextTotp: 'JBSWY3DPEHPK3PXP' })).toMatch(
      /código de 6 dígitos/,
    );
    expect(
      securitySaveProblem({
        enabled: true,
        nextTotp: 'JBSWY3DPEHPK3PXP',
        totpVerificationCode: '123456',
      }),
    ).toBeNull();
  });

  it('com 2FA em vigor, mudar algo exige o código atual', () => {
    const vigente = { requiredNow: true, enforcedNow: true, has2FA: true };
    expect(securitySaveProblem({ ...vigente, enabled: false })).toMatch(/código atual/);
    expect(securitySaveProblem({ ...vigente, enabled: false, confirmationCode: '123456' })).toBe(
      null,
    );
    // Nada mudou: não pede código (o round-trip do painel não pode virar um 403).
    expect(securitySaveProblem({ ...vigente, enabled: true })).toBeNull();
  });
});

describe('generateTotpSecret', () => {
  it('gera 32 caracteres Base32 (160 bits)', () => {
    const secret = generateTotpSecret(() => new Uint8Array(20).fill(255));
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });
});

describe('<SecurityTab />', () => {
  it('adminConfig vazio: "Exigir 2FA" começa DESMARCADO', () => {
    render(<SecurityTab config={{}} onSave={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Exigir 2FA/ })).not.toBeChecked();
  });

  it('config gravada com requireSecondFactor (nome legado) aparece marcada', () => {
    render(<SecurityTab config={{ requireSecondFactor: true, has2FA: true }} onSave={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Exigir 2FA/ })).toBeChecked();
  });

  it('marcar "Exigir 2FA" sem método e salvar NÃO chama onSave', () => {
    const onSave = vi.fn();
    render(<SecurityTab config={{}} onSave={onSave} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Exigir 2FA/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar configurações/ }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/cadastre antes/);
  });

  it('segredo novo vai com totpVerificationCode, fora do valor gravado', async () => {
    const onSave = vi.fn(async () => true);
    render(<SecurityTab config={{}} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('TOTP secret (Base32)'), {
      target: { value: 'JBSWY3DPEHPK3PXP' },
    });
    fireEvent.change(screen.getByLabelText('Código do app para este segredo'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Exigir 2FA/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar configurações/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [payload, extras] = onSave.mock.calls[0];
    expect(payload).toMatchObject({ twoFactorEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' });
    expect(payload).not.toHaveProperty('totpVerificationCode');
    expect(extras).toEqual({ totpVerificationCode: '654321' });
  });

  it('com 2FA em vigor há campo de código atual, e ele segue como confirmationCode', () => {
    const onSave = vi.fn(async () => true);
    render(
      <SecurityTab
        config={{ twoFactorEnabled: true, has2FA: true, hasPin: true }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Exigir 2FA/ }));
    fireEvent.change(screen.getByLabelText('Código atual (TOTP ou PIN)'), {
      target: { value: '918273' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Salvar configurações/ }));

    const [payload, extras] = onSave.mock.calls[0];
    // Desligar desliga os TRÊS nomes herdados: o login olha qualquer um deles.
    expect(payload).toMatchObject({
      twoFactorEnabled: false,
      requireSecondFactor: false,
      require2FA: false,
    });
    expect(extras).toEqual({ confirmationCode: '918273' });
  });
});

describe('código por e-mail e QR code', () => {
  it('e-mail sem app nem PIN de reserva é bloqueado', () => {
    expect(securitySaveProblem({ enabled: false, emailEnabled: true })).toMatch(/reserva/);
  });

  it('e-mail com PIN de reserva é permitido', () => {
    expect(securitySaveProblem({ enabled: true, hasPin: true, emailEnabled: true })).toBeNull();
  });

  it('com 2FA em vigor, ligar o e-mail também exige o código atual', () => {
    expect(
      securitySaveProblem({
        enabled: true,
        requiredNow: true,
        enforcedNow: true,
        hasPin: true,
        emailEnabled: true,
        emailNow: false,
      }),
    ).toMatch(/código atual/);
  });

  it('buildOtpAuthUri monta o endereço que o Google Authenticator lê', () => {
    const uri = buildOtpAuthUri({ secret: 'jbsw y3dp ehpk 3pxp', account: 'painel' });

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(params.get('issuer')).toBe('Ateliê da Escola');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });

  it('a caixa do e-mail reflete a config e segue como allowEmailCode ao salvar', async () => {
    const onSave = vi.fn(async () => {});
    render(<SecurityTab config={{ hasPin: true, allowEmailCode: false }} onSave={onSave} />);

    const caixa = screen.getByRole('checkbox', { name: /Aceitar código por e-mail/ });
    expect(caixa).not.toBeChecked();
    fireEvent.click(caixa);
    fireEvent.click(screen.getByRole('button', { name: /Salvar configurações/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].allowEmailCode).toBe(true);
  });

  it('segredo gerado mostra o espaço do QR code', () => {
    render(<SecurityTab config={{}} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Gerar/ }));

    expect(
      screen.queryByAltText('QR code para o app autenticador') ||
        screen.getByText(/Gerando QR code/),
    ).toBeTruthy();
  });
});
