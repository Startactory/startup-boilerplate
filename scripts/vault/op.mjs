import { spawnSync } from 'node:child_process';

import { readServiceAccountToken } from './service-account.mjs';

const FAILURE_PATTERNS = {
  missing: /isn't an item|isn't a vault|does not have a field/i,
  rateLimited: /\(429\)|Too Many Requests/i,
  unauthorized:
    /DecodeSACredentials|\(401\)|unauthorized|invalid token|account is not signed in|connecting to desktop app|desktop app is not running|not currently signed in|authorization prompt dismissed|authorization timeout|is locked/i,
};

const MESSAGES = {
  unauthorized:
    '1Password rejected the service account token — run step 0, item 2',
  'rate-limited':
    '1Password rate limit reached for the service account — retry in an hour',
};

export function classifyOpFailure(stderr) {
  if (FAILURE_PATTERNS.missing.test(stderr)) return 'missing';
  if (FAILURE_PATTERNS.rateLimited.test(stderr)) return 'rate-limited';
  if (FAILURE_PATTERNS.unauthorized.test(stderr)) return 'unauthorized';
  return 'failed';
}

export class OpError extends Error {
  constructor(kind, message) {
    super(MESSAGES[kind] ?? message ?? `op ${kind}`);
    this.name = 'OpError';
    this.kind = kind;
  }
}

// spawnSync hands the child a socketpair; op only reads a template from a real pipe.
export const PIPE_STDIN_SHELL = 'cat | exec op "$@"';

function createDefaultRunner({ readToken, spawn }) {
  let token;
  return (args, options = {}) => {
    token ??= readToken();
    const [command, commandArgs] =
      options.input === undefined
        ? ['op', args]
        : ['/bin/sh', ['-c', PIPE_STDIN_SHELL, 'op', ...args]];
    const result = spawn(command, commandArgs, {
      input: options.input,
      encoding: 'utf8',
      env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.error
        ? String(result.error.message)
        : (result.stderr ?? ''),
    };
  };
}

function failureFrom(args, stderr, subject) {
  const kind = classifyOpFailure(stderr);
  const command = args.slice(0, 2).join(' ');
  if (subject) return new OpError(kind, `op ${command} failed for ${subject}`);
  return new OpError(kind, `op ${command} ${kind}: ${stderr.trim()}`);
}

export function createOp({
  readToken = readServiceAccountToken,
  spawn = spawnSync,
  run = createDefaultRunner({ readToken, spawn }),
} = {}) {
  function exec(args, options, subject) {
    const result = run(args, options);
    if (result.status !== 0) throw failureFrom(args, result.stderr, subject);
    return result.stdout;
  }

  function fetchItem({ vault, item }) {
    const args = [
      'item',
      'get',
      item,
      '--vault',
      vault,
      '--format',
      'json',
      '--reveal',
    ];
    const result = run(args);
    if (result.status === 0) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        throw new OpError('failed', 'op item get returned unparseable output');
      }
    }
    const error = failureFrom(args, result.stderr);
    if (error.kind === 'missing') return null;
    throw error;
  }

  function readFields({ vault, item }) {
    const found = fetchItem({ vault, item });
    if (!found) return null;
    const fields = new Map();
    for (const field of found.fields ?? []) {
      if (field.label && typeof field.value === 'string' && field.value) {
        fields.set(field.label, field.value);
      }
    }
    return fields;
  }

  function verifyWritten({ vault, item, fields, action }) {
    const stored = readFields({ vault, item });
    for (const [key, value] of fields) {
      if (stored?.get(key) !== value) {
        throw new OpError(
          'failed',
          `op item ${action} did not apply for ${vault}/${item}`,
        );
      }
    }
  }

  function writeFields({ vault, item, fields }) {
    const existing = fetchItem({ vault, item });
    if (!existing) {
      const body = {
        title: item,
        category: 'SECURE_NOTE',
        fields: [...fields].map(([key, value]) => ({
          id: key,
          label: key,
          type: 'CONCEALED',
          value,
        })),
      };
      exec(
        ['item', 'create', '--vault', vault, '-'],
        { input: JSON.stringify(body) },
        `${vault}/${item}`,
      );
      verifyWritten({ vault, item, fields, action: 'create' });
      return 'created';
    }
    const merged = [...(existing.fields ?? [])];
    for (const [key, value] of fields) {
      const index = merged.findIndex((f) => f.label === key);
      if (index === -1) {
        merged.push({ id: key, label: key, type: 'CONCEALED', value });
      } else {
        merged[index] = { ...merged[index], type: 'CONCEALED', value };
      }
    }
    exec(
      ['item', 'edit', item, '--vault', vault],
      { input: JSON.stringify({ ...existing, fields: merged }) },
      `${vault}/${item}`,
    );
    verifyWritten({ vault, item, fields, action: 'edit' });
    return 'updated';
  }

  function ensureVault(name) {
    const args = ['vault', 'get', name, '--format', 'json'];
    const result = run(args);
    if (result.status === 0) return 'existing';
    const error = failureFrom(args, result.stderr);
    if (error.kind !== 'missing') throw error;
    exec(['vault', 'create', name]);
    return 'created';
  }

  return {
    ensureVault,
    readFields,
    writeFields,
    inject: (path) => exec(['inject', '-i', path]),
    injectText: (text) => exec(['inject'], { input: text }),
    read: (reference) => exec(['read', reference]),
  };
}
