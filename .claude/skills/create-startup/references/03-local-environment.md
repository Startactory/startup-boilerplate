# Step 3 — Local environment

Build the **local** development environment: dependencies, a local Postgres, and a `.env` filled
with local values. Production is a separate environment built later in Step 7 — do not mix them.

**Do this yourself — nothing here requires the user.** No accounts, no keys, no commands handed
over for someone else to run. Execute it, report what happened, move on. Asking the user to paste
`openssl` output is a failure of this step.

## The two-environment model (read this before touching any env file)

This project has **two environments, two files, never one shared blob**:

| | `.env` (this step) | `.env.prod` (Step 7) |
| --- | --- | --- |
| Database | **local Postgres** on your machine | Supabase session pooler |
| `DATABASE_SSL` | `allow` | `require` |
| App / auth URL | `http://localhost:3000` | `https://<prod-domain>` |
| Secrets | generated for local | generated separately for prod |
| Autumn | sandbox key (`am_sk_test_…`) | live key (`am_sk_live_…`) |
| Consumed by | `pnpm dev` on your machine | pushed to the Vercel project |

Both files are git-ignored (`.env`, `.env.*`, with `.env.template` the only committed one).

**A Supabase Postgres connection string must never appear in local `.env`.** Local development
runs against a local database — it is faster, free, disposable, and a broken migration or a stray
`drizzle:push` can't damage real user data. The Supabase project's Postgres belongs to production
only.

The one nuance: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY` back
**Storage** (file uploads), not the database, and `src/shared/env.ts` marks them required — the app
throws `Invalid environment variables` at boot without them. Step 4a fills those from the Supabase
project. So: Supabase **Storage** keys yes, Supabase **Postgres** URL no.

## 3a. Install toolchain & dependencies

1. Use the Node version in `.nvmrc` (`nvm use` if available).
2. `pnpm install` — this also runs husky's `prepare` and builds the allowed native deps
   (`sharp`, `esbuild`, …). Expect it to take a bit on first run.

## 3b. Start a local Postgres and create the database

The database is named after the `slug` from `startup.config.json`, so several projects can coexist
on one Postgres without colliding.

If Postgres is already running locally, just create the database:

```bash
createdb "<slug>"
```

Otherwise start one with Docker — this matches the credentials the connection string expects
(`postgres` / `postgres` on port 5432):

```bash
docker run -d --name "<slug>-postgres" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB="<slug>" \
  -p 5432:5432 \
  -v "<slug>-pgdata:/var/lib/postgresql/data" \
  postgres:17
```

Confirm it accepts connections before moving on — a container that is up is not necessarily ready:

```bash
until docker exec "<slug>-postgres" pg_isready -U postgres -q; do sleep 1; done && echo "postgres ready"
```

If port 5432 is already taken by another Postgres, either reuse that one (`createdb <slug>`) or map
a different host port and adjust the URL below to match. Don't silently run two servers.

## 3c. Create and populate `.env`

One command creates `.env` from the template, generates every secret, and fills the constants:

```bash
node scripts/init-env.mjs --apply
```

What it does:

| | |
| --- | --- |
| **Generates** | `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `CRON_SECRET`, `ENCRYPTION_KEY` — via `crypto.randomBytes`, lengths well above the `env.ts` minimums |
| **Sets** | `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` (both `http://localhost:3000`), plus constants (`ZEROENTROPY_API_URL`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_POSTHOG_HOST`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`) |
| **Leaves alone** | any key that already holds a real value |

It is **idempotent** — safe to re-run at any point, including after Step 4, because it never
overwrites a value that is already set. Omit `--apply` to preview first.

Secrets are generated in-process and written straight to `.env` — never echoed, so they never reach
the terminal, the transcript, or shell history.

Do **not** pass `--app-url` or `--supabase-ref` here. Those shape a production file and belong to
Step 7.

## 3d. Point the database at local Postgres

`.env.template` ships `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"` — the
right shape, but the generic `postgres` database. Point it at the project's own database:

```bash
printf %s "postgresql://postgres:postgres@localhost:5432/<slug>" \
  | node scripts/set-env-var.mjs DATABASE_URL
```

Leave `DATABASE_SSL=allow`. Local Postgres has no TLS; `require` would refuse to connect.

Sanity-check the value that actually landed — this is the variable the whole step exists to get
right:

```bash
grep -E '^(DATABASE_URL|DATABASE_SSL)=' .env
```

Expect `localhost:5432/<slug>` and `allow`. If you see a `supabase.co` or `pooler.supabase.com`
host here, that is the exact bug this split exists to prevent — fix it before continuing.

## 3e. What is deliberately *not* done here

These require an external account and cannot be generated. Step 4 obtains them — several
automatically over MCP, the rest by asking the user once:

`SUPABASE_URL` · `SUPABASE_SECRET_KEY` · `SUPABASE_PUBLISHABLE_KEY` · `GOOGLE_CLIENT_ID` ·
`GOOGLE_CLIENT_SECRET` · `OPENAI_API_KEY` · `ZEROENTROPY_API_KEY` · `AUTUMN_SECRET_KEY` ·
the email provider credentials

Note `DATABASE_URL` is **not** on that list any more — local development owns it, and you just set
it in 3d.

Be honest with the user about this boundary rather than implying full automation — there is no way
to mint someone else's OAuth client or API key.

## 3f. Sanity check

The app cannot boot yet (service keys unset) — that is expected. Do **not** run `pnpm dev` here;
that is Step 5, after provisioning. Confirm `.env` exists, the four secrets are populated, and
`DATABASE_URL` points at localhost, then move to Step 4.
