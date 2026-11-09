# Step 1c — Give the startup its own GitHub repository

A fresh clone still has `origin` pointing at the boilerplate. Everything later that talks to GitHub
(`gh secret set`, branch protection, CI, the Vercel Git connection) acts on `origin`, so without
this step the startup's production secrets would land in the boilerplate repo. Do it before
anything else touches GitHub.

**Do this yourself.** The user only picks the owner when there is a choice.

## 1. Skip if already done

If `startup.config.json` has a `repository` field and `origin` points at it, this step is done:

```bash
node -p "require('./startup.config.json').repository ?? ''"
gh repo view --json nameWithOwner -q .nameWithOwner
```

If both print the same `<owner>/<slug>`, move to Step 2.

## 2. Check GitHub access

```bash
gh auth status
gh config get git_protocol
```

- Not logged in: ask the user to run `gh auth login` in a terminal (it opens a browser sign-in).
  You cannot sign in for them.
- The token needs the `repo` scope. When `git_protocol` is `https`, it also needs `workflow`:
  GitHub refuses a push that contains `.github/workflows/*` without it, and the error does not
  say why. Fix it with `gh auth refresh -s workflow` (browser sign-in again). With `ssh`, the
  scope does not matter.

## 3. Pick the owner and the name

```bash
gh api user -q .login
gh org list
```

If the user belongs to no organization, use their personal account without asking. Otherwise ask
one question: personal account or which organization.

The repository name is the `slug`. Check that it is free:

```bash
gh repo view "<owner>/<slug>" --json nameWithOwner 2>/dev/null && echo "TAKEN" || echo "free"
```

If it is taken, ask the user whether that repository is already this startup's or which other
name to use. Never push into a repository that holds something else. To reuse an empty one, do
4.1 and 4.2, then replace 4.3 with
`git remote add origin "$(gh repo view "<owner>/<slug>" --json sshUrl -q .sshUrl)" && git push -u origin master`
(use `url` instead of `sshUrl` when `git_protocol` is `https`).

## 4. Create the repository and push

Work on `master`: the CI workflows, the deploy workflow and `vercel.json` all key off that branch.

1. Keep the boilerplate as `upstream`, so the startup can pull its fixes later, and make it
   fetch-only so nothing is pushed to it by mistake:

   ```bash
   git remote rename origin upstream
   git remote set-url --push upstream DISABLED
   ```

2. Record the repository in `startup.config.json` (`"repository": "<owner>/<slug>"`), then commit
   what Steps 1 and 1b changed:

   ```bash
   git add startup.config.json package.json autumn.config.ts
   git commit -m "chore: start <slug> from the boilerplate"
   ```

3. Create the repository **private**, set it as `origin`, and push `master`:

   ```bash
   gh repo create "<owner>/<slug>" --private --source=. --remote=origin --push
   ```

   The push keeps the boilerplate history: merging `upstream/master` later needs it. The husky
   pre-push hook lets this first push create `master`; after that, `master` only changes through
   pull requests.

## 5. Verify

```bash
git remote -v
gh repo view --json nameWithOwner,visibility,defaultBranchRef \
  -q '"\(.nameWithOwner) \(.visibility) \(.defaultBranchRef.name)"'
```

Expect `origin` on `<owner>/<slug>`, `upstream` on the boilerplate with a `DISABLED` push URL, and
`<owner>/<slug> PRIVATE master`.

GitHub Actions runs CI on this first push. Its `migrate` job fails with `DATABASE_URL is not set`
until Step 6 stores that secret. That failure is expected; say so to the user so it does not look
like a broken setup.

Later, to take boilerplate fixes:

```bash
git fetch upstream && git merge upstream/master
```

Tell the user the repository URL, then move to Step 2.
