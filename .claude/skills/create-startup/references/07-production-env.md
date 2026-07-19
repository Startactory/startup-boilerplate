# Step 7 — Production environment & first deploy

Build the **production** environment as its own thing: its own env file, its own database, its own
secrets. Then deploy.

End state: a live deployment on Vercel, Supabase Postgres behind it, prod OAuth, and payments in
live mode. Prerequisite: Step 6 is complete — the repo is on `main`, the Vercel project is
connected to it, and the deploy hook is stored as a GitHub secret.

**This is where Supabase's database finally matters.** Local development has been running against
local Postgres since Step 3 and stays that way. Nothing you do here touches `.env`.

## 7a. Decide the production URL

- If the user has a custom domain (`startup.config.json.domain`), that's the production URL — add
  it in Vercel → Settings → Domains and follow the DNS instructions.
- Otherwise use the Vercel-assigned domain (`https://<project>.vercel.app`) for now; a custom
  domain can be added later.

This URL becomes `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in production — several things key off
it (Better Auth `trustedOrigins`, secure cookies, OAuth redirects, email links). Getting it wrong
produces sign-in loops that are miserable to debug, so settle it before generating the file.

## 7b. Create `.env.prod`

`.env.prod` is the production counterpart to `.env`: a staging file whose only job is to be pushed
to Vercel. It is git-ignored (`.env.*`, with `.env.template` the sole exception).

The name matters. Next.js auto-loads `.env.production` during any local `next build`, so a file by
that name would silently point a local production build at the real database. `.env.prod` is inert
to Next's env loading — nothing picks it up by accident.

Generate it with the same script, pointed at a different file, with the production URL and the
Supabase ref from Step 4a:

```bash
node scripts/init-env.mjs --apply \
  --file .env.prod \
  --app-url "https://<prod-domain>" \
  --supabase-ref "<project-ref>"
```

That seeds `.env.prod` from `.env.template` and fills what it can:

- **fresh** `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `CRON_SECRET`, `ENCRYPTION_KEY` — generated
  independently of local. Distinct secrets per environment are the point: a leaked dev secret must
  not forge a production session. (A consequence to expect: early-access codes hashed locally won't
  validate in production — the pepper differs. Re-seed prod codes in 7f.)
- `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` = the production URL
- `SUPABASE_URL` = `https://<project-ref>.supabase.co`

## 7c. Fill the production-only values

Copy from `.env` the credentials that are genuinely shared across environments — the same OpenAI
account, the same ZeroEntropy index, the same Google OAuth client, the same Supabase Storage keys:

`OPENAI_API_KEY` · `ZEROENTROPY_API_KEY` · `ZEROENTROPY_API_URL` · `GOOGLE_CLIENT_ID` ·
`GOOGLE_CLIENT_SECRET` · `SUPABASE_SECRET_KEY` · `SUPABASE_PUBLISHABLE_KEY` ·
`SUPABASE_STORAGE_BUCKET` · `NEXT_PUBLIC_POSTHOG_KEY` · `NEXT_PUBLIC_POSTHOG_HOST` ·
the email provider vars

Then set the three that must **differ** from local. Use `set-env-var.mjs --file` so each value is
validated against `src/shared/env.ts` and never printed:

**1. The database — Supabase session pooler.**

```bash
printf %s "postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres" \
  | node scripts/set-env-var.mjs --file .env.prod DATABASE_URL
printf %s "require" | node scripts/set-env-var.mjs --file .env.prod DATABASE_SSL
```

Three ways this goes wrong, all of which fail with unhelpful errors:

- **Do not use the direct connection** (`db.<ref>.supabase.co`). It is **IPv6-only** unless the
  project has the IPv4 add-on, and GitHub Actions runners are IPv4-only — the `migrate` job hangs
  with no error until it times out.
- **Do not use the transaction pooler** (port `6543`). It does not reliably support the advisory
  locks and prepared statements `drizzle-kit migrate` needs. Supabase's own ORM snippet suggests
  `6543` — that is aimed at the serverless app runtime, not migrations. Use port **`5432`** on the
  pooler host, user **`postgres.<project-ref>`**.
- **Substitute the password.** Supabase's copyable strings contain a literal `[YOUR-PASSWORD]`;
  leaving it produces an instant auth failure that drizzle-kit reports with no message at all.
  URL-encode special characters (`@` → `%40`, `#` → `%23`, `/` → `%2F`, …). `set-env-var.mjs`
  rejects an unsubstituted placeholder outright.

**2. Autumn — live key.** Covered in 7e; leave it for now if Stripe live mode isn't connected yet.

**3. `VERCEL_ENV`/`NODE_ENV`** — do not set them. Vercel injects these itself (7d).

## 7d. Push the environment to Vercel

`src/shared/env.ts` validates the environment **at build time**, not just at runtime — Next.js
evaluates it while collecting route data, so a single missing variable fails the Vercel *build*
with `Invalid environment variables`. Push the complete set before deploying.

Vercel injects `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID` itself — the script
skips them. Everything else comes from `.env.prod`:

