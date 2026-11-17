# Step 1c — Give the startup its own GitHub repository

**Phase 1, step `repository`** (`phase-1-setup.md` section 6), run after the consent with the
founder still present. Phase 2 runs it only when the ledger lost it.

A fresh clone still has `origin` pointing at the boilerplate. Everything later that talks to GitHub
(`gh secret set`, branch protection, CI, the Vercel Git connection) acts on `origin`, so without
this step the startup's production secrets would land in the boilerplate repo. Do it before
anything else touches GitHub.

**Do this yourself; it asks nothing.** The owner is `githubOwner` and the name is `slug`, both in
`startup.config.json` from phase 1 (`phase-1-setup.md` section 2). This step pushes nothing: the first push of
`master` is phase 2's `deploy` step (`06-deploy-production.md` 6j), once the `DATABASE_URL` secret
exists.

## 1. Skip if already done

If `startup.config.json` has a `repository` field, the repository exists and `origin` points at
it, this step is done:

```bash
node -p "require('./startup.config.json').repository ?? ''"
gh repo view "<repository>" --json nameWithOwner -q .nameWithOwner
git remote get-url origin
gh repo set-default --view
```

When the first two print the same `<owner>/<slug>` and the `origin` URL names it, run
`gh repo set-default "<owner>/<slug>"` if the last line printed anything else, and
`git config merge.ours.driver true` (4.4); both are safe to re-run. Then close the step
(section 5, last line). Never rely on `gh` without `--repo` (or the
repository named in the command) before that default is set: with a second remote, `gh` resolves
to `upstream`, the boilerplate.

## 2. Check GitHub access

```bash
gh auth status
gh config get git_protocol -h github.com
```

Read the github.com value (the one `gh auth status` shows as `Git operations protocol`), never the
global `gh config get git_protocol`: they can differ, and only the host value decides how pushes
to GitHub go.

- The founder signed in during phase 1 (checklist item 6, `gh auth login --web -s workflow`), and
  the preflight's `gh-session` check passed. You cannot sign in for them: in phase 2 a lost
  session is a block.
- The token needs the `repo` scope. When `git_protocol` is `https`, it also needs `workflow`:
  GitHub refuses a push that contains `.github/workflows/*` without it, and the error does not
  say why. The fix is `gh auth refresh -s workflow` (browser sign-in again, the founder's). With
  `ssh`, the scope does not matter.

## 3. The owner and the name

The owner is `githubOwner`; the repository name is the `slug`. Check that it is free:

```bash
gh repo view "<owner>/<slug>" --json nameWithOwner 2>/dev/null && echo "TAKEN" || echo "free"
```

`TAKEN` is fine only when it is this startup's repository: `startup.config.json` `repository` is
already `<owner>/<slug>` (an interrupted run). Then reuse it: do 4.1 if `origin` still points at
the boilerplate, do 4.4, and replace 4.3 with

```bash
git remote get-url origin 2>/dev/null || git remote add origin "$(gh repo view "<owner>/<slug>" --json sshUrl -q .sshUrl)"
gh repo set-default "<owner>/<slug>"
```

(use `url` instead of `sshUrl` when `gh config get git_protocol -h github.com` prints `https`).
The first line adds `origin` only when it is missing, so a re-run does not fail on it.

Any other `TAKEN` means the name belongs to something else: never use it. In phase 1, pick a free
variant of the slug, update `startup.config.json` and `package.json`, and tell the founder
(`phase-1-setup.md` checklist item 6). In phase 2 the preflight's `github-repo` check stops the run
before it gets here.

## 4. Create the repository

Work on `master`: the CI workflows and the deploy workflow key off that branch, and so does the
Vercel production branch (`06-deploy-production.md` 6d).

1. Keep the boilerplate as `upstream`, so the startup can pull its fixes later, and make it
   fetch-only so nothing is pushed to it by mistake (skip this when `git remote -v` already shows
   `upstream`, after an interrupted attempt). Run `node scripts/check-working-copy.mjs` first: on
   `STOP` rename nothing, this is not a fresh clone (`SKILL.md`, "Where to start").

   ```bash
   git remote rename origin upstream
   git remote set-url --push upstream DISABLED
   ```

2. Record the repository in `startup.config.json` (`"repository": "<owner>/<slug>"`), then commit
   what phase 1 section 2 wrote (nothing to commit after an interrupted attempt is fine):

   ```bash
   git add startup.config.json package.json autumn.config.ts src/i18n/messages/en.json src/i18n/messages/fr.json
   git commit -m "chore: start <slug> from the boilerplate"
   ```

3. Create the repository **private** and set it as `origin`, without pushing, then make it `gh`'s
   default for this clone:

   ```bash
   gh repo create "<owner>/<slug>" --private --source=. --remote=origin
   gh repo set-default "<owner>/<slug>"
   ```

   `gh repo create --source --remote` sets no default, and with `upstream` present every later
   `gh` command without `--repo` (`gh pr`, `gh run`, `gh api repos/{owner}/{repo}`) would target
   the boilerplate. `gh repo set-default` records the startup's repository for this clone
   (`remote.origin.gh-resolved`) and is safe to re-run. Secrets are the exception: `gh` never uses
   the default for them, so every `gh secret` command passes `--repo` (the scripts do).

   The first push (6j) keeps the boilerplate history: merging `upstream/master` later needs it.

4. Define the `ours` merge driver, one time per clone (it lives in `.git/config`, which is not
   committed, and is safe to re-run):

   ```bash
   git config merge.ours.driver true
   ```

   The committed `.gitattributes` marks the three files the profile sync generates
   (`src/shared/startup-profile/profile.json`, `src/app/brand.css`, `public/brand-logo.png`)
   `merge=ours`. With the driver defined, a later `git merge upstream/master` keeps the
   startup's copies of them instead of a conflict, and the sync regenerates them
   (`after-the-run.md`, "Taking boilerplate fixes"). Without it, git ignores the attribute and
   those files conflict.

## 5. Verify

```bash
git remote -v
gh repo view "<owner>/<slug>" --json nameWithOwner,visibility -q '"\(.nameWithOwner) \(.visibility)"'
gh repo set-default --view
git config merge.ours.driver
```

Expect `origin` on `<owner>/<slug>`, `upstream` on the boilerplate with a `DISABLED` push URL,
`<owner>/<slug> PRIVATE`, `<owner>/<slug>` as the default, and `true`. The repository stays empty
until 6j pushes `master`.

Later, to take boilerplate fixes, follow `after-the-run.md`, "Taking boilerplate fixes".

Then `node scripts/run-ledger.mjs done repository` (prints `STEP repository DONE`).
