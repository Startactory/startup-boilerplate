import { FOUNDER_VAULT, MASTER_KEYS_ITEM } from '../vault/names.mjs';

export function readMasterKeys({ op, fields }) {
  const stored = op.readFields({
    vault: FOUNDER_VAULT,
    item: MASTER_KEYS_ITEM,
  });
  const keys = new Map();
  const missing = [];
  for (const field of fields) {
    const value = stored?.get(field);
    if (value) keys.set(field, value);
    else missing.push(field);
  }
  if (missing.length > 0) {
    throw new Error(
      `missing in ${FOUNDER_VAULT}/${MASTER_KEYS_ITEM}: ${missing.join(', ')} — run step 0, item 6`,
    );
  }
  return keys;
}
