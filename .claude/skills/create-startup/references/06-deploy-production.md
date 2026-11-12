# Step 6 — Deploy to production (Vercel)

End state of the run: the Vercel project is connected to the GitHub repo, CI deploys it after green
checks, production runs on the Supabase database from Step 4a with its own `.env.prod`, Google
sign-in works on the live URL, and payments run on the Autumn sandbox (Stripe test mode) until the
founder goes live after the run. The Vercel CLI and the scripts below do all of it.

Where each part runs:

- **Phase 1, step `vercel-project`**: 6b, right after the `repository` step (`phase-1-setup.md`
  section 6), so the production URL is known before Google OAuth (4b).
- **Phase 2, step `deploy`**, after Step 5 is green: 6d, 6e, 6g, then the first push (6j item 1),
  then 6i. 6j item 2 is the `smoke-test` step.
- 6a and 6c explain; 6f (going live) is after the run.

Nothing in this step touches `.env`: production values go in `.env.prod`.

## 6a. The production URL

`productionUrl` in `startup.config.json`: the free `https://<slug>.vercel.app` (or
`https://<slug>-<4 characters>.vercel.app` when that name is taken) that 6b gave the project. A
custom domain comes after the run (`after-the-run.md`).

This URL becomes `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in production — several things key off
it (Better Auth `trustedOrigins`, secure cookies, OAuth redirects, email links). A wrong value gives
sign-in loops that are hard to debug, which is why 6b settles it before 4b and 6e use it.

## 6b. Create the Vercel project and connect it to the repo (phase 1, step `vercel-project`)

It needs the `repository` step done (`startup.config.json` `repository`, `origin` on it), the
`vercel login` session, and the Vercel GitHub App installed for `githubOwner` with access to the
repository (`phase-1-setup.md` checklist item 7).

```bash
node scripts/providers/vercel-project.mjs
```

It does, idempotently:

1. Creates the Vercel project named after the `slug`, or reuses it.
2. Links the local directory to it (`vercel link`), so the env push and the CLI know the project.
3. **Connects it to the GitHub repository** `repository` (never the boilerplate). `vercel link`
   only links the *local directory*: enough to push env vars, but Vercel gets no access to the
   repo. Without the Git connection there is no commit to build, and deploy hooks do not exist (the
   Deploy Hooks panel only appears for Git-connected projects).
4. Gives the project its free domain `<slug>.vercel.app`, or `<slug>-<4 random lowercase
   alphanumerics>.vercel.app` when someone else holds that name, and reuses the one it already
   has on a re-run.
5. Writes `productionUrl` into `startup.config.json`, and pins the function region next to the
   database: `"regions": ["<region>"]` in `vercel.json`, with the Vercel region
   `references/data-region.md` gives for `dataRegion` (`cdg1` for `eu`, `iad1` for `us`). Without
   it, functions run in `iad1` (US) — for an EU startup that sends every request's personal data
   through the US.

Success prints `OK  Vercel project <slug> <created|reused>, production URL <url>`. On failure it
prints one line naming the call that failed: `vercel git connect failed: …` means the Vercel
GitHub App cannot see the repository (checklist item 7); `no free *.vercel.app name for <slug>
after 3 tries` means run it again. The framework preset is Next.js (auto-detected); leave the build
command alone.

Then commit `startup.config.json` and `vercel.json` on `master` (nothing is pushed yet: the first
push is 6j) and run `node scripts/run-ledger.mjs done vercel-project`.

## 6c. How the pipeline deploys

Deployment is **not** push-triggered. `vercel.json` sets `git.deploymentEnabled.master=false`, so a
push to `master` does not deploy by itself. Instead:

```
push to master
  └─ ci.yml          boundaries · test · type-check
       └─ migrate     applies drizzle migrations to the production database
            └─ production.yml   (workflow_run: CI completed on master)
                 └─ POST $VERCEL_DEPLOY_HOOK_URL  →  Vercel builds and promotes
