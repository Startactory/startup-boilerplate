# Live test of the create-startup skill

How a maintainer runs the skill end to end as a founder, so the run itself asks as little as a
real founder's run and the follow-up work asks nothing.

## Before the session

1. Clone the boilerplate into a new folder, never the development checkout:
   `gh repo clone Startactory/startup-boilerplate ~/Desktop/Projects/test-startup-<n>`.
   `scripts/check-working-copy.mjs` stops a run anywhere else.
2. Open a new session **in that folder**, add the boilerplate checkout to it as a second folder
   (the defect notes and the fixes go there), and pick bypass permissions mode in the mode
   selector before the first message. Both folders are then open from the start, so no folder
   access prompt comes up later.
3. Sign Chrome in to the test founder's Google account, and the Vercel CLI to the account the
   test uses.

## The first message

Paste the start line from `README.md`, filled in, followed by a test context paragraph such as:

```text
Test context: this is a verification run of the boilerplate. Do not change the skill or the
scripts to get past a defect: note each one in create-startup-live-run-defects-<n>.md in the
boilerplate checkout (step, command, exact output, what the run did). After the run, without
asking me: fix every defect on a new branch of the boilerplate checkout, run pnpm validate,
commit, push, open a pull request, and turn Auto-fix on for it. Do not merge it.
```

That paragraph is the maintainer's pre-approval for the follow-up work, so the session never
stops to ask "fix them?", "commit and open the PR?" or "turn on Auto-fix?". Merging stays a
human step.
