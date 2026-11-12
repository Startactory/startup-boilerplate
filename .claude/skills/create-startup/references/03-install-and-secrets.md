# Step 3 — Install & build the local environment

**Phase 2, step `local-env`.** Build the **local** development environment: dependencies, a local
Postgres, and a `.env` filled with local values. Production is a separate environment, finished in
Step 6. Do not mix them.

**Do this yourself — nothing here requires the founder.** No accounts, no keys, no commands handed
over for someone else to run, no question. Execute it and move on.

The vault, the 1Password CLI (`op`) and the service account token come from phase 1
(`00-founder-setup.md` items 1 and 2), and the preflight checked them. A missing `op` is
installed as item 1 does; a missing or rejected service account token is the founder's (item 2,
in Terminal.app), so in phase 2 it is a block.

## The two-environment model (read this before touching any env file)

| | `.env` (local, this step) | `.env.prod` (production, Steps 4a and 6) |
| --- | --- | --- |
| Database | local Postgres on this machine | Supabase session pooler |
| `DATABASE_SSL` | `allow` | `require` |
| App / auth URL | `http://localhost:3000` | `productionUrl` from `startup.config.json` |
| Secrets | generated for local | generated separately for production |
| Autumn | sandbox key (`am_sk_test_…`) | the same sandbox key until go-live, then the live key |
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
   (`sharp`, `esbuild`, …). Phase 1 may already have run it; running it again is safe.
3. `node scripts/sync-startup-profile.mjs` — turns the `brand`, `legal` and `pricing.currency`
   written in Step 1d into `src/shared/startup-profile/profile.json` and `src/app/brand.css`. It
   needs the installed dependencies and ends with `OK  startup profile synced (<name>)`; on a
   `FAIL` line fix the named field in `startup.config.json` and re-run.
4. Commit the two generated files on `master` (the first push is still to come, in 6j):

   ```bash
   git add src/shared/startup-profile/profile.json src/app/brand.css
   git commit -m "chore: sync the startup profile"
   ```

   Nothing to commit (a re-run) is fine.

## 3b. Start a local Postgres and create the database

Name the database after the `slug` from `startup.config.json`, so several projects can share one
Postgres server. Phase 1 made sure Postgres or Docker is on the machine (checklist item 5; the
preflight's `tool:database` check).

If Postgres already runs locally, create the database (`already exists` on a re-run is fine):

```bash
createdb "<slug>"
```

3d connects as `postgres` / `postgres`. When `psql -U postgres -d postgres -c 'select 1'` fails
with `role "postgres" does not exist` (a Homebrew Postgres names its superuser after the macOS
user), create that local role once:

```bash
createuser -s postgres
psql -d postgres -c "ALTER ROLE postgres PASSWORD 'postgres'"
```

Otherwise start one with Docker, with the credentials the connection string expects
(`postgres` / `postgres` on port 5432). When `docker info` fails because Docker Desktop is not
running, open it (`open -a Docker`) and wait until `docker info` succeeds.

```bash
docker run -d --name "<slug>-postgres" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB="<slug>" \
  -p 5432:5432 \
  -v "<slug>-pgdata:/var/lib/postgresql/data" \
  postgres:17
```

On a re-run, a container named `<slug>-postgres` may already exist: `docker start "<slug>-postgres"`
instead. Wait until it accepts connections. A running container is not necessarily ready:

```bash
until docker exec "<slug>-postgres" pg_isready -U postgres -q; do sleep 1; done && echo "postgres ready"
```

If port 5432 is taken by another Postgres, reuse that server (`createdb "<slug>"`) or map another
host port and use that port in 3d. Do not run two servers silently.

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
  or `1Password rejected the service account token — run step 0, item 2`: only the founder can
  redo step 0, item 2 (in Terminal.app), so in phase 2 this is a block; after the resume, re-run.
- `1Password rate limit reached for the service account — retry in an hour`: wait, then re-run.

What it does:

| | |
| --- | --- |
| **Generates** | `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` — via `crypto.randomBytes`, lengths well above the `env.ts` minimums |
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

These need an external account. Step 4 obtains every one of them with no paste and no question: a
script calls the provider API with the founder's master keys (phase 1), or Claude in Chrome moves
the value through the clipboard or a downloaded file straight into the vault, under the phase 1
consent.

| Variable | How Step 4 gets it |
| --- | --- |
| production `DATABASE_URL` (4a) | `supabase-project.mjs` creates the project on the Free plan through the Management API; `supabase-database.mjs` resets the password and stores the URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (4b) | Claude in Chrome creates two OAuth clients; each downloaded JSON goes to the vault |
| `NEXT_PUBLIC_POSTHOG_KEY` (4c) | PostHog API: two projects, `<name> (local)` and `<name>` |
| SMTP credentials (4d) | copied from `startup-founder/master-keys` (the Gmail app password was created in phase 1) |
| `AUTUMN_SECRET_KEY` (4e) | `scripts/providers/autumn-login.mjs` runs `atmn login` and stores the sandbox key in both items; Claude approves the consent page |
| `OTEL_EXPORTER_OTLP_*` (4f) | Dash0 API: dataset `<slug>` and a dataset-scoped ingest token |

`RESEND_API_KEY` stays empty: a run has no domain and uses SMTP. Resend comes with a custom domain
(`after-the-run.md`).

## 3f. Sanity check

The app cannot boot yet (service keys unset) — that is expected. Do **not** run `pnpm dev` here;
that is Step 5, after provisioning. Check names and counts only, never values:

```bash
cut -d= -f1 .env
grep -c '^DATABASE_URL=postgresql://postgres:postgres@localhost' .env
```

The first lists the variable names (the two generated secrets must be among them); the count must
be `1`.
Then `node scripts/run-ledger.mjs done local-env`.
