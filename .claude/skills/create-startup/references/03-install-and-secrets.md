# Step 3 — Install & build the local environment

Build the **local** development environment: dependencies, a local Postgres, and a `.env` filled
with local values. Production is a separate environment, finished in Step 6. Do not mix them.

**Do this yourself — nothing here requires the user.** No accounts, no keys, no commands handed
over for someone else to run. Execute it, report what happened, move on. Asking the user to paste
`openssl` output is a failure of this step.

## The two-environment model (read this before touching any env file)

| | `.env` (local, this step) | `.env.prod` (production, Steps 4a and 6) |
| --- | --- | --- |
| Database | local Postgres on this machine | Supabase session pooler |
| `DATABASE_SSL` | `allow` | `require` |
| App / auth URL | `http://localhost:3000` | `https://<prod-domain>` |
| Secrets | generated for local | generated separately for production |
| Autumn | sandbox key (`am_sk_test_…`) | production key |
| Used by | `pnpm dev` on this machine | pushed to the Vercel project |

Both files are git-ignored (`.env`, `.env.*`; `.env.template` is the only committed one).

**The Supabase database never goes in `.env`.** Local development runs against a local database:
it is free and disposable, and a broken migration or a stray `drizzle:push` cannot damage real
user data. `scripts/set-env-var.mjs` refuses a Supabase `DATABASE_URL` in `.env`.

The production file is named `.env.prod`, not `.env.production`: Next.js loads `.env.production`
automatically during any local `next build`, which would point a local build at the real database.
Nothing loads `.env.prod` by accident.

## 3a. Install toolchain & dependencies

1. Use the Node version in `.nvmrc` (`nvm use` if available).
2. `pnpm install` — this also runs husky's `prepare` and builds the allowed native deps
   (`sharp`, `esbuild`, …). Expect it to take a bit on first run.

## 3b. Start a local Postgres and create the database

Name the database after the `slug` from `startup.config.json`, so several projects can share one
Postgres server.

If Postgres already runs locally, create the database:

```bash
createdb "<slug>"
```

Otherwise start one with Docker, with the credentials the connection string expects
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

Wait until it accepts connections. A running container is not necessarily ready:

```bash
until docker exec "<slug>-postgres" pg_isready -U postgres -q; do sleep 1; done && echo "postgres ready"
```

If port 5432 is taken by another Postgres, reuse that server (`createdb "<slug>"`) or map another
host port and use that port in 3d. Do not run two servers silently.

If neither Postgres nor Docker is installed, tell the user and ask which one to install. This is the
only local prerequisite the skill cannot set up alone.

## 3c. Create and populate `.env`

One command creates `.env` from the template, generates every secret, and fills the constants:

```bash
node scripts/init-env.mjs --apply
```

What it does:

| | |
| --- | --- |
| **Generates** | `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `ENCRYPTION_KEY` — via `crypto.randomBytes`, lengths well above the `env.ts` minimums |
| **Sets** | `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` (both `http://localhost:3000`), plus constants (`NEXT_PUBLIC_POSTHOG_HOST`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`) |
| **Leaves alone** | any key that already holds a real value |

It is **idempotent** — safe to re-run at any point, including after Step 4, because it never
overwrites a value that is already set. Omit `--apply` to preview first.

Secrets are generated in-process and written straight to `.env` — never echoed, so they never reach
the terminal, the transcript, or shell history.

Do **not** pass `--app-url` here. The production URL belongs to `.env.prod` (Step 6).

## 3d. Point the database at local Postgres

`.env.template` ships `DATABASE_URL` on the generic `postgres` database. Point it at the project's
own database, and keep `DATABASE_SSL=allow` (local Postgres has no TLS; `require` refuses to
connect):

```bash
printf %s "postgresql://postgres:postgres@localhost:5432/<slug>" \
  | node scripts/set-env-var.mjs DATABASE_URL
grep -E '^(DATABASE_URL|DATABASE_SSL)=' .env
```

Expect `localhost:5432/<slug>` and `allow`.

## 3e. What is deliberately *not* done here

These require an external account and cannot be generated. Step 4 obtains them — several
automatically over MCP, the rest by asking the user once:

`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `AUTUMN_SECRET_KEY` · the email provider credentials ·
the production `DATABASE_URL` (Step 4a, in `.env.prod`)

Be honest with the user about this boundary rather than implying full automation — there is no way
to mint someone else's OAuth client or API key.

## 3f. Sanity check

The app cannot boot yet (service keys unset) — that is expected. Do **not** run `pnpm dev` here;
that is Step 5, after provisioning. Confirm `.env` exists, the three secrets are populated, and
`DATABASE_URL` points at localhost, then move to Step 4.
