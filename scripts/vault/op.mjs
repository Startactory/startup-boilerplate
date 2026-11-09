import { spawnSync } from 'node:child_process';

// Task 0 may refine these against the real CLI; keep every stderr pattern here.
const FAILURE_PATTERNS = {
  missing: /isn't an item|isn't a vault/i,
  locked:
    /not currently signed in|authorization prompt dismissed|authorization timeout|is locked|connecting to desktop app/i,
};

const LOCKED_MESSAGE = '1Password is locked — approve the prompt and re-run';

export function classifyOpFailure(stderr) {
  if (FAILURE_PATTERNS.missing.test(stderr)) return 'missing';
  if (FAILURE_PATTERNS.locked.test(stderr)) return 'locked';
  return 'failed';
}

export class OpError extends Error {
  constructor(kind, message) {
    super(kind === 'locked' ? LOCKED_MESSAGE : (message ?? `op ${kind}`));
    this.name = 'OpError';
    this.kind = kind;
  }
}

function defaultRunner(args, options = {}) {
  const result = spawnSync('op', args, {
    input: options.input,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.error ? String(result.error.message) : (result.stderr ?? ''),
  };
}

function failureFrom(args, stderr) {
  const kind = classifyOpFailure(stderr);
  const command = args.slice(0, 2).join(' ');
  return new OpError(kind, `op ${command} ${kind}: ${stderr.trim()}`);
}

export function createOp({ run = defaultRunner } = {}) {
  function exec(args, options) {
    const result = run(args, options);
    if (result.status !== 0) throw failureFrom(args, result.stderr);
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
    if (result.status === 0) return JSON.parse(result.stdout);
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
      exec(['item', 'create', '--vault', vault, '-'], {
        input: JSON.stringify(body),
      });
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
    exec(['item', 'edit', item, '--vault', vault], {
      input: JSON.stringify({ ...existing, fields: merged }),
    });
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
    read: (reference) => exec(['read', reference]),
  };
}