| Variable | Required | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` | ✅ | the production URL from 7a |
| `DATABASE_URL` | ✅ | Supabase **session pooler**, port 5432 (7c) |
| `DATABASE_SSL` | — | `require` for hosted Postgres |
| `BETTER_AUTH_SECRET` · `EARLY_ACCESS_PEPPER` · `CRON_SECRET` | ✅ | generated in 7b |
| `ENCRYPTION_KEY` | — | generated in 7b |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud Console (4b) |
| `OPENAI_API_KEY` | ✅ | platform.openai.com (4c) |
| `SUPABASE_URL` · `SUPABASE_SECRET_KEY` · `SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_STORAGE_BUCKET` | ✅ | Supabase project (4a) |
| `ZEROENTROPY_API_KEY` / `ZEROENTROPY_API_URL` | ✅ | ZeroEntropy (4d) |
| `AUTUMN_SECRET_KEY` | ✅ **in production** | Autumn live key (7e) — `assertBillingConfigured` fails the build without it |
| `EMAIL_PROVIDER` + its vars | ✅ | `resend` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`; `smtp` → `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | — | PostHog (4e) |
| `UPSTASH_*`, `BRAVE_SEARCH_API_KEY`, `MICROSOFT_*`, `OTEL_*` | — | optional; leave unset to disable |

Don't click through the dashboard one variable at a time — use the bundled script. It **refuses to
run** if anything required is missing or still holds a placeholder, and streams each value over
stdin so nothing is ever printed:

```bash
node scripts/push-env-to-vercel.mjs --file .env.prod                 # dry run — lists what would be pushed
node scripts/push-env-to-vercel.mjs --file .env.prod --apply         # push to production
```

It is idempotent (removes then re-adds), so re-run it whenever `.env.prod` changes. It also warns
when `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` still point at `localhost`, or when `DATABASE_SSL` is
not `require` — both are signs local values leaked into the production file.

Never paste secrets into `vercel.json` or any committed file — they belong in the project's env store.

Finally, give CI the production database (the secret Step 6e deferred):

```bash
grep '^DATABASE_URL=' .env.prod | cut -d= -f2- | gh secret set DATABASE_URL
```

Set this **before the first push to `main`**, or the `migrate` job fails its `Verify database url`
guard and the release never triggers. Add `DEV_DATABASE_URL` the same way only if a `dev` branch
exists.

## 7e. Switch Autumn + Stripe to live

1. In the Autumn dashboard, connect/enable **Stripe live mode** (real payouts).
2. Push the product config to production:
   ```bash
   pnpm dlx atmn push -p
   ```
3. Write the production key into `.env.prod` and re-push the env:
   ```bash
   printf "Paste production AUTUMN_SECRET_KEY: "; read -rs V; echo
   printf %s "$V" | node scripts/set-env-var.mjs --file .env.prod AUTUMN_SECRET_KEY
   unset V
   node scripts/push-env-to-vercel.mjs --file .env.prod --apply
   ```
   It starts `am_sk_live_…`. The sandbox key (`am_sk_test_…`) stays in `.env` for local work.

## 7f. Wire production OAuth and seed the production database

**OAuth.** In Google Cloud → Credentials → the existing OAuth client, add the production redirect
URI: `https://<prod-domain>/auth/callback/google`. Keep the localhost one — the same client serves
both environments. If the consent screen is still in "Testing", either add real users as test users
or publish the app. (Same for Microsoft if enabled: `/auth/callback/microsoft`.)

**Database.** Migrations are applied by the CI `migrate` job on push to `main`, using the
`DATABASE_URL` secret — you do not run them from your machine. If you need the schema in place
before the first deploy, you can apply it once explicitly:

```bash
DATABASE_URL="<prod pooler url>" DATABASE_SSL=require pnpm drizzle:migrate
```

Then seed the rows production needs — notably a fresh early-access code, since `EARLY_ACCESS_PEPPER`
differs from local and locally-generated codes will not validate.

## 7g. Deploy

Everything is in place, so trigger the real pipeline rather than deploying by hand — this is also
the end-to-end test of Step 6:

```bash
git push origin main
```

Watch the chain: `ci.yml` (boundaries · test · type-check) → `migrate` → `production.yml` → deploy
hook → Vercel build.

```bash
gh run watch
```

If `production.yml` never starts, CI didn't conclude successfully on `main` — check `gh run list`.
If it ran but nothing appeared in Vercel, the deploy hook secret is wrong or the Vercel project
isn't Git-connected (revisit 6b/6d).

`vercel --prod` is the manual fallback, but prefer the pipeline: a manual deploy skips the
migration job.

## 7h. Verify in production

1. Sign in with Google — confirms prod OAuth, secure cookies, `trustedOrigins`.
2. Upload a file and send a chat message — Supabase Storage + ZeroEntropy + OpenAI in prod.
3. Open pricing and run a real checkout in Stripe (a small live charge or a test clock) to confirm
   Autumn end-to-end.
4. Confirm PostHog receives production events.
5. Confirm the cron endpoint runs (`/api/cron/zeroentropy-retry`, daily at 03:00 — check the Vercel
   function logs, and note it authenticates with `CRON_SECRET`).

## 7i. Handover

Report the live URL and a per-service status checklist (configured / needs user action / skipped).

Then state plainly where configuration now lives, because this is the thing people get wrong later:

| | Local development | Production |
| --- | --- | --- |
| File | `.env` (git-ignored) | `.env.prod` (git-ignored) → pushed to Vercel |
| Database | local Postgres, `localhost:5432/<slug>` | Supabase session pooler |
| Source of truth at runtime | the file | the **Vercel** project env store |
| Migrations | `pnpm drizzle:migrate` on your machine | CI `migrate` job on push to `main` |

Changing a production value means editing `.env.prod` and re-running the push script, then
redeploying — editing `.env` does nothing to production, and editing only the Vercel dashboard
leaves `.env.prod` stale and the next push will overwrite it.

Finish with what's still a TODO (Upstash, Microsoft OAuth, Brave, custom domain if not set) and the
reminder that neither env file may ever be committed.
