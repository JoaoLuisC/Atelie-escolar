import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installModuleMock,
  installPartialMock,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

// lib/staff-account.js — troca de senha e de e-mail pela aba "Minha conta".
// Garantias: as duas exigem a senha atual (login de verdade); a senha nova
// segue a regra de força; o e-mail é pedido em nome da pessoa (confirmação
// por link), nunca trocado direto; conta só-Google não troca nada por aqui.

const requireCjs = createRequire(import.meta.url);
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let signInWithPassword;
let updateUser;
let updateUserById;
let providers;

beforeEach(() => {
  resetModuleRegistry();
  providers = ['email'];
  signInWithPassword = vi.fn(async ({ password }) =>
    password === 'Atual123'
      ? { data: { session: { access_token: 't' } }, error: null }
      : { data: { session: null }, error: { message: 'Invalid login credentials' } },
  );
  updateUser = vi.fn(async () => ({ error: null }));
  updateUserById = vi.fn(async () => ({ error: null }));

  installPartialMock('@supabase/supabase-js', {
    createClient: () => ({
      auth: { signInWithPassword, updateUser, signOut: vi.fn(async () => ({})) },
    }),
  });
  installModuleMock('../../services/supabase-auth', {
    getAdminClient: () => ({
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { id: USER_ID, email: 'marcia@x.com', app_metadata: { providers } } },
            error: null,
          }),
          updateUserById,
        },
      },
    }),
  });
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

const load = () => requireCjs('../staff-account.js');

describe('changePassword', () => {
  it('com a senha atual certa, troca pela Admin API', async () => {
    await load().changePassword(USER_ID, {
      currentPassword: 'Atual123',
      newPassword: 'NovaSenha9',
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'marcia@x.com',
      password: 'Atual123',
    });
    expect(updateUserById).toHaveBeenCalledWith(USER_ID, { password: 'NovaSenha9' });
  });

  it('senha atual errada não troca nada (e marca a tentativa)', async () => {
    await expect(
      load().changePassword(USER_ID, { currentPassword: 'errada', newPassword: 'NovaSenha9' }),
    ).rejects.toMatchObject({ status: 400, reauthFailed: true });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it.each(['curta1A', 'semnumeroAA', 'sem-maiuscula1', 'SEM-MINUSCULA1'])(
    'senha fraca "%s" é recusada antes de conferir a atual',
    async (weak) => {
      await expect(
        load().changePassword(USER_ID, { currentPassword: 'Atual123', newPassword: weak }),
      ).rejects.toMatchObject({ status: 400 });
      expect(signInWithPassword).not.toHaveBeenCalled();
    },
  );

  it('conta só-Google não troca senha por aqui', async () => {
    providers = ['google'];
    await expect(
      load().changePassword(USER_ID, { currentPassword: 'x', newPassword: 'NovaSenha9' }),
    ).rejects.toThrow(/Google/);
  });
});

describe('changeEmail', () => {
  it('pede a troca em nome da pessoa (link de confirmação), não troca direto', async () => {
    const result = await load().changeEmail(
      USER_ID,
      { currentPassword: 'Atual123', newEmail: ' Nova@Escola.com ' },
      { redirectTo: 'https://loja/admin' },
    );
    expect(result).toEqual({ pendingEmail: 'nova@escola.com' });
    expect(updateUser).toHaveBeenCalledWith(
      { email: 'nova@escola.com' },
      { emailRedirectTo: 'https://loja/admin' },
    );
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('senha atual errada: nenhum pedido de troca', async () => {
    await expect(
      load().changeEmail(USER_ID, { currentPassword: 'errada', newEmail: 'nova@escola.com' }),
    ).rejects.toMatchObject({ reauthFailed: true });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('e-mail já usado por outra conta vira 409', async () => {
    updateUser.mockResolvedValueOnce({
      error: { message: 'A user with this email address has already been registered' },
    });
    await expect(
      load().changeEmail(USER_ID, { currentPassword: 'Atual123', newEmail: 'outra@x.com' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each(['sem-arroba', 'marcia@x.com'])(
    'recusa "%s" (inválido ou igual ao atual)',
    async (email) => {
      await expect(
        load().changeEmail(USER_ID, { currentPassword: 'Atual123', newEmail: email }),
      ).rejects.toMatchObject({ status: 400 });
      expect(updateUser).not.toHaveBeenCalled();
    },
  );
});
