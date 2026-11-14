import { describe, expect, it } from 'vitest';
import { checkWorkingCopy } from '../../scripts/check-working-copy.mjs';

const BOILERPLATE_URL = 'git@github.com:Startactory/startup-boilerplate.git';
const MAIN_WORKTREE =
  'worktree /work/acme\nHEAD abc123\nbranch refs/heads/master\n';
const LINKED_WORKTREE =
  'worktree /work/acme-fix\nHEAD def456\nbranch refs/heads/fix/thing\n';

function fakeGit({
  code = 0,
  remotes = 'origin\n',
  branches = 'master\n',
  worktrees = MAIN_WORKTREE,
}: {
  code?: number;
  remotes?: string;
  branches?: string;
  worktrees?: string;
} = {}) {
  const outputs: Record<string, string> = {
    remote: remotes,
    'branch --format=%(refname:short)': branches,
    'worktree list --porcelain': worktrees,
    'remote get-url origin': `${BOILERPLATE_URL}\n`,
  };
  return (args: string[]) => {
    const stdout = outputs[args.join(' ')];
    if (code !== 0 || stdout === undefined)
      return { code: code || 1, stdout: '' };
    return { code: 0, stdout };
  };
}

const noConfig = () => {
  throw new Error('ENOENT: no such file or directory');
};

describe('checkWorkingCopy', () => {
  it('accepts a fresh clone', () => {
    expect(checkWorkingCopy({ git: fakeGit(), readConfig: noConfig })).toEqual({
      ok: true,
      message: 'working copy is a fresh clone',
    });
  });

  it('accepts a fresh clone where phase 1 already wrote the config', () => {
    const result = checkWorkingCopy({
      git: fakeGit(),
      readConfig: () => JSON.stringify({ slug: 'acme' }),
    });
    expect(result.ok).toBe(true);
  });

  it("accepts the startup's own clone once the repository step ran", () => {
    const result = checkWorkingCopy({
      git: fakeGit({
        remotes: 'origin\nupstream\n',
        branches: 'fix/thing\nmaster\n',
        worktrees: `${MAIN_WORKTREE}\n${LINKED_WORKTREE}`,
      }),
      readConfig: () => JSON.stringify({ repository: 'ada/acme' }),
    });
    expect(result).toEqual({
      ok: true,
      message: "working copy is this startup's clone (ada/acme)",
    });
  });

  it('stops in a development checkout with several branches', () => {
    const result = checkWorkingCopy({
      git: fakeGit({ branches: 'feat/a\nfix/b\nmaster\n' }),
      readConfig: noConfig,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('3 local branches and 0 linked worktrees');
    expect(result.message).toContain(
      `git clone ${BOILERPLATE_URL} <new folder>`,
    );
  });

  it('stops in a checkout that has linked worktrees', () => {
    const result = checkWorkingCopy({
      git: fakeGit({ worktrees: `${MAIN_WORKTREE}\n${LINKED_WORKTREE}` }),
      readConfig: noConfig,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('1 local branch and 1 linked worktree');
  });

  it('does not trust upstream alone without a recorded repository', () => {
    const result = checkWorkingCopy({
      git: fakeGit({
        remotes: 'origin\nupstream\n',
        branches: 'feat/a\nmaster\n',
      }),
      readConfig: noConfig,
    });
    expect(result.ok).toBe(false);
  });

  it('stops outside a git working copy', () => {
    const result = checkWorkingCopy({
      git: fakeGit({ code: 128 }),
      readConfig: noConfig,
    });
    expect(result).toEqual({
      ok: false,
      message:
        'not a git working copy — clone the boilerplate into a new folder and run the skill there',
    });
  });
});
