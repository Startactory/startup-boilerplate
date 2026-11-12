import { describe, expect, it, vi } from 'vitest';
import { syncStartupProfile } from '../../scripts/sync-startup-profile.mjs';

function sync(currency: string | undefined) {
  return syncStartupProfile({
    config: { name: 'Acme', pricing: currency ? { currency } : undefined },
    writeFile: vi.fn(),
  });
}

describe('syncStartupProfile currency', () => {
  it('defaults to EUR', () => {
    expect(sync(undefined).currency).toBe('EUR');
  });

  it('accepts a valid ISO 4217 code', () => {
    expect(sync('USD').currency).toBe('USD');
  });

  it.each(['eur', 'EURO', 'E1R', 'ZZ'])('rejects "%s"', (currency) => {
    expect(() => sync(currency)).toThrow('pricing.currency');
  });
});
