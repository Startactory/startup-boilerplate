# Step 6 — Deploy to production (Vercel)

End state: the Vercel project is connected to the GitHub repo, CI deploys it after green checks,
production runs on the Supabase database from Step 4a with its own `.env.prod`, prod OAuth works,
and payments are in live mode. Use the `vercel` MCP (connected in Step 2); the `vercel` CLI is the
fallback.

Do this only after Step 5 is green (`pnpm validate` passed and the app ran locally). Nothing in this
step touches `.env`: production values go in `.env.prod`.

## 6a. Decide the production URL

- If the user has a custom domain (`startup.config.json.domain`), that's the production URL — add
  it in Vercel → Settings → Domains and follow the DNS instructions.
- Otherwise use the Vercel-assigned domain (`https://<project>.vercel.app`) for now; a custom
  domain can be added later.

This URL becomes `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in production — several things key off
it (Better Auth `trustedOrigins`, secure cookies, OAuth redirects, email links). A wrong value gives
sign-in loops that are hard to debug, so settle it before 6e.

## 6b. Create the Vercel project and connect it to the repo

1. Create a project named after the `slug`.
2. **Connect it to the GitHub repository**: **Project → Settings → Git → Connect Git Repository**,
   then pick the startup's repo (`startup.config.json` `repository`, created in Step 1c). Never
   the boilerplate. This is easy to miss. `vercel link` only links the *local directory* to the
   project: enough to push env vars, but Vercel gets no access to the repo. Without the Git
   connection there is no commit to build, and deploy hooks do not exist (the Deploy Hooks panel
   only appears for Git-connected projects).
3. Link the local directory too, so the env push and the CLI know the project:

   ```bash
   vercel link
   ```

4. Framework preset is Next.js (auto-detected). Leave the build command alone.
5. Pin the function region next to the database: add `"regions": ["<region>"]` to `vercel.json`
   with the Vercel region `references/data-region.md` gives for `dataRegion` (`cdg1` for an EU
   startup on a Paris database). Without it, functions run in `iad1` (US) — for an EU startup
   that sends every request's personal data through the US. Commit this change on a branch, but
   do not merge it yet: merging it is the first deploy (6j).

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
node scripts/providers/vercel-deploy-hook.mjs --project <vercel-project>
```

The Vercel project must be Git-connected (6b) and the Vercel CLI signed in. The hook URL is a
bearer credential: it never appears in your output or in argv. Success prints names and statuses
only. Verify with `gh secret list` (names only). If it errors, read the message: `update the
Vercel CLI: npm i -g vercel@latest` means the Vercel CLI is too old to manage deploy hooks, and a missing Git connection
means go back to 6b. If the hook ever leaks, delete it in **Project → Settings → Git → Deploy
Hooks** and re-run the script.

## 6e. Finish `.env.prod`

Step 4 already filled the `production` item: its own Google client, PostHog project, Resend key (or
SMTP), Supabase `DATABASE_URL` and Dash0 variables. Nothing is copied from `.env`: each environment
got its own Google, PostHog and Resend values in Step 4. Only the production URL is left; an
explicit `--app-url` replaces the localhost value and nothing else is overwritten:

```bash
node scripts/init-env.mjs --apply --file .env.prod --app-url "https://<prod-domain>"
```

Then regenerate the file from the vault and check names and counts only:

```bash
node scripts/vault-sync.mjs --env production
cut -d= -f1 .env.prod
grep -c '=op://' .env.prod
```

The count of `op://` lines is the number of secrets; no value is printed.

## 6f. Switch Autumn + Stripe to live

This is the one per-startup human step: Stripe verifies the business, and only the founder can
complete that.

0. **Legal-identity gate.** Before anything goes live, run:

   ```bash
   node scripts/check-legal-identity.mjs
   ```

   `OK  legal identity complete` means continue. If it prints `MISSING  <fields>`, **stop** and ask
   the founder for the company details: legal name, legal form, address, SIREN, publication
   director, and the **named consumer mediator** (French consumer code; consumer sales cannot go
   live without one). RCS and VAT number are optional. Write them into `legal.company` in
   `startup.config.json` (the mediator goes in `legal.company.mediator`; the terms name it
   automatically), bump `legal.termsVersion` to today's date, run
   `node scripts/sync-startup-profile.mjs`, then re-run the gate. Also remind the founder that the
   generated legal templates need a legal review before real customers pay.
1. **Ask the founder's go-ahead**, then use Claude in Chrome to create the startup's own Stripe
   account under the founder's Stripe login (Stripe dashboard → account name → **New account**).
   Never reuse another startup's account.
