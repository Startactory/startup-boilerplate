import { describe, expect, it } from 'vitest';
import { main, resolveEnvValues } from '../../scripts/push-env-to-vercel.mjs';
import { OpError } from '../../scripts/vault/op.mjs';

const REFERENCE_FILE =
  'DATABASE_URL=op://startup-acme/production/DATABASE_URL\n';

function fakeFs(files: Record<string, string>) {
  return {
    existsSync: (path: string) => path in files,
    readFileSync: (path: string) => files[path] ?? '',
  };
}

describe('push-env-to-vercel', () => {
  it('resolves references through op inject', () => {
    const op = { injectText: () => 'DATABASE_URL=postgresql://real\n' };
    const values = resolveEnvValues({
      path: '.env.prod',
      op,
      fs: fakeFs({ '.env.prod': REFERENCE_FILE }),
    });
    expect(values.get('DATABASE_URL')).toBe('postgresql://real');
  });

  it('ignores op:// text in comments', () => {
    const received: string[] = [];
    const op = {
      injectText: (text: string) => {
        received.push(text);
        return 'DATABASE_URL=postgresql://real\n';
      },
    };
    const values = resolveEnvValues({
      path: '.env.prod',
      op,
      fs: fakeFs({
        '.env.prod': `# refs look like op://startup-x/production/<KEY>\nPLAIN=1\n${REFERENCE_FILE}`,
      }),
    });
    expect(received).toEqual([REFERENCE_FILE]);
    expect(values.get('PLAIN')).toBe('1');
    expect(values.get('DATABASE_URL')).toBe('postgresql://real');
  });

  it('refuses an unresolved reference', () => {
    const op = {
      injectText: () =>
        'GOOGLE_CLIENT_SECRET=op://startup-acme/production/GOOGLE_CLIENT_SECRET\n',
    };
    expect(() =>
      resolveEnvValues({
        path: '.env.prod',
        op,
        fs: fakeFs({ '.env.prod': REFERENCE_FILE }),
      }),
    ).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('pushes nothing when a reference cannot be resolved', () => {
    const calls: string[][] = [];
    const run = (_command: string, args: string[]) => {
      calls.push(args);
      return { status: 0, stderr: '' };
    };
    const op = {
      injectText: () => {
        throw new OpError('missing');
      },
    };
    const code = main({
      argv: ['--file', '.env.prod', '--apply'],
      op,
      run,
      fs: fakeFs({
        '.env.prod': REFERENCE_FILE,
        '.vercel/project.json': '{}',
      }),
    });
    expect(code).toBe(1);
    expect(calls.filter((args) => args[0] === 'env')).toHaveLength(0);
  });
});
