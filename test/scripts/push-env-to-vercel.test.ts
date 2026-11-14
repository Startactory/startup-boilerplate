import { describe, expect, it, vi } from 'vitest';
import {
  main,
  pushEnv,
  resolveEnvValues,
} from '../../scripts/push-env-to-vercel.mjs';
import { OpError } from '../../scripts/vault/op.mjs';

const REFERENCE_FILE =
  'DATABASE_URL=op://startup-acme/production/DATABASE_URL\n';

function fakeFs(files: Record<string, string>) {
  return {
    existsSync: (path: string) => path in files,
    readFileSync: (path: string) => files[path] ?? '',
  };
}

describe('pushEnv', () => {
  function recordingRun(stderrFor: Record<string, string> = {}) {
    const calls: string[][] = [];
    const run = (_command: string, args: string[]) => {
      calls.push(args);
      const key = args[2] ?? '';
      if (args[1] === 'add' && stderrFor[key]) {
        return { status: 1, stderr: stderrFor[key] };
      }
      return { status: 0, stderr: '' };
    };
    return { calls, run };
  }

  it('passes the environment with --environment', () => {
    const { calls, run } = recordingRun();
    pushEnv({
      values: new Map([['DATABASE_URL', 'postgres://x']]),
      target: 'production',
      run,
    });
    expect(calls).toEqual([
      ['env', 'rm', 'DATABASE_URL', '--environment', 'production', '--yes'],
      ['env', 'add', 'DATABASE_URL', '--environment', 'production'],
    ]);
  });

  it('marks NEXT_PUBLIC_ variables as public config', () => {
    const { calls, run } = recordingRun();
    pushEnv({
      values: new Map([['NEXT_PUBLIC_POSTHOG_KEY', 'phc_x']]),
      target: 'production',
      run,
    });
    expect(calls[1]).toEqual([
      'env',
      'add',
      'NEXT_PUBLIC_POSTHOG_KEY',
      '--environment',
      'production',
      '--type',
      'config',
    ]);
  });

  it('reports the message of a JSON error from the CLI', () => {
    const { run } = recordingRun({
      DATABASE_URL:
        '! some warning\n{\n  "status": "error",\n  "message": "Project not found (404)"\n}\n',
    });
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => errors.push(line);
    try {
      const result = pushEnv({
        values: new Map([['DATABASE_URL', 'postgres://x']]),
        target: 'production',
        run,
      });
      expect(result).toEqual({ ok: 0, failed: 1 });
    } finally {
      console.error = original;
    }
    expect(errors).toEqual(['  FAILED  DATABASE_URL: Project not found (404)']);
  });
});

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

  it('points to a deploy through CI after a push, never the Vercel CLI', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = main({
        argv: ['--file', '.env.prod', '--apply'],
        op: { injectText: () => '' },
        run: () => ({ status: 0, stderr: '' }),
        fs: fakeFs({
          '.env.prod': [
            'NEXT_PUBLIC_APP_URL=https://acme.vercel.app',
            'BETTER_AUTH_URL=https://acme.vercel.app',
            'DATABASE_URL=postgresql://user:pass@db.example.com:5432/postgres',
            'DATABASE_SSL=require',
            'BETTER_AUTH_SECRET=a-long-enough-test-secret-value-1234',
            'GOOGLE_CLIENT_ID=id.apps.googleusercontent.com',
            'GOOGLE_CLIENT_SECRET=test-client-secret',
            'AUTUMN_SECRET_KEY=am_sk_test_value',
          ].join('\n'),
          '.vercel/project.json': '{}',
        }),
      });
      expect(code).toBe(0);
      const output = log.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('gh run rerun');
      expect(output).not.toContain('vercel --prod');
    } finally {
      log.mockRestore();
    }
  });
});
