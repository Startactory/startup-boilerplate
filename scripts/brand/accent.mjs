const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const ON_PRIMARY = '#faf9f5';
const MIN_CONTRAST = 4.5;
const DARKEN_STEP = 0.05;
const DEEP_FACTOR = 0.68;
const SOFT_TINT = 0.1;

function parseHex(hex) {
  if (typeof hex !== 'string' || !HEX_PATTERN.test(hex)) {
    throw new Error('accent must be #rrggbb');
  }
  return [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
}

function toHex(channels) {
  return `#${channels
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [
    relativeLuminance(hexA),
    relativeLuminance(hexB),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function scale(hex, factor) {
  return toHex(parseHex(hex).map((channel) => channel * factor));
}

function mix(hex, otherHex, otherWeight) {
  const other = parseHex(otherHex);
  return toHex(
    parseHex(hex).map(
      (channel, index) =>
        channel * (1 - otherWeight) + other[index] * otherWeight,
    ),
  );
}

export function deriveAccentTokens(hex) {
  parseHex(hex);
  let charcoal = hex.toLowerCase();
  let factor = 1;
  while (contrastRatio(charcoal, ON_PRIMARY) < MIN_CONTRAST) {
    factor -= DARKEN_STEP;
    charcoal = scale(hex, factor);
  }
  return {
    charcoal,
    charcoalDeep: scale(charcoal, DEEP_FACTOR),
    charcoalSoft: mix(ON_PRIMARY, charcoal, SOFT_TINT),
    ring: charcoal,
  };
}
