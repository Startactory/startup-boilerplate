import { fileURLToPath } from 'node:url';
import { readStartupConfig } from './vault/names.mjs';

const REQUIRED_COMPANY_FIELDS = [
  'name',
  'form',
  'address',
  'siren',
  'publicationDirector',
  'mediator',
];

function isFilled(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function checkLegalIdentity(config) {
  const legal = config.legal ?? {};
  const missing = [];
  if (!isFilled(legal.contactEmail)) missing.push('legal.contactEmail');
  if (!legal.company) {
    missing.push('legal.company');
  } else {
    for (const field of REQUIRED_COMPANY_FIELDS) {
      if (!isFilled(legal.company[field])) {
        missing.push(`legal.company.${field}`);
      }
    }
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = checkLegalIdentity(readStartupConfig());
    if (result.ok) {
      console.log('OK  legal identity complete');
    } else {
      console.log(`MISSING  ${result.missing.join(', ')}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exit(1);
  }
}
