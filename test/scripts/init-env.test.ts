import { describe, expect, it, vi } from 'vitest';
import { applyPlan, planInitialValues } from '../../scripts/init-env.mjs';

const CONFIG = { slug: 'acme', dataRegion: 'eu' as const };

function plan(existing: Map<string, string>, appUrl?: string) {
  return planInitialValues({ existing, appUrl, config: CONFIG });
}

function entry(list: ReturnType<typeof plan>, key: string) {
  const found = list.find((item) => item.key === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

describe('planInitialValues', () => {
  it('generates secrets only when unset', () => {
    const list = plan(new Map([['BETTER_AUTH_SECRET', 'already-set']]));
    expect(entry(list, 'BETTER_AUTH_SECRET').next).toBeNull();
    expect(entry(list, 'EARLY_ACCESS_PEPPER').next).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives the PostHog host from dataRegion', () => {
    const list = planInitialValues({
      existing: new Map(),
      config: { slug: 'acme', dataRegion: 'us' },
    });
    expect(entry(list, 'NEXT_PUBLIC_POSTHOG_HOST').next).toBe(
      'https://us.i.posthog.com',
    );
    expect(entry(list, 'OTEL_SERVICE_NAME').next).toBe('acme');
  });

  it('an explicit app URL replaces a stale one', () => {
    const list = plan(
      new Map([['NEXT_PUBLIC_APP_URL', 'http://localhost:3000']]),
      'https://acme.com',
    );
    expect(entry(list, 'NEXT_PUBLIC_APP_URL').next).toBe('https://acme.com');
  });

  it('keeps a set production URL when no app URL is given', () => {
    const list = plan(
      new Map([
        ['NEXT_PUBLIC_APP_URL', 'https://acme.com'],
        ['BETTER_AUTH_URL', 'https://acme.com'],
      ]),
    );
    expect(entry(list, 'NEXT_PUBLIC_APP_URL').next).toBeNull();
    expect(entry(list, 'BETTER_AUTH_URL').next).toBeNull();
  });

  it('defaults unset URLs to localhost when no app URL is given', () => {
    const list = plan(new Map());
    expect(entry(list, 'NEXT_PUBLIC_APP_URL').next).toBe(
      'http://localhost:3000',
    );
  });
});

describe('applyPlan', () => {
  it('writes once to the vault, then syncs the env file', () => {
    const calls: string[] = [];
    const op = {
      ensureVault: vi.fn(() => calls.push('ensureVault')),
      writeFields: vi.fn((_: { fields: Map<string, string> }) =>
        calls.push('writeFields'),
      ),
      readFields: vi.fn(() => {
        calls.push('readFields');
        return new Map([['EMAIL_PROVIDER', 'smtp']]);
      }),
    };
    const fs = {
      readFileSync: vi.fn(() => 'EMAIL_PROVIDER=\n'),
      writeFileSync: vi.fn(),
    };
    applyPlan({
      op,
      vault: 'startup-acme',
      environment: 'local',
      plan: plan(new Map()),
      fs,
    });
    expect(op.writeFields).toHaveBeenCalledTimes(1);
    const fields = op.writeFields.mock.calls[0]?.[0].fields;
    expect(fields?.get('OTEL_SERVICE_NAME')).toBe('acme');
    expect(calls).toEqual(['ensureVault', 'writeFields', 'readFields']);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
