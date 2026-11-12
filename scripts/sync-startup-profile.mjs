import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { icons } from 'lucide-react';
import * as v from 'valibot';
import { deriveAccentTokens } from './brand/accent.mjs';
import { readStartupConfig } from './vault/names.mjs';

const PROFILE_PATH = 'src/shared/startup-profile/profile.json';
const BRAND_CSS_PATH = 'src/app/brand.css';
const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_ICON = 'Sparkles';
const DEFAULT_ACCENT = '#2f3130';

const NEUTRAL_LEGAL = {
  termsVersion: '0',
  founderName: '',
  contactEmail: '',
  company: null,
};

const text = v.string();
const Company = v.object({
  name: text,
  form: text,
  address: text,
  siren: text,
  publicationDirector: text,
  rcs: v.optional(text),
  vatNumber: v.optional(text),
  shareCapital: v.optional(text),
});
const Legal = v.object({
  termsVersion: text,
  founderName: text,
  contactEmail: text,
  company: v.nullable(Company),
});

function resolveBrand(brand) {
  const icon = brand?.icon ?? DEFAULT_ICON;
  const accent = brand?.accent ?? DEFAULT_ACCENT;
  if (!Object.hasOwn(icons, icon)) {
    throw new Error(`brand.icon "${icon}" is not a lucide-react icon name`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(accent)) {
    throw new Error(`brand.accent "${accent}" must be #rrggbb`);
  }
  return { icon, accent: accent.toLowerCase() };
}

function resolveLegal(legal) {
  if (legal === undefined) return NEUTRAL_LEGAL;
  const result = v.safeParse(Legal, legal);
  if (!result.success) {
    const path = result.issues[0].path?.map((item) => item.key).join('.');
    throw new Error(
      `legal.${path ?? ''} is invalid: ${result.issues[0].message}`,
    );
  }
  return result.output;
}

function renderBrandCss(tokens) {
  return `:root:not(.dark) {
  --charcoal: ${tokens.charcoal};
  --charcoal-deep: ${tokens.charcoalDeep};
  --charcoal-soft: ${tokens.charcoalSoft};
  --primary: ${tokens.charcoal};
  --ring: ${tokens.ring};
  --chart-1: ${tokens.charcoal};
  --sidebar-primary: ${tokens.charcoal};
  --sidebar-accent-foreground: ${tokens.charcoal};
  --sidebar-accent: ${tokens.charcoalSoft};
}
`;
}

export function syncStartupProfile({ config, writeFile }) {
  const brand = resolveBrand(config.brand);
  const profile = {
    name: config.name ?? '',
    brand,
    currency: config.pricing?.currency ?? DEFAULT_CURRENCY,
    legal: resolveLegal(config.legal),
  };
  writeFile(PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`);
  writeFile(BRAND_CSS_PATH, renderBrandCss(deriveAccentTokens(brand.accent)));
  return profile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const profile = syncStartupProfile({
      config: readStartupConfig(),
      writeFile: writeFileSync,
    });
    console.log(`OK  startup profile synced (${profile.name})`);
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exit(1);
  }
}
