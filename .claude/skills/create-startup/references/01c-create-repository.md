# Step 1c — Give the startup its own GitHub repository

**Phase 1, step `repository`** (`phase-1-setup.md` section 6), run after the consent with the
founder still present. Phase 2 runs it only when the ledger lost it.

A fresh clone still has `origin` pointing at the boilerplate. Everything later that talks to GitHub
(`gh secret set`, branch protection, CI, the Vercel Git connection) acts on `origin`, so without
this step the startup's production secrets would land in the boilerplate repo. Do it before
anything else touches GitHub.

**Do this yourself; it asks nothing.** The owner is `githubOwner` and the name is `slug`, both in
`startup.config.json` from the phase 1 interview. This step pushes nothing: the first push of
`master` is phase 2's `deploy` step (`06-deploy-production.md` 6j), once the `DATABASE_URL` secret
exists.

## 1. Skip if already done

If `startup.config.json` has a `repository` field and `origin` points at it, this step is done:

```bash
node -p "require('./startup.config.json').repository ?? ''"
gh repo view --json nameWithOwner -q .nameWithOwner
```

If both print the same `<owner>/<slug>`, close the step (section 5, last line).

## 2. Check GitHub access

```bash
gh auth status
gh config get git_protocol
```

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
the boilerplate, and replace 4.3 with
`git remote add origin "$(gh repo view "<owner>/<slug>" --json sshUrl -q .sshUrl)"`
(use `url` instead of `sshUrl` when `git_protocol` is `https`).

Any other `TAKEN` means the name belongs to something else: never use it. In phase 1, pick a free
variant of the slug, update `startup.config.json` and `package.json`, and tell the founder
(`phase-1-setup.md` checklist item 6). In phase 2 the preflight's `github-repo` check stops the run
before it gets here.

## 4. Create the repository

Work on `master`: the CI workflows, the deploy workflow and `vercel.json` all key off that branch.

1. Keep the boilerplate as `upstream`, so the startup can pull its fixes later, and make it
   fetch-only so nothing is pushed to it by mistake (skip this when `git remote -v` already shows
   `upstream`, after an interrupted attempt):

   ```bash
   git remote rename origin upstream
   git remote set-url --push upstream DISABLED
   ```

2. Record the repository in `startup.config.json` (`"repository": "<owner>/<slug>"`), then commit
   what the phase 1 interview wrote (nothing to commit after an interrupted attempt is fine):

   ```bash
   git add startup.config.json package.json autumn.config.ts src/i18n/messages/en.json src/i18n/messages/fr.json
   git commit -m "chore: start <slug> from the boilerplate"
   ```

3. Create the repository **private** and set it as `origin`, without pushing:

   ```bash
   gh repo create "<owner>/<slug>" --private --source=. --remote=origin
   ```

   The first push (6j) keeps the boilerplate history: merging `upstream/master` later needs it.

## 5. Verify

```bash
git remote -v
gh repo view "<owner>/<slug>" --json nameWithOwner,visibility -q '"\(.nameWithOwner) \(.visibility)"'
```

Expect `origin` on `<owner>/<slug>`, `upstream` on the boilerplate with a `DISABLED` push URL, and
`<owner>/<slug> PRIVATE`. The repository stays empty until 6j pushes `master`.

Later, to take boilerplate fixes:

```bash
git fetch upstream && git merge upstream/master
```

Then `node scripts/run-ledger.mjs done repository` (prints `STEP repository DONE`).
