# Step 6 — Connect Vercel to the repo & wire the CI/CD pipeline

Build the **pipeline** — the repo, the Vercel project, the link between them, and the deploy hook
that lets CI trigger a release. No production secrets yet: those are Step 7.

Do this only after Step 5 is green (`pnpm validate` passed and the app ran locally).

Split deliberately: here you make deployment *possible and safe*; in Step 7 you give it the
production *values*. Conflating them is how a half-configured project ends up deploying with local
env vars.

## 6a. The repository, on `main`

The pipeline keys off a branch named `main` — `.github/workflows/ci.yml`, `production.yml` and
`vercel.json` all reference it. A repo still on `master` will look wired up and simply never
deploy, with no error anywhere.

If the working copy is on `master`, rename before anything else:

```bash
git branch -m master main
git push -u origin main
gh repo edit --default-branch main
git push origin --delete master
```

If the repo doesn't exist on GitHub yet, create it directly on `main`:

```bash
gh repo create "<slug>" --private --source=. --remote=origin --push
gh repo edit --default-branch main
```

Confirm before continuing — this single value gates the whole pipeline:

```bash
gh repo view --json defaultBranchRef -q .defaultBranchRef.name   # must print: main
```

## 6b. Create the Vercel project and connect it to the repo

Use the `vercel` MCP (connected in Step 2); the `vercel` CLI is the fallback.

1. Create a project named after the `slug`.
2. **Connect it to the GitHub repository.** This is the part that is easy to miss: `vercel link`
   alone associates your *local directory* with the project, which is enough to push env vars but
   does **not** give Vercel access to the repo. Without the Git connection there is no commit to
   build from, and deploy hooks cannot exist at all — the Deploy Hooks UI only appears for
   Git-connected projects.

   In the dashboard: **Project → Settings → Git → Connect Git Repository** → pick `<owner>/<slug>`.

3. Link the local directory too, so Step 7's env push and the CLI know the project:

   ```bash
   vercel link
   ```

4. Framework preset is Next.js (auto-detected). Leave the build command alone.

Verify the Git connection is real before moving on — the repo should be listed:

```bash
vercel project ls
```

## 6c. How this pipeline deploys (understand before wiring)

Deployment is **not** push-triggered. `vercel.json` ships:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

so pushing to `main` does *not* deploy. Instead:

```
push to main
  └─ ci.yml         boundaries · test · type-check
       └─ migrate    applies drizzle migrations to the production DB
            └─ production.yml   (workflow_run: CI completed on main)
                 └─ POST $VERCEL_DEPLOY_HOOK_URL  →  Vercel builds & promotes
```

The point of the indirection: **migrations run before the new code is live**, and a red test suite
can never reach production. A plain Vercel Git auto-deploy would build on every push regardless of
CI, and would race the migration job.

`deploymentEnabled: false` suppresses push-triggered deploys but leaves deploy hooks working — they
are an explicit, separate trigger. (Do **not** set `github.enabled: false` in `vercel.json`; that
one *does* disable deploy hooks and would silently break this pipeline.)

## 6d. Create the deploy hook

**Project → Settings → Git → Deploy Hooks.** Name it `production`, target branch `main`, create.
Copy the URL.

It is a bearer credential — anyone holding it can trigger a production build. Never commit it,
never paste it into chat; it goes straight into a GitHub secret in 6e. If it leaks, revoke it in
the same panel and create a new one.

## 6e. Give CI the deploy hook

Vercel and GitHub are **two separate stores holding different things**:

- **Vercel project env** (Step 7) — everything the *running app* needs at runtime.
- **GitHub Actions secrets** — only what *CI* needs. Do **not** mirror the whole env here; every
  extra copy widens the blast radius if the repo is ever compromised.

Exactly three secrets are referenced by the workflows. Confirm nothing was added since:

```bash
grep -roE "secrets\.[A-Z_]+" .github/workflows | sort -u
```

| Secret | Used by | Set in |
| --- | --- | --- |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` — triggers the deploy after CI passes | **now** (6e) |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `main` | Step 7 (needs the Supabase pooler string) |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | Step 7, only if a `dev` branch exists |

The GitHub MCP **cannot** write secrets (it only reads secret-*scanning* alerts), so use the `gh`
CLI. Set the hook URL at a hidden prompt so it never lands in shell history or process arguments:

```bash
gh secret set VERCEL_DEPLOY_HOOK_URL          # paste at the prompt, input is hidden
```

Verify with `gh secret list` — it prints names only, never values.

## 6f. Protect `main`

`CLAUDE.md` calls this the only gate a developer cannot bypass locally. Require the CI jobs that
already run:

```bash
gh api -X PUT "repos/{owner}/{repo}/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["boundaries", "test", "type-check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

(Branch protection needs a paid plan for private repos. If the API returns 403, note it as a
follow-up rather than treating it as failure — it does not block deployment.)

The local husky pre-push hook also refuses direct pushes to `main`; work happens on feature
branches and merges via PR.

## 6g. Verify the pipeline shape — but do not deploy yet

At this point CI runs on push, and a successful CI run on `main` will fire the deploy hook. It is
**expected and correct** that a deploy now would fail or ship a broken app: the Vercel project has
no environment variables yet, and `src/shared/env.ts` validates at *build* time, so the build fails
with `Invalid environment variables`. The `migrate` job will also fail its `Verify database url`
guard, since `DATABASE_URL` isn't set until Step 7.

So: **don't push to `main` yet.** Finish Step 7 first, then push once and watch the whole chain run
green.

Checklist before moving on — every line must be true:

- [ ] default branch is `main`
- [ ] Vercel project exists and is **connected to the GitHub repo** (not just `vercel link`)
- [ ] deploy hook created on branch `main`
- [ ] `VERCEL_DEPLOY_HOOK_URL` present in `gh secret list`
- [ ] branch protection applied (or explicitly noted as unavailable)

Then move to Step 7.