```

The boilerplate repository itself (`Startactory/startup-boilerplate`) has no database and no
deployment, so both `migrate` and the deploy job skip there; they run in every startup repository.

So migrations always run before the new code goes live, and a red test suite never reaches
production. `deploymentEnabled: false` blocks push deploys only; deploy hooks still work. Do **not**
set `github.enabled: false` in `vercel.json`: that one disables deploy hooks and breaks the
pipeline silently.

## 6d. Create the deploy hook and give it to CI

One script creates (or reuses) the `production` hook on `master`, stores the URL in
`startup-<slug>/ci`, and pipes it to `gh secret set VERCEL_DEPLOY_HOOK_URL`:

```bash
node scripts/providers/vercel-deploy-hook.mjs --project <slug>
```

The Vercel project must be Git-connected (6b) and the Vercel CLI signed in. The hook URL is a
bearer credential: it never appears in your output or in argv. Success prints names and statuses
only. Verify with `gh secret list` (names only). If it errors, read the message: `update the
Vercel CLI: npm i -g vercel@latest` means the Vercel CLI is too old to manage deploy hooks, and a
missing Git connection means 6b did not finish (run it again). If the hook URL ever reaches the
transcript or printed output, that is a block: the founder decides whether to delete the hook
(**Project → Settings → Git → Deploy Hooks**); once they did, re-run the script.

## 6e. Finish `.env.prod`

Step 4 already filled the `production` item: its own Google client, PostHog project, SMTP
credentials, the Autumn sandbox key, Supabase `DATABASE_URL` and Dash0 variables. Nothing is copied
from `.env`: each environment got its own Google and PostHog values in Step 4. Only the production
URL is left; an explicit `--app-url` replaces the localhost value and nothing else is overwritten:

```bash
node scripts/init-env.mjs --apply --file .env.prod --app-url "<productionUrl>"
```

Then regenerate the file from the vault and check names and counts only:

```bash
node scripts/vault-sync.mjs --env production
cut -d= -f1 .env.prod
grep -c '=op://' .env.prod
```

The count of `op://` lines is the number of secrets; no value is printed.

## 6f. Going live — after the run

Phase 2 never does it. The legal-identity gate, the startup's own Stripe account and its KYC, the
live Stripe connection in Autumn, the live Autumn key and the production plan push
(`atmn push -p`) are in `after-the-run.md`, "Go live". Until then production stays on the Autumn
sandbox: never run `atmn push -p` while production uses the sandbox key.

## 6g. Push the environment to Vercel and the database URL to GitHub

`src/shared/env.ts` validates the environment **at build time**, not just at runtime — Next.js
evaluates it while collecting route data, so a single missing variable fails the Vercel *build*
with `Invalid environment variables`. Push the complete set before deploying.

### The full inventory

Vercel injects `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID` itself — never
push those. Everything else comes from `.env.prod`, whose secret lines are `op://` references:

| Variable | Required | Where the value comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | `productionUrl` (6a, set in 6e) |
| `BETTER_AUTH_URL` | ✅ | the same production URL |
| `DATABASE_URL` | ✅ | vault `production` item, Supabase **session pooler**, port 5432 (4a) |
| `DATABASE_SSL` | — | `require` (4a) |
| `BETTER_AUTH_SECRET` | ✅ | vault `production` item, generated in Step 4a (`init-env --file .env.prod`) |
| `ENCRYPTION_KEY` | — | vault `production` item, generated in Step 4a |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | vault `production` item, the production OAuth client (4b) |
| `AUTUMN_SECRET_KEY` | ✅ **in production** | vault `production` item: the Autumn sandbox key until go-live (4e), then the live key — `assertBillingConfigured` fails the build without it |
| `EMAIL_PROVIDER` + its vars | ✅ | vault `production` item; in a run `smtp` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`; with a domain `resend` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | — | vault `production` item, the production PostHog project (4c) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` / `OTEL_SERVICE_NAME` | — | vault `production` item, written by `dash0-dataset.mjs` (4f) — without them, production logs only reach Vercel's runtime logs |
| `UPSTASH_*`, `MICROSOFT_*` | — | optional; leave unset to disable |

### Push them

