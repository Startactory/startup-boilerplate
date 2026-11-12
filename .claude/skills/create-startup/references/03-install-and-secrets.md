# Step 3 — Install & build the local environment

Build the **local** development environment: dependencies, a local Postgres, and a `.env` filled
with local values. Production is a separate environment, finished in Step 6. Do not mix them.

**Do this yourself — nothing here requires the user.** No accounts, no keys, no commands handed
over for someone else to run. Execute it, report what happened, move on. Asking the user to paste
anything is a failure of this step.

The vault, the 1Password CLI (`op`) and the service account token come from step 0. If `op` is
missing, go back to step 0.

## The two-environment model (read this before touching any env file)

| | `.env` (local, this step) | `.env.prod` (production, Steps 4a and 6) |
| --- | --- | --- |
| Database | local Postgres on this machine | Supabase session pooler |
| `DATABASE_SSL` | `allow` | `require` |
| App / auth URL | `http://localhost:3000` | `https://<prod-domain>` |
| Secrets | generated for local | generated separately for production |
| Autumn | sandbox key (`am_sk_test_…`) | production key |
| Lives in | 1Password `startup-<slug>/local`; the file is regenerated from it | 1Password `startup-<slug>/production`; secret lines are `op://` references |
| Used by | `pnpm dev` on this machine | pushed to the Vercel project |

The vault is the source of truth. Never edit an env file by hand: write to the vault, then
regenerate the file with `node scripts/vault-sync.mjs --env local` (`.env`) or
`node scripts/vault-sync.mjs --env production` (`.env.prod`). It prints
`<file> regenerated from <vault>/<item> (<n> keys)`.

Both files are git-ignored (`.env`, `.env.*`; `.env.template` is the only committed one).

**The Supabase database never goes in `.env`.** Local development runs against a local database:
it is free and disposable, and a broken migration or a stray `drizzle:push` cannot damage real
user data. `scripts/set-env-var.mjs` and `scripts/vault-put.mjs` refuse a Supabase `DATABASE_URL`
in `.env`.

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

## 3c. Create the vault items and populate `.env`

One command creates the 1Password vault `startup-<slug>` and its `local` item, generates every
secret straight into that item, fills the constants, and regenerates `.env` from it:

```bash
node scripts/init-env.mjs --apply
```

Success ends with `startup-<slug>/local updated; .env regenerated (<n> keys). Secret values were
generated locally and never printed.` and `Remaining variables need an account — see step 4.`
If it fails, nothing was written. Read the message:

- `no 1Password service account token in the Keychain (startup-factory-op) — run step 0, item 2`
  or `1Password rejected the service account token — run step 0, item 2`: go back to step 0,
  item 2, then re-run.
- `1Password rate limit reached for the service account — retry in an hour`: wait, then re-run.

What it does:

| | |
| --- | --- |
| **Generates** | `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `ENCRYPTION_KEY` — via `crypto.randomBytes`, lengths well above the `env.ts` minimums |
| **Sets** | `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` (both `http://localhost:3000`), plus constants (`NEXT_PUBLIC_POSTHOG_HOST`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`) |
| **Leaves alone** | any key that already holds a real value |

It is **idempotent** — safe to re-run at any point, including after Step 4, because it never
overwrites a value that is already set. Omit `--apply` to preview first. Flags: `--file <path>`
(default `.env`; `.env.prod` targets the `production` item) and `--app-url <url>` (production
only).

Secrets are generated in-process and written to 1Password — never echoed, so they never reach the
terminal, the transcript, or shell history.

Do **not** pass `--app-url` here. The production URL belongs to `.env.prod` (Step 6).

## 3d. Point the database at local Postgres

`.env.template` ships `DATABASE_URL` on the generic `postgres` database. Point it at the project's
own database, and keep `DATABASE_SSL=allow` (local Postgres has no TLS; `require` refuses to
connect). The value holds only the local default credentials:

```bash
printf %s "postgresql://postgres:postgres@localhost:5432/<slug>" \
  | node scripts/vault-put.mjs local DATABASE_URL
grep -E '^(DATABASE_URL|DATABASE_SSL)=' .env
```

`vault-put.mjs` prints `OK  DATABASE_URL stored in startup-<slug>/local (<n> chars)` and
regenerates `.env`. Expect `localhost:5432/<slug>` and `allow` in the grep. If a `WARNING` line
appears, read it; an `ERROR` line means nothing was written.

## 3e. What is deliberately *not* done here

These need an external account. Step 4 obtains every one of them with no paste: a script calls the
provider API with the founder's master keys (step 0), or Claude in Chrome moves the value through
the clipboard or a downloaded file straight into the vault. Be honest with the user about which
parts are fully automatic and which ask for one click.

| Variable | How Step 4 gets it | Founder step |
| --- | --- | --- |
| production `DATABASE_URL` (4a) | Supabase MCP creates the project; `supabase-database.mjs` resets the password and stores the URL | approve the cost |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (4b) | Claude in Chrome creates two OAuth clients; downloaded JSON or the Copy buttons go to the vault | go-ahead |
| `NEXT_PUBLIC_POSTHOG_KEY` (4c) | PostHog API: two projects, `<name> (local)` and `<name>` | none |
| `RESEND_API_KEY` (4d) | Resend API: two sending-only keys (needs a domain in Resend); otherwise SMTP from the vault | none |
| SMTP credentials (4d) | copied from `startup-founder/master-keys` | none (the Gmail app password was created in step 0) |
| `AUTUMN_SECRET_KEY` (4e) | `scripts/providers/autumn-login.mjs` runs `atmn login` and stores the keys | nothing (Claude approves the consent page) |
| `OTEL_EXPORTER_OTLP_*` (4f) | Dash0 API: dataset `<slug>` and a dataset-scoped ingest token | none |

## 3f. Sanity check

The app cannot boot yet (service keys unset) — that is expected. Do **not** run `pnpm dev` here;
that is Step 5, after provisioning. Check names and counts only, never values:

```bash
cut -d= -f1 .env
grep -c '^DATABASE_URL=postgresql://postgres:postgres@localhost' .env
```

The first lists the variable names (the three secrets must be among them); the count must be `1`.
Then move to Step 4.
