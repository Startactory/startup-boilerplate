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
   then pick the repo. This is easy to miss. `vercel link` only links the *local directory* to the
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

So migrations always run before the new code goes live, and a red test suite never reaches
production. `deploymentEnabled: false` blocks push deploys only; deploy hooks still work. Do **not**
set `github.enabled: false` in `vercel.json`: that one disables deploy hooks and breaks the
pipeline silently.

## 6d. Create the deploy hook and give it to CI

**Project → Settings → Git → Deploy Hooks.** Name it `production`, target branch `master`, create.

The hook URL is a bearer credential: anyone who holds it can trigger a production build. Never
commit it or paste it into chat. Store it straight in GitHub, at a hidden prompt:

```bash
gh secret set VERCEL_DEPLOY_HOOK_URL          # paste at the prompt, input is hidden
```

If it leaks, revoke it in the same panel and create a new one.

## 6e. Finish `.env.prod`

Step 4a already created `.env.prod` with its own secrets and the Supabase `DATABASE_URL`. Set the
production URL (an explicit `--app-url` replaces the localhost value; nothing else is overwritten):

```bash
node scripts/init-env.mjs --apply --file .env.prod --app-url "https://<prod-domain>"
```

Then copy the credentials that are the same in both environments — the Google OAuth client, the
PostHog project, the email provider, Dash0 — from `.env`. The loop never prints a value, and
`set-env-var.mjs` validates each one:

```bash
for K in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST \
  EMAIL_PROVIDER RESEND_API_KEY RESEND_FROM_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS \
  SMTP_FROM_EMAIL SMTP_FROM_NAME OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS \
  OTEL_SERVICE_NAME; do
  V=$(grep "^$K=" .env | cut -d= -f2-); V=${V#\"}; V=${V%\"}
  [ -n "$V" ] && printf %s "$V" | node scripts/set-env-var.mjs --file .env.prod "$K"
done; unset V
```

Do not copy `DATABASE_URL`, `DATABASE_SSL`, the secrets, the app URLs or `AUTUMN_SECRET_KEY`: those
differ by design. A consequence to expect: the early-access pepper differs, so codes hashed locally
do not work in production (6j seeds production codes).

## 6f. Switch Autumn + Stripe to live

1. In the Autumn dashboard, connect/enable **Stripe live mode** (real payouts).
2. Push the product config to production:
   ```bash
   pnpm dlx atmn push -p
   ```
3. Put the **production** `AUTUMN_SECRET_KEY` in `.env.prod`, at a hidden prompt:
   ```bash
   printf "Paste the production AUTUMN_SECRET_KEY: "; read -rs V; echo
   printf %s "$V" | node scripts/set-env-var.mjs --file .env.prod AUTUMN_SECRET_KEY
   unset V
   ```

## 6g. Push the environment to Vercel and the database URL to GitHub

`src/shared/env.ts` validates the environment **at build time**, not just at runtime — Next.js
evaluates it while collecting route data, so a single missing variable fails the Vercel *build*
with `Invalid environment variables`. Push the complete set before deploying.

### The full inventory

Vercel injects `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID` itself — never
push those. Everything else comes from `.env.prod`:

| Variable | Required | Where the value comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | the production URL from 6a |
| `BETTER_AUTH_URL` | ✅ | the same production URL |
| `DATABASE_URL` | ✅ | Supabase **session pooler**, port 5432 (4a) |
| `DATABASE_SSL` | — | `require` (4a) |
| `BETTER_AUTH_SECRET` | ✅ | generated for production in 4a |
| `EARLY_ACCESS_PEPPER` | ✅ | generated for production in 4a |
| `ENCRYPTION_KEY` | — | generated for production in 4a |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud Console (4b), copied in 6e |
| `AUTUMN_SECRET_KEY` | ✅ **in production** | Autumn production key (6f) — `assertBillingConfigured` fails the build without it |
| `EMAIL_PROVIDER` + its vars | ✅ | `resend` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`; `smtp` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | — | PostHog (4c) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` / `OTEL_SERVICE_NAME` | — | Dash0 (4f) — without them, production logs only reach Vercel's runtime logs |
| `UPSTASH_*`, `MICROSOFT_*` | — | optional; leave unset to disable |

### Push them

Use the bundled script, not the dashboard. It **refuses to run** if anything required is missing or
still holds a placeholder, skips the Vercel-managed variables, and streams each value over stdin so
nothing is printed:

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

The workflows reference exactly three secrets (check that nothing was added:
`grep -roE "secrets\.[A-Z_]+" .github/workflows | sort -u`):

| Secret | Used by | Set in |
| --- | --- | --- |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` — triggers the deploy after CI passes | 6d |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `master` | now |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | only if a `dev` branch exists |

The GitHub MCP **cannot** write secrets, so use the `gh` CLI, with the value on stdin:

```bash
grep '^DATABASE_URL=' .env.prod | cut -d= -f2- | gh secret set DATABASE_URL
```

Set it **before the first push to `master`**, or the `migrate` job fails its `Verify database url`
guard and the release never triggers. Verify with `gh secret list` — it prints names only.

## 6h. Wire production OAuth

In Google Cloud → Credentials → the OAuth client, add the production redirect URI:
`https://<prod-domain>/auth/callback/google`. If the consent screen is still in "Testing", either
add real users as test users or publish the app. (Same for Microsoft if it was enabled:
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
2. Seed an early-access code for production, hashed with the **production** pepper:
   ```bash
   pnpm tsx --env-file=.env.prod scripts/hash-early-access-code.ts <code>
   ```
   Insert the hash per the script's output, with the Supabase MCP `execute_sql` on the production
   project. Skip only if the user confirms the gate is disabled.
3. Smoke-test on the live URL:
   - Sign in with Google (confirms prod OAuth + secure cookies + `trustedOrigins`).
   - Create an organization and reach the dashboard (Supabase Postgres in prod).
   - Open pricing and run a real checkout in Stripe (a live small charge or a test-clock) to
     confirm Autumn end-to-end.
   - Confirm PostHog receives prod events.
   - Confirm the Dash0 dataset shows production logs from service `<slug>`, with traces linked.
     Serverless functions can freeze before a batch is sent: if requests show in Vercel's logs but
     not in Dash0, report it rather than assume it works.
4. Report the live URL and a final per-service status checklist. When `gdpr` is `true`, include
   each item of the "When `gdpr` is `true`" list in `references/data-region.md` as **needs action**
   until it is built.

## 6k. Handover

Tell the user what's live, what's still a TODO (Upstash, Microsoft OAuth, custom domain if not set,
branch protection if the plan refused it), and where each secret lives: local values in `.env`,
production values in `.env.prod`, the Vercel project env, and the two GitHub secrets. Remind them
that both env files are git-ignored and must never be committed.
