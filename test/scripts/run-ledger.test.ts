import { describe, expect, it } from 'vitest';
import {
  clearBlocked,
  LEDGER_PATH,
  markBlocked,
  markDone,
  readLedger,
} from '../../scripts/run-ledger.mjs';

function memoryFs() {
  const files = new Map<string, string>();
  const fs = {
    existsSync: (path: string) => files.has(path),
    readFileSync: (path: string) => files.get(path) ?? '',
    writeFileSync: (path: string, content: string) => {
      files.set(path, content);
    },
  };
  return Object.assign(fs as unknown as typeof import('node:fs'), { files });
}

const at = '2026-11-12T10:00:00.000Z';

describe('run ledger', () => {
  it('reads a missing file as an empty ledger', () => {
    expect(readLedger({ fs: memoryFs() })).toEqual({
      done: [],
      blocked: null,
    });
  });

  it('keeps one entry when a step is marked done twice', () => {
    const fs = memoryFs();
    markDone({ fs, step: 'supabase', now: at });
    markDone({ fs, step: 'supabase', now: '2026-11-12T11:00:00.000Z' });
    expect(readLedger({ fs }).done).toEqual([{ step: 'supabase', at }]);
  });

  it('records a block and clears it', () => {
    const fs = memoryFs();
    markBlocked({ fs, action: 'Verify the Stripe account', now: at });
    expect(readLedger({ fs }).blocked).toEqual({
      action: 'Verify the Stripe account',
      at,
    });
    clearBlocked({ fs });
    expect(readLedger({ fs }).blocked).toBeNull();
  });

  it('writes 2-space JSON with a trailing newline', () => {
    const fs = memoryFs();
    markDone({ fs, step: 'vercel', now: at });
    expect(fs.files.get(LEDGER_PATH)).toBe(
      `${JSON.stringify({ done: [{ step: 'vercel', at }], blocked: null }, null, 2)}\n`,
    );
  });
});