Use the bundled script, not the dashboard. It resolves each `op://` reference through `op inject`,
**refuses to run** if a reference cannot be resolved or anything required is missing or still holds
a placeholder (before any `vercel env` call, so Vercel is never half-updated), skips the
Vercel-managed variables, and streams each value over stdin so nothing is printed:

```bash
node scripts/push-env-to-vercel.mjs --file .env.prod             # dry run — lists what would be pushed
node scripts/push-env-to-vercel.mjs --file .env.prod --apply     # push to production
```

It is idempotent (removes then re-adds), so re-run it whenever `.env.prod` changes. It warns when
`NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` still point at `localhost`, or when `DATABASE_SSL` is not
`require` — both are signs that local values leaked into the production file.

Never paste secrets into `vercel.json` or any committed file — they belong in the project's env store.

### Give CI the production database

Vercel and GitHub are **two separate stores holding different things**: the Vercel project env holds
what the *running app* needs; GitHub Actions secrets hold only what *CI* needs. Do **not** mirror
the whole env file into GitHub.

Check first that `gh` targets the startup's repo, not the boilerplate:
`gh repo view --json nameWithOwner -q .nameWithOwner` must print `startup.config.json`
`repository`. If not, run the `repository` step again (`01c-create-repository.md`).

The workflows reference exactly three secrets (check that nothing was added:
`grep -roE "secrets\.[A-Z_]+" .github/workflows | sort -u`):

| Secret | Used by | Set in |
| --- | --- | --- |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` — triggers the deploy after CI passes | 6d (`vercel-deploy-hook.mjs`) |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `master` | now |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | only if a `dev` branch exists |

Use the script: it reads the value from the vault, refuses an empty one, and hands it to `gh` on
stdin without printing it:

```bash
node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL
```

Set it **before the first push to `master`** (6j), or the `migrate` job fails its
`Verify database url` guard and the release never triggers. Verify with `gh secret list` — it
prints names only.

## 6i. Protect `master`

Run it right after the first push (6j item 1): `master` does not exist on GitHub before.
`CLAUDE.md` calls branch protection the only gate a developer cannot bypass locally. Require the CI
jobs:

```bash
gh api -X PUT "repos/{owner}/{repo}/branches/master/protection" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["boundaries", "test", "type-check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

Branch protection on a private repo needs a paid GitHub plan. If the API returns 403, put it in the
end-of-run report as a follow-up: it does not block deployment.

## 6j. Deploy & verify

Checklist before the first deploy — every line must be true:

- [ ] the Vercel project is **connected to the GitHub repo** (6b, not only `vercel link`)
- [ ] `gh secret list` shows `VERCEL_DEPLOY_HOOK_URL` and `DATABASE_URL`
- [ ] the env push in 6g succeeded with no missing variable

1. **The first push.** On `master`, with everything committed:

   ```bash
   git push -u origin master
   ```

   The husky pre-push hook lets this first push create `master` on the new remote; after it,
   `master` only changes through a branch and a PR that you merge. The push runs `ci.yml` and its
   `migrate` job, then `production.yml` calls the deploy hook and Vercel builds. Follow each run
   without a prompt:

   ```bash
   gh run list --branch master --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'
   gh run watch <id> --exit-status
   ```

   A run takes a few seconds to appear after the push: when the first command prints nothing,
   wait and retry a few times. Once CI is green, do the same with `--workflow production.yml` for
   the deploy run, which starts when CI completes. A red `migrate` job usually means a wrong
   `DATABASE_URL` secret; a failed Vercel build with `Invalid environment variables` means a
   variable is missing in 6g.
2. **Smoke test** (the `smoke-test` step): `node scripts/smoke-test.mjs` plus the browser check of
   `phase-2-run.md` ("Smoke test"). It never runs a real or live charge: the browser check stops at
   the Stripe test-mode checkout page. The live checkout waits for going live (`after-the-run.md`,
   "Go live").
3. **Report** (the `report` step): the "End-of-run report" of `SKILL.md` — the live URL, the
   per-service checklist (with each item of the "When `gdpr` is `true`" list of
   `references/data-region.md` when `gdpr` is `true`), what stays for later, and where each secret
   lives.
