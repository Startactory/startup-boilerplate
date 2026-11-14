import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONFIG_PATH = 'startup.config.json';

function nonEmptyLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function counted(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function readRepository(readConfig) {
  try {
    const { repository } = JSON.parse(readConfig());
    return typeof repository === 'string' ? repository : '';
  } catch {
    return '';
  }
}

export function checkWorkingCopy({
  git,
  readConfig = () => readFileSync(CONFIG_PATH, 'utf8'),
}) {
  const remotes = git(['remote']);
  if (remotes.code !== 0) {
    return {
      ok: false,
      message:
        'not a git working copy — clone the boilerplate into a new folder and run the skill there',
    };
  }
  const repository = readRepository(readConfig);
  if (repository && nonEmptyLines(remotes.stdout).includes('upstream')) {
    return {
      ok: true,
      message: `working copy is this startup's clone (${repository})`,
    };
  }
  const branches = nonEmptyLines(
    git(['branch', '--format=%(refname:short)']).stdout,
  ).length;
  const worktrees = nonEmptyLines(
    git(['worktree', 'list', '--porcelain']).stdout,
  ).filter((line) => line.startsWith('worktree ')).length;
  const linkedWorktrees = Math.max(worktrees - 1, 0);
  if (branches <= 1 && linkedWorktrees === 0) {
    return { ok: true, message: 'working copy is a fresh clone' };
  }
  const origin =
    git(['remote', 'get-url', 'origin']).stdout.trim() || '<boilerplate url>';
  return {
    ok: false,
    message: `this working copy has ${counted(branches, 'local branch', 'local branches')} and ${counted(linkedWorktrees, 'linked worktree', 'linked worktrees')}: it is a development checkout, not a fresh clone — run git clone ${origin} <new folder> and run the skill in that folder`,
  };
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return { code: result.status ?? 1, stdout: result.stdout ?? '' };
}

function main() {
  const { ok, message } = checkWorkingCopy({ git: runGit });
  console.log(ok ? `OK  ${message}` : `STOP  ${message}`);
  if (!ok) process.exit(1);
}

if (process.argv[1]?.endsWith('check-working-copy.mjs')) {
  main();
}
