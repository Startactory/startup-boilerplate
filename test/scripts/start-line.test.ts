import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GOAL_LIMIT = 4000;
const PLACEHOLDER_BUDGET = 1600;

function startLineIn(path: string): string {
  const text = readFileSync(path, 'utf8');
  const match = text.match(/```text\n(\/goal [^\n]*)\n```/);
  const line = match?.[1];
  if (!line) throw new Error(`no start line in ${path}`);
  return line;
}

describe('create-startup start line', () => {
  const skillLine = startLineIn(
    '.claude/skills/create-startup/references/phase-1-setup.md',
  );

  it('is the same in the README and in the skill', () => {
    expect(startLineIn('README.md')).toBe(skillLine);
  });

  it('leaves room under the /goal limit for the founder answers', () => {
    expect(skillLine.length + PLACEHOLDER_BUDGET).toBeLessThan(GOAL_LIMIT);
  });

  it('keeps the stop markers the run relies on', () => {
    expect(skillLine).toContain('"SMOKE TEST PASSED"');
    expect(skillLine).toContain('"BROWSER CHECK PASSED"');
    expect(skillLine).toContain('"BLOCKED_ON_FOUNDER:"');
  });
});
