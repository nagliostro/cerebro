import { describe, expect, it } from 'vitest';

import { pickLocale } from './i18n';

describe('pickLocale', () => {
  it('follows the browser order', () => {
    expect(pickLocale('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt-BR');
    expect(pickLocale('en-US,en;q=0.9,pt-BR;q=0.8')).toBe('en');
  });

  it('respects q values, not only position', () => {
    expect(pickLocale('en;q=0.5,pt-PT;q=0.9')).toBe('pt-BR');
  });

  it('skips languages it does not speak', () => {
    expect(pickLocale('fr-FR,pt;q=0.7')).toBe('pt-BR');
  });

  it('falls back to English', () => {
    expect(pickLocale('de-DE')).toBe('en');
    expect(pickLocale('')).toBe('en');
    expect(pickLocale(null)).toBe('en');
    expect(pickLocale('pt;q=0')).toBe('en');
  });
});
