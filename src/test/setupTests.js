import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock global do módulo de analytics: testes não precisam disparar
// eventos canônicos ou consumir mocks de fetch para tracking.
vi.mock('../utils/analytics', () => ({
  initAnalytics: vi.fn(),
  trackEvent: vi.fn(),
  trackPurchaseOnce: vi.fn(),
  buildItemPayload: vi.fn(() => ({})),
  buildCartPayload: vi.fn(() => ({ currency: 'BRL', value: 0, items: [] })),
  getAttributionPayload: vi.fn(() => ({ session_id: 'test-session' })),
}));

// Mock global do componente SEO: não exige HelmetProvider nos testes.
// O SEO só injeta <meta> no head — sem efeito funcional para testes.
vi.mock('../components/SEO', () => ({
  SEO: () => null,
}));
