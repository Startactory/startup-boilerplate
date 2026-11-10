import { validateEnvValue } from './env/rules.mjs';
import { readMasterKeys } from './providers/master-keys.mjs';
import {
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { ValidationError } from './vault-put.mjs';
import { syncEnvFile } from './vault-sync.mjs';

const MASTER_FIELDS = ['SMTP_USER', 'SMTP_PASS'];

function assertValid(fields, environment) {
  const errors = [];
  for (const [field, value] of fields) {
    const result = validateEnvValue(field, value, { environment });
    for (const message of result.errors) errors.push(`${field}: ${message}`);
  }
  if (errors.length > 0) throw new ValidationError(errors);
}

export function copySmtpCredentials({ op, vault, syncEnv = syncEnvFile }) {
  const master = readMasterKeys({ op, fields: MASTER_FIELDS });
  const user = master.get('SMTP_USER');
  const fields = new Map([
    ['SMTP_USER', user],
    ['SMTP_PASS', master.get('SMTP_PASS')],
    ['SMTP_FROM_EMAIL', user],
    ['EMAIL_PROVIDER', 'smtp'],
  ]);

  for (const environment of ['local', 'production']) {
    const item = ITEM_FOR_ENVIRONMENT[environment];
    if (!op.readFields({ vault, item })) {
      const suffix = environment === 'production' ? ' --file .env.prod' : '';
      throw new Error(
        `no 1Password item ${vault}/${item} — run node scripts/init-env.mjs --apply${suffix} first`,
      );
    }
  }
  assertValid(fields, 'local');

  for (const environment of ['local', 'production']) {
    op.writeFields({
      vault,
      item: ITEM_FOR_ENVIRONMENT[environment],
      fields,
    });
  }
  for (const environment of ['local', 'production']) {
    syncEnv({ op, vault, environment });
  }
}

function main() {
  try {
    const vault = startupVault(readStartupConfig().slug);
    copySmtpCredentials({ op: createOp(), vault });
    console.log(
      `OK  SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL and EMAIL_PROVIDER stored in ${vault}/local and ${vault}/production`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      for (const message of error.errors) console.error(`ERROR    ${message}`);
      console.error('Nothing was written.');
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vault-copy-smtp.mjs')) {
  main();
}
