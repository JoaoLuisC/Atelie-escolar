import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeCustomerSessionFromAuthCallback } from '../customer-auth';
import { CUSTOMER_RESET_PASSWORD_PATH } from '../../constants/routes';

describe('retorno de recuperação', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('não consome o código de recuperação como login do Google', async () => {
    window.history.replaceState({}, '', `${CUSTOMER_RESET_PASSWORD_PATH}?code=codigo`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(consumeCustomerSessionFromAuthCallback()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=codigo');
    fetchSpy.mockRestore();
  });
});
