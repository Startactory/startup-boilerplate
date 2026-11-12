import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deriveAccentTokens,
} from '../../scripts/brand/accent.mjs';

const ON_PRIMARY = '#faf9f5';

describe('contrastRatio', () => {
  it('is about 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('accepts the current charcoal against the foreground', () => {
    expect(contrastRatio('#2f3130', ON_PRIMARY)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('deriveAccentTokens', () => {
  it('darkens a bright accent until the foreground is readable on it', () => {
    const { charcoal } = deriveAccentTokens('#FFE600');
    expect(contrastRatio(charcoal, ON_PRIMARY)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps an already readable accent unchanged', () => {
    expect(deriveAccentTokens('#2f3130').charcoal).toBe('#2f3130');
  });

  it('derives a darker deep tone and a lighter soft tone', () => {
    const { charcoal, charcoalDeep, charcoalSoft, ring } =
      deriveAccentTokens('#1d4ed8');
    expect(contrastRatio(charcoalDeep, '#ffffff')).toBeGreaterThan(
      contrastRatio(charcoal, '#ffffff'),
    );
    expect(contrastRatio(charcoalSoft, '#000000')).toBeGreaterThan(
      contrastRatio(charcoal, '#000000'),
    );
    expect(ring).toBe(charcoal);
  });

  it('rejects a value that is not #rrggbb', () => {
    expect(() => deriveAccentTokens('blue')).toThrow('accent must be #rrggbb');
  });
});
