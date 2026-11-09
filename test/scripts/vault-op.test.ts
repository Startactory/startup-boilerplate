import { describe, expect, it } from 'vitest';
import {
  classifyOpFailure,
  createOp,
  OpError,
} from '../../scripts/vault/op.mjs';

type Call = { args: string[]; input?: string };
type Result = { status: number; stdout: string; stderr: string };

const MISSING_ITEM =
  '[ERROR] 2026/11/09 10:00:00 "local" isn\'t an item in the "startup-acme" vault. Specify the item with its UUID, name, or domain.';
const DISMISSED =
  '[ERROR] 2026/11/09 10:00:00 authorization prompt dismissed, please try again';
const ok = (stdout = ''): Result => ({ status: 0, stdout, stderr: '' });
const fail = (stderr: string): Result => ({ status: 1, stdout: '', stderr });

function fakeOp(script: (args: string[]) => Result) {
  const calls: Call[] = [];
  const op = createOp({
    run: (args: string[], options?: { input?: string }) => {
      calls.push({ args, input: options?.input });
      return script(args);
    },
  });
  return { op, calls };
}

const isGet = (args: string[]) => args[0] === 'item' && args[1] === 'get';

describe('op wrapper', () => {
  it('never puts a value in argv', () => {
    const { op, calls } = fakeOp((args) =>
      isGet(args) ? fail(MISSING_ITEM) : ok(),
    );
    op.writeFields({
      vault: 'startup-acme',
      item: 'local',
      fields: new Map([['SMTP_PASS', 's3cr3t-value']]),
    });
    expect(
      calls.flatMap((c) => c.args).some((a) => a.includes('s3cr3t-value')),
    ).toBe(false);
  });

  it('sends concealed fields labelled by key on stdin', () => {
    const { op, calls } = fakeOp((args) =>
      isGet(args) ? fail(MISSING_ITEM) : ok(),
    );
    const result = op.writeFields({
      vault: 'startup-acme',
      item: 'local',
      fields: new Map([['SMTP_PASS', 's3cr3t-value']]),
    });
    expect(result).toBe('created');
    const create = calls.find((c) => c.args[1] === 'create');
    expect(create?.args).toEqual([
      'item',
      'create',
      '--vault',
      'startup-acme',
      '-',
    ]);
    const body = JSON.parse(create?.input ?? '{}');
    expect(body).toMatchObject({ title: 'local', category: 'SECURE_NOTE' });
    expect(body.fields[0]).toMatchObject({
      id: 'SMTP_PASS',
      label: 'SMTP_PASS',
      type: 'CONCEALED',
      value: 's3cr3t-value',
    });
  });

  it('updates an existing item by sending the full item on stdin', () => {
    const existing = {
      id: 'abc',
      title: 'local',
      fields: [
        { id: 'notesPlain', label: 'notesPlain', type: 'STRING' },
        { id: 'A', label: 'A', type: 'CONCEALED', value: 'old' },
      ],
    };
    const { op, calls } = fakeOp((args) =>
      isGet(args) ? ok(JSON.stringify(existing)) : ok(),
    );
    const result = op.writeFields({
      vault: 'startup-acme',
      item: 'local',
      fields: new Map([
        ['A', 'new'],
        ['B', 'added'],
      ]),
    });
    expect(result).toBe('updated');
    const edit = calls.find((c) => c.args[1] === 'edit');
    expect(edit?.args).toEqual([
      'item',
      'edit',
      'local',
      '--vault',
      'startup-acme',
    ]);
    const body = JSON.parse(edit?.input ?? '{}');
    expect(body.id).toBe('abc');
    const byLabel = new Map(
      body.fields.map((f: { label: string }) => [f.label, f]),
    );
    expect(byLabel.get('A')).toMatchObject({ value: 'new', type: 'CONCEALED' });
    expect(byLabel.get('B')).toMatchObject({
      value: 'added',
      type: 'CONCEALED',
    });
    expect(byLabel.has('notesPlain')).toBe(true);
  });

  it('reads fields, skipping those without a value', () => {
    const { op, calls } = fakeOp(() =>
      ok(
        JSON.stringify({
          fields: [
            { id: 'notesPlain', label: 'notesPlain' },
            { id: 'A', label: 'A', value: '1' },
          ],
        }),
      ),
    );
    expect(op.readFields({ vault: 'v', item: 'i' })).toEqual(
      new Map([['A', '1']]),
    );
    expect(calls[0]?.args).toEqual([
      'item',
      'get',
      'i',
      '--vault',
      'v',
      '--format',
      'json',
      '--reveal',
    ]);
  });

  it('returns null for a missing item', () => {
    const { op } = fakeOp(() => fail(MISSING_ITEM));
    expect(op.readFields({ vault: 'startup-acme', item: 'local' })).toBeNull();
  });

  it('classifies a dismissed prompt as locked', () => {
    expect(classifyOpFailure(DISMISSED)).toBe('locked');
    const { op } = fakeOp(() => fail(DISMISSED));
    try {
      op.readFields({ vault: 'v', item: 'i' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OpError);
      expect((error as OpError).kind).toBe('locked');
      expect((error as OpError).message).toBe(
        '1Password is locked — approve the prompt and re-run',
      );
    }
  });

  it('does not leak stdin into error messages', () => {
    const { op } = fakeOp((args) =>
      isGet(args) ? fail(MISSING_ITEM) : fail('[ERROR] boom'),
    );
    try {
      op.writeFields({
        vault: 'v',
        item: 'i',
        fields: new Map([['K', 's3cr3t-value']]),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as OpError).kind).toBe('failed');
      expect((error as OpError).message).not.toContain('s3cr3t-value');
    }
  });

  it('ensures a vault', () => {
    const existing = fakeOp(() => ok('{}'));
    expect(existing.op.ensureVault('startup-acme')).toBe('existing');
    const missing = fakeOp((args) =>
      args[1] === 'get'
        ? fail('[ERROR] "x" isn\'t a vault in this account.')
        : ok(),
    );
    expect(missing.op.ensureVault('startup-acme')).toBe('created');
    expect(missing.calls[1]?.args).toEqual(['vault', 'create', 'startup-acme']);
  });

  it('injects and reads', () => {
    const { op, calls } = fakeOp(() => ok('resolved'));
    expect(op.inject('.env.prod')).toBe('resolved');
    expect(op.read('op://v/i/F')).toBe('resolved');
    expect(calls[0]?.args).toEqual(['inject', '-i', '.env.prod']);
    expect(calls[1]?.args).toEqual(['read', 'op://v/i/F']);
  });

  it('throws a clean OpError on unparseable item output', () => {
    const { op } = fakeOp(() => ok('{"fields":[{"value":"s3cr3t-value"'));
    try {
      op.readFields({ vault: 'v', item: 'i' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OpError);
      expect((error as OpError).kind).toBe('failed');
      expect((error as OpError).message).not.toContain('s3cr3t');
    }
  });

  it('omits stderr from write failures', () => {
    const { op } = fakeOp((args) =>
      isGet(args) ? fail(MISSING_ITEM) : fail('[ERROR] bad value s3cr3t-value'),
    );
    try {
      op.writeFields({
        vault: 'v',
        item: 'i',
        fields: new Map([['K', 's3cr3t-value']]),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as OpError).message).toBe('op item create failed for v/i');
    }
  });
});