2. In the Autumn dashboard (the startup's own org), connect that Stripe account in **live mode**.
3. The founder completes Stripe KYC (business details, bank account). Payouts stay blocked until
   it is done; say so plainly and do not wait on it to continue the deploy.
4. Push the product config to production. `op run` (through `scripts/with-vault.mjs run`, which supplies the service account token to `op`
   and strips it from the command) resolves the reference in the environment of that one command,
   which overrides the key in `.env`, so the value is never printed:

   ```bash
   AUTUMN_PROD_SECRET_KEY=op://startup-<slug>/production/AUTUMN_SECRET_KEY node scripts/with-vault.mjs run -- pnpm dlx atmn push -p --yes
   ```

   (`atmn` 2.x needs `--yes`.) Success ends with the products listed as pushed to production. If
   `atmn` still reads the sandbox key from `.env`, stop and report it rather than pushing to the
   wrong environment.

The production `AUTUMN_SECRET_KEY` is already in the `production` item (4e); `.env.prod` refers to
it by reference.

## 6g. Push the environment to Vercel and the database URL to GitHub

`src/shared/env.ts` validates the environment **at build time**, not just at runtime — Next.js
evaluates it while collecting route data, so a single missing variable fails the Vercel *build*
with `Invalid environment variables`. Push the complete set before deploying.

### The full inventory

Vercel injects `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID` itself — never
push those. Everything else comes from `.env.prod`, whose secret lines are `op://` references:

| Variable | Required | Where the value comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | the production URL from 6a |
| `BETTER_AUTH_URL` | ✅ | the same production URL |
| `DATABASE_URL` | ✅ | vault `production` item, Supabase **session pooler**, port 5432 (4a) |
| `DATABASE_SSL` | — | `require` (4a) |
| `BETTER_AUTH_SECRET` | ✅ | vault `production` item, generated in Step 4a (`init-env --file .env.prod`) |
| `ENCRYPTION_KEY` | — | vault `production` item, generated in Step 4a |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | vault `production` item, the production OAuth client (4b) |
| `AUTUMN_SECRET_KEY` | ✅ **in production** | vault `production` item, Autumn production key (4e) — `assertBillingConfigured` fails the build without it |
| `EMAIL_PROVIDER` + its vars | ✅ | vault `production` item; `resend` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`; `smtp` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` |
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
`repository`. If not, go back to Step 1c.

The workflows reference exactly three secrets (check that nothing was added:
`grep -roE "secrets\.[A-Z_]+" .github/workflows | sort -u`):

| Secret | Used by | Set in |
| --- | --- | --- |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` — triggers the deploy after CI passes | 6d (`vercel-deploy-hook.mjs`) |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `master` | now |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | only if a `dev` branch exists |

The GitHub MCP **cannot** write secrets, so use the script: it reads the value from the vault,
refuses an empty one, and hands it to `gh` on stdin without printing it:

```bash
node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL
```

Set it **before the first push to `master`**, or the `migrate` job fails its `Verify database url`
guard and the release never triggers. Verify with `gh secret list` — it prints names only.

## 6h. Wire production OAuth

Only needed when 4b could not add the production redirect URI (no domain was known then). Ask the
founder's go-ahead, then use Claude in Chrome: Google Cloud → Credentials → the `<name>` client
(not the `(local)` one), add `https://<prod-domain>/auth/callback/google`, save. Use narrow `find`
queries only; the page can show the client secret. If the consent screen is still in "Testing",
either add real users as test users or publish the app. (Same for Microsoft if it was enabled:
`/auth/callback/microsoft`.)

## 6i. Protect `master`

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

Branch protection on a private repo needs a paid GitHub plan. If the API returns 403, report it as
a follow-up: it does not block deployment.

## 6j. Deploy & verify

Checklist before the first deploy — every line must be true:

- [ ] the Vercel project is **connected to the GitHub repo** (not only `vercel link`)
- [ ] `gh secret list` shows `VERCEL_DEPLOY_HOOK_URL` and `DATABASE_URL`
- [ ] the env push in 6g succeeded with no missing variable

1. Deploy by merging the `vercel.json` region change from 6b into `master` through a PR. Watch the
   chain: `ci.yml` → `migrate` → `production.yml` → Vercel build.
   ```bash
   gh run watch
   ```
   A red `migrate` job usually means a wrong `DATABASE_URL` secret; a failed Vercel build with
   `Invalid environment variables` means a variable is missing in 6g.
2. Smoke-test on the live URL:
   - Sign in with Google (confirms prod OAuth + secure cookies + `trustedOrigins`).
   - Create an organization (the onboarding asks only for its name) and reach the dashboard
     past the paywall (Supabase Postgres in prod).
   - Open pricing and run a real checkout in Stripe (a live small charge or a test-clock) to
     confirm Autumn end-to-end.
   - Confirm PostHog receives prod events.
   - Confirm the Dash0 dataset shows production logs from service `<slug>`, with traces linked.
     Serverless functions can freeze before a batch is sent: if requests show in Vercel's logs but
     not in Dash0, report it rather than assume it works.
3. Report the live URL and a final per-service status checklist. When `gdpr` is `true`, include
   each item of the "When `gdpr` is `true`" list in `references/data-region.md` as **needs action**
   until it is built.

## 6k. Handover

Tell the user what's live, what's still a TODO (Stripe KYC if not finished, Upstash, Microsoft
OAuth, custom domain if not set, branch protection if the plan refused it), and where each secret
lives: every secret is in the 1Password vault `startup-<slug>` (items `local`, `production`, `ci`).
`.env` holds real values for local use only; `.env.prod` holds `op://` references only, so it
contains no secret. The same values also sit in the Vercel project env and the two GitHub secrets.
Remind them that both env files are git-ignored and must never be committed.
