import { describe, expect, it } from 'vitest';
import { parseEnv, renderEnv } from '../../scripts/env/dotenv.mjs';

const template =
  '# App\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nDATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"\nSMTP_PASS=\n';

describe('renderEnv', () => {
  it('fills template keys and keeps comments and defaults', () => {
    const out = renderEnv({
      template,
      values: new Map([['SMTP_PASS', 'abcd efgh']]),
    });
    expect(out).toContain('# App');
    expect(out).toContain('NEXT_PUBLIC_APP_URL=http://localhost:3000');
    expect(out).toContain('SMTP_PASS="abcd efgh"');
  });

  it('appends keys the template lacks', () => {
    expect(renderEnv({ template, values: new Map([['EXTRA', 'x']]) })).toMatch(
      /# Not in \.env\.template\nEXTRA=x/,
    );
  });

  it('round-trips awkward values', () => {
    const values = new Map([
      [
        'OTEL_EXPORTER_OTLP_HEADERS',
        'Authorization=Bearer auth_abc,Dash0-Dataset=acme',
      ],
      [
        'DATABASE_URL',
        'postgresql://postgres.ref:p%40ss@aws-0-eu-west-3.pooler.supabase.com:5432/postgres',
      ],
      ['SMTP_FROM_NAME', 'Acme #1'],
    ]);
    const parsed = parseEnv(renderEnv({ template, values }));
    for (const [k, v] of values) expect(parsed.get(k)).toBe(v);
  });

  it('refuses a value with a newline', () => {
    expect(() =>
      renderEnv({ template, values: new Map([['SMTP_PASS', 'a\nb']]) }),
    ).toThrow('SMTP_PASS contains a newline');
  });
});

describe('parseEnv', () => {
  it('skips comments and empty values and strips quotes', () => {
    const parsed = parseEnv('# c\nA=1\nB=\nC="x y"\nD=\'z\'\nnoequals\n');
    expect([...parsed]).toEqual([
      ['A', '1'],
      ['C', 'x y'],
      ['D', 'z'],
    ]);
  });
});
