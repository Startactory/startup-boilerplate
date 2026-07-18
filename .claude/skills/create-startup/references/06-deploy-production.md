# Step 6 — Deploy to production (Vercel)

End state: a live deployment on Vercel, hosted DB, prod OAuth, and payments in live mode. Use the
`vercel` MCP (connected in Step 2); the `vercel` CLI is the fallback.

Do this only after Step 5 is green (`pnpm validate` passed and the app ran locally).

## 6a. Decide the production URL

- If the user has a custom domain (`startup.config.json.domain`), that's the production URL.
- Otherwise use the Vercel-assigned domain (`https://<project>.vercel.app`) for now; a custom
  domain can be added later.

This URL becomes `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in production — several things key off
it (Better Auth `trustedOrigins`, secure cookies, OAuth redirects, email links).

## 6b. Create & link the Vercel project

1. Create a project named after the `slug` and link this repo to it (via the Vercel MCP, or
   `vercel link`).
2. Framework preset is Next.js (auto-detected). `vercel.json` already defines the cron
   (`/api/cron/zeroentropy-retry`, every 5 min) and disables auto-deploy on `master`
   (`git.deploymentEnabled.master=false`) — deploys are explicit/promoted, which is intended.

## 6c. Push production environment variables

Set **every required var** from `.env` into the Vercel project's **Production** environment, with
these production overrides:

- `NODE_ENV=production`, `VERCEL_ENV` is set by Vercel automatically.
- `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` → the production URL from 6a.
- `DATABASE_URL` → the Supabase **pooler** connection string; `DATABASE_SSL=require`.
- Email `*_FROM_EMAIL` → an address on the production domain (Resend strongly preferred over Gmail
  SMTP in production).
- Keep the generated secrets (`BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `CRON_SECRET`,
  `ENCRYPTION_KEY`) — reuse the same values or regenerate; if you regenerate `CRON_SECRET`, it must
  match what the cron caller uses.
- `AUTUMN_SECRET_KEY` → the **production** key (see 6f).

Never paste secrets into `vercel.json` or any committed file — they go in the project's env store.

## 6d. Push CI/CD secrets to GitHub Actions

Vercel and GitHub are **two separate stores holding different things**:

- **Vercel project env** (6c) — everything the *running app* needs at runtime.
- **GitHub Actions secrets** — only what *CI* needs. Do **not** mirror the whole `.env`
  here; every extra copy widens the blast radius if the repo is ever compromised.

Exactly three secrets are referenced by the workflows (grep them yourself to confirm nothing
was added: `grep -roE "secrets\.[A-Z_]+" .github/workflows`):

| Secret | Used by | Value |
| --- | --- | --- |
| `DATABASE_URL` | `ci.yml` → `migrate` job on `master` | production Postgres connection string |
| `DEV_DATABASE_URL` | `ci.yml` → `migrate` job on `dev` | dev/staging connection string (skip if there's no `dev` branch) |
| `VERCEL_DEPLOY_HOOK_URL` | `production.yml` → triggers the deploy after CI passes | Vercel → Project → Settings → Git → Deploy Hooks |

The GitHub MCP **cannot** write secrets (it only reads secret-*scanning* alerts), so use the
`gh` CLI. Pipe the value in over **stdin** so it is never printed to the terminal, never lands
in shell history, and never appears in process arguments:

```bash
grep '^DATABASE_URL=' .env | cut -d= -f2- | gh secret set DATABASE_URL
```

For the deploy hook, create it in the Vercel dashboard first, then `gh secret set
VERCEL_DEPLOY_HOOK_URL` and paste at the hidden prompt.

Two things that will bite otherwise:

- Use the **direct or session-pooler** connection string (port `5432`) for `DATABASE_URL`.
  The transaction pooler (`6543`) does not reliably support the advisory locks and prepared
  statements `drizzle-kit migrate` needs, so migrations can fail or half-apply.
- Set these **before the first push to `master`**, or the `migrate` job fails its
  `Verify database url` guard and the release never triggers.

Verify with `gh secret list` — it prints names only, never values.

## 6e. Wire production OAuth

In Google Cloud → Credentials → the OAuth client, add the production redirect URI:
`https://<prod-domain>/auth/callback/google`. If the consent screen is still in "Testing", either
add real users as test users or publish the app. (Same for Microsoft if it was enabled:
`/auth/callback/microsoft`.)

## 6f. Switch Autumn + Stripe to live

1. In the Autumn dashboard, connect/enable **Stripe live mode** (real payouts).
2. Push the product config to production:
   ```bash
   pnpm dlx atmn push -p
   ```
3. Set the **production** `AUTUMN_SECRET_KEY` (`am_sk_live_…`) in Vercel Production env.

## 6g. Migrate the production database

If production uses a separate Supabase project from local, run migrations against it:
`DATABASE_URL=<prod> pnpm drizzle:migrate`. If it's the same project as Step 4, the schema is
already applied. Re-seed any required rows (e.g. an early-access code) for the prod DB.

## 6h. Deploy & verify

1. Deploy to production (Vercel MCP deploy, or `vercel --prod`).
2. Smoke-test on the live URL:
   - Sign in with Google (confirms prod OAuth + secure cookies + `trustedOrigins`).
   - Upload a file and send a chat message (Supabase + ZeroEntropy + OpenAI in prod).
   - Open pricing and run a real checkout in Stripe (a live small charge or a test-clock) to
     confirm Autumn end-to-end.
   - Confirm PostHog receives prod events, and that the cron endpoint runs (check logs after 5 min).
3. Report the live URL and a final per-service status checklist.

## 6i. Handover

Tell the user what's live, what's still a TODO (Upstash, Microsoft OAuth, Brave, custom domain if
not set), and where each secret lives (Vercel env + local `.env`). Remind them `.env` is
git-ignored and must never be committed.
