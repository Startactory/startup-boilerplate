# Step 4 — Provision & configure services

Fill every remaining value of the two environments. The founder pastes nothing. Each service uses
one of three channels, and every secret goes into 1Password (`startup-<slug>/local` or
`startup-<slug>/production`), never into text you read. After each service, tell the user what you
set (names and statuses only) and move on. Re-read `src/shared/env.ts` if unsure about a name,
format, or whether a var is required.

**First**, surface the accounts the user needs (Step "Prerequisites" in SKILL.md). The founder's
provider accounts and master keys come from step 0; if a script says a key is missing in
`startup-founder/master-keys`, send the user back to step 0 for that key and resume here.

Where each value lives: the local `.env` is regenerated from the `local` item, `.env.prod` from the
`production` item (secret lines are `op://` references). **Supabase (4a) and Dash0 (4f) are
production-only.** Every provider script writes to the vault first and regenerates the env file
itself; there is no copy from `.env` to `.env.prod` in Step 6. If you ever need to regenerate a
file by hand: `node scripts/vault-sync.mjs --env local|production`.

Order matters a little: do **Supabase** first (project creation takes a few minutes and fixes the
data region), then the other services, then Autumn last (it depends on the billing code being
present).

Regions never vary per service. Every region comes from `startup.config.json` `dataRegion`, through
`references/data-region.md`.

---

## How secrets reach the vault (three channels, one rule)

Rule: a secret goes from its source to 1Password through a pipe, never through text you read. A
value never appears in a command line, in your output, in a page-text dump or in a screenshot.

1. **Script calls an API.** A provider script reads the founder's master key from
   `startup-founder/master-keys`, calls the provider, and writes the resulting key to the vault.
   It prints field names and statuses only (4a, 4c, 4d, 4f).
2. **Downloaded file.** Where a dashboard offers a download (Google's "Download JSON"), Claude in
   Chrome clicks the download button and a script reads the file from `~/Downloads`, stores the
   fields and deletes the file (4b).
3. **Clipboard.** Where a dashboard has no download, Claude in Chrome clicks the page's own Copy
   button and one command stores it and clears the clipboard:

   ```bash
   node scripts/vault-put.mjs --from-clipboard <local|production> <FIELD>
   ```

   Without `--from-clipboard` the value is read from stdin (`... | node scripts/vault-put.mjs <item> <FIELD>`).
   Success prints `OK  <FIELD> stored in <vault>/<item> (<n> chars)`, then
   `<file> regenerated (<n> keys)`. An `ERROR` line means nothing was written and the clipboard is
   cleared: copy again (a wrong or empty clipboard is the usual cause) and re-run.
   `--vault <name>` overrides the vault; it defaults to `startup-<slug>`.

**Chrome rule on any page that shows a secret** (a client secret, an API key, a token): use narrow
`find` queries only (for example `find "Copy client secret button"`) and click the result. Never
call `get_page_text`, `read_page` or `screenshot` there, and do not read the page's form fields
with JavaScript. If you must see the page to navigate, do it before the secret appears or after
you leave it.

Ask the founder's go-ahead before an OAuth consent screen and before creating a key in a
dashboard. Never create an account, type a password or solve a CAPTCHA: if a page demands one,
stop and hand that single click to the founder.

Tell the user where they are — "that's 3 of 6" — so the remaining work is visible.

---

## 4a. Supabase — production database (MCP: `supabase`, then a script)

Fills, in the **`production`** item: `DATABASE_URL`, `DATABASE_SSL`. Supabase only hosts the
production Postgres; the boilerplate uses no Supabase Storage or API keys. Never write this
database into `.env`.

### 1. Pick the organization

`list_organizations`. If there is more than one, ask which to use; otherwise take the only one.

### 2. Get cost approval before creating anything

Creating a project can be billable. Do not skip the MCP's cost-confirmation flow:

1. `get_cost` for a new project in that organization.
2. **Show the amount to the user and get an explicit yes.** Creating a paid resource on someone's
   account without asking is not yours to decide.
3. `confirm_cost`, and keep the returned confirmation id: `create_project` requires it.

### 3. Create the project

`create_project` with:

- `name` — the `slug` from Step 1
- `region` — the Supabase region `references/data-region.md` gives for `startup.config.json`
  `dataRegion` (it cannot be moved later)
- `db_pass` — a random throwaway (for example 24 random base64url characters). It is in the MCP
  call, so treat it as burned: the script in step 5 replaces it at once with a password that never
  enters the transcript. Do not store it anywhere.
- `confirm_cost_id` — from step 2

Then poll `get_project` until `status` is `ACTIVE_HEALTHY`. Provisioning takes a minute or two, and
every later call fails confusingly if you race it. Note the project `ref`.

### 4. Seed `.env.prod`

```bash
node scripts/init-env.mjs --apply --file .env.prod
```

This creates the `production` item with its **own** secrets, generated independently of the local
ones: a leaked local secret must not forge a production session. Success ends with
`startup-<slug>/production updated; .env.prod regenerated (<n> keys)`. The app URL stays on
localhost until Step 6 sets the production URL.

### 5. Replace the throwaway password and store `DATABASE_URL`

```bash
node scripts/providers/supabase-database.mjs --ref <ref>
```

The script resets the database password through the Supabase Management API, finds the session
pooler host itself (user `postgres.<ref>`, port 5432), writes `DATABASE_URL` and
`DATABASE_SSL=require` to the `production` item, connects to check them, and regenerates
`.env.prod`. Success prints
`OK  database password created, DATABASE_URL stored in startup-<slug>/production`.

- It reads `SUPABASE_ACCESS_TOKEN` from `startup-founder/master-keys`. If it reports the key is
  missing, send the user to step 0.
- On `database password set but connection failed: <code>` the password is already replaced and
  stored. The script already retries the connection for about a minute while the new password
  propagates. If it still fails, run the same command again: it checks the stored URL, reuses it
  when it works and re-syncs `.env.prod`, so a re-run after a failed check is safe. Do not add
  `--rotate`; it never rotates on a network error.
- `--rotate` is for a deliberate password rotation only (a leaked password), not for retries. On
  an already deployed startup, re-run the 6g push of `.env.prod` to Vercel and
  `node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL`
  afterwards, or production and CI keep the old password.

Do not run a manual connection check: the script already connected.

---

## 4b. Google OAuth — required sign-in (Claude in Chrome)

Fills: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in **both** items, with a separate OAuth client
per environment. Email/password is disabled, so without this **no one can sign in**. Better Auth
mounts at `/auth` (not `/api/auth`).

Load the Chrome tools in one ToolSearch call and read the `chrome-browser` skill first. The founder
is already signed in to Google (step 0). Ask the founder's go-ahead before starting, then in
Chrome:

1. https://console.cloud.google.com → create a project named after the startup.
2. **Google Auth Platform → Get started** (`console.cloud.google.com/auth/overview`): app name
   (startup name), user support email (the founder), audience **External**, contact email (the
   founder), tick the Google API Services User Data Policy (covered by the step 0 up-front yes),
   **Create**. Then **Data Access** → add scopes `.../auth/userinfo.email` and
   `.../auth/userinfo.profile` (the code requests these), and **Audience → Test users** → add the
   founder's Google account while the app is in "Testing". If the Google Cloud console first shows
   its own terms dialog, tick it (same up-front yes) and keep the founder's real country.
3. **Clients → Create client → Application type: Web application**, twice:
   - `<name> (local)` with redirect URI `http://localhost:3000/auth/callback/google`
   - `<name>` with redirect URI `https://<prod-domain>/auth/callback/google` when
     `startup.config.json` has the domain. If it does not, create the client with no production
     redirect URI; Step 6h adds it once the domain is known.
4. After creating each client, the dialog shows its ID and secret. This page shows a secret: follow
   the Chrome rule above (narrow `find` only). Click **Download JSON** (`find "Download JSON"`),
   then store the file:

   ```bash
   node scripts/vault-import-google-client.mjs --env local ~/Downloads/<client_secret_….json>
   node scripts/vault-import-google-client.mjs --env production ~/Downloads/<client_secret_….json>
   ```

   Use the `local` command for the `(local)` client and the `production` command for the other.
   `ls ~/Downloads/client_secret_*.json` shows the file name (names only, do not open the file).
   Success prints `OK  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET stored in <vault>/<item>`, then
   `deleted <path>`. A `WARNING` line is advisory (for example, an ID or secret shape that looks
   off): read it. On error it prints `kept <path> — fix the error and re-run`; the file stays so you
   can retry. "Not a web client" means the wrong client type was created.

   **Never search for the Copy buttons on this dialog.** Their accessible names contain the client
   ID and the secret ("Copy to clipboard: GOCSPX-…"), so any `find` or `read_page` that matches
   them puts the secret in the transcript. `find "Download JSON"` is safe (checked live).

   Fallback when no Download JSON button is offered: ask the founder to click the client secret's
   Copy button themselves, then run `node scripts/vault-put.mjs --from-clipboard <env> GOOGLE_CLIENT_SECRET`;
   the same for the client ID with `GOOGLE_CLIENT_ID`. A client ID in the secret slot (or the
   reverse) is rejected by validation. If a secret did reach the transcript, delete that client
   (ask first) and create a new one.

(Microsoft OAuth is optional and left as a TODO — the code enables it automatically if
`MICROSOFT_CLIENT_ID/SECRET` are set; redirect URI `/auth/callback/microsoft`.)

---

## 4c. PostHog — analytics (script, chosen optional)

Fills: `NEXT_PUBLIC_POSTHOG_KEY` in both items (`NEXT_PUBLIC_POSTHOG_HOST` is already set by
`scripts/init-env.mjs` from `dataRegion`: `https://eu.i.posthog.com` or `https://us.i.posthog.com`).
PostHog regions are separate accounts, and the master key for the startup's region is used, so an
EU startup never lands in a US account.

```bash
node scripts/providers/posthog-projects.mjs
```

Each startup gets its **own PostHog organization**, named `<name>`: the free plan allows one project
per organization, and a separate organization keeps the startup's usage and billing apart. The
script creates (or reuses) that organization, turns its bootstrap "Default project" into the
production project `<name>`, then tries a `<name> (local)` project so local events stay out of
production analytics. It stores each project's `phc_…` key in the matching item. Success prints
`OK  PostHog organization <state>, production <state>, local <state>, stored in startup-<slug>/production`
(plus `and startup-<slug>/local` when the local project exists). It is idempotent: re-running reuses
the organization and the projects.

On the free plan the local project is refused, so it is skipped with a warning. Local analytics are
then a clean no-op (the key stays empty), which is fine. A missing master key, or an error naming a
missing scope, means step 0 is incomplete (the key needs `organization:write` and `project:write`).

---

## 4d. Email — Resend or SMTP

`env.ts` requires the vars of the **selected** provider only. Choose based on whether the startup's
domain exists in Resend (`startup.config.json.domain`, roadmap item 4 verifies it):

**Domain present in Resend → Resend** (better for production deliverability):

```bash
node scripts/providers/resend-keys.mjs
```

It creates (or reuses) two sending-only keys scoped to the domain, one per environment, and stores
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` (`noreply@<domain>`) in the matching items. Success prints
`OK  Resend local <state>, production <state>, scoped to <domain>, stored in …`. If it reports
"no domain in startup.config.json" or "domain … is not in Resend", the domain step is not done:
use SMTP for now. A key that exists remotely while the vault lost it is rotated by the script.

**No domain yet → SMTP (Gmail app password)** — works without a domain, fine to start.

Say this exception out loud to the founder before running it: a Gmail app password cannot be split
per environment, and `env.ts` requires the selected provider's credentials at boot, locally too. So
the founder's app password will sit in this startup's local `.env`, and in the production item.
Resend stays the default as soon as the startup has a domain; migrate before scaling invites (Gmail
caps at about 500 emails a day).

The app password was created once in step 0 and lives in `startup-founder/master-keys`. Copy it:

```bash
node scripts/vault-copy-smtp.mjs
```

It copies `SMTP_USER` and `SMTP_PASS` from the founder vault into both items, sets
`SMTP_FROM_EMAIL` to `SMTP_USER` (Gmail rewrites otherwise) and `EMAIL_PROVIDER=smtp`, and
regenerates `.env` and `.env.prod`. Success prints
`OK  SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL and EMAIL_PROVIDER stored in startup-<slug>/local and startup-<slug>/production`.
Failures: "missing in startup-founder/master-keys: …" means step 0 has no app password yet;
"no 1Password item …" means run 3c (and 4a step 4) first. `SMTP_HOST` and `SMTP_PORT` are already
set by `init-env.mjs`. Optionally set `SMTP_FROM_NAME` to the startup name:

```bash
printf %s "<name>" | node scripts/vault-put.mjs local SMTP_FROM_NAME
printf %s "<name>" | node scripts/vault-put.mjs production SMTP_FROM_NAME
```

---

## 4e. Autumn — payments (Claude in Chrome + CLI) — do this last

Fills: `AUTUMN_SECRET_KEY` in the `local` item (sandbox key, `am_sk_test_…`). The production key is
swapped in at Step 6. Depends on the **billing integration being present in the code**
(`autumn.config.ts`, the `/api/autumn/[...all]` handler, `AutumnProvider`, and the
`AUTUMN_SECRET_KEY` entry in `env.ts`). If those aren't there yet, do the billing integration
first, then return here.

1. **Create the Autumn organization.** Claude in Chrome, signed in to Autumn (step 0): create an
   organization named after the startup. It is a separate org per startup; there is no secret on
   that page.
2. **Log in the CLI and move the keys into the vault.** Run in the background:

   ```bash
   node scripts/providers/autumn-login.mjs
   ```

   It runs `atmn login` in a throwaway directory (so `atmn` never asks to overwrite `.env`) and
   prints `OPEN  <url>` instead of opening a browser. Open that URL in Chrome, check that the
   organization selector shows the startup's org, and click "Authorize" (with the up-front yes from
   step 0). The script then validates the keys, stores the sandbox key in `startup-<slug>/local`
   and the production key in `startup-<slug>/production`, deletes the throwaway directory, and
   regenerates both env files. Success prints
   `OK  Autumn sandbox key stored in startup-<slug>/local, production key <stored|not found> in startup-<slug>/production`.
   Failures: "atmn login never opened a browser" or "atmn login failed" mean run it again (the
   consent page expires after a few minutes); "… is a live key" means the wrong environment was
   chosen; "no 1Password item …" means run 3c and 4a step 4 first.

   If the founder ran `atmn login` by hand instead, `node scripts/vault-import-autumn-keys.mjs`
   moves the keys it wrote to `.env` into the vault.
3. **Push the product/pricing config** to Autumn's sandbox:

   ```bash
   pnpm dlx atmn push --yes
   ```

   The products/plans live in `autumn.config.ts`; Step 1b already set the `pro` price and trial.
   To change the pricing, go back to `references/01b-set-pricing.md`.
4. **Test mode only for now.** The Autumn sandbox comes with its own test Stripe account, so you
   connect nothing and add no Stripe key to this app (Autumn manages the Stripe webhooks). Live
   Stripe and the production key are Step 6.

---

## 4f. Dash0 — logs, traces, metrics (script)

Fills, in the **`production`** item: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`.
`OTEL_SERVICE_NAME` is already the `slug` in both files (set by `scripts/init-env.mjs`). Run it
after 4a: the `production` item must exist. It depends on no other service. No code change:
`src/instrumentation.ts` exports all three signals over OTLP/HTTP as soon as the endpoint is set,
and every `shared/logger` line becomes a Dash0 log linked to its trace.

Production only: the local `.env` keeps `OTEL_EXPORTER_OTLP_ENDPOINT` empty, so `pnpm dev` prints
logs to the terminal and sends nothing. Local runs would otherwise land in the production dataset,
mixed with real traffic and billed like it. To inspect local telemetry, see
`docs/observability.md`.

The founder keeps **one Dash0 organization** for all their startups (in the region
`references/data-region.md` gives for `dataRegion`; fixed when the organization is created); each
startup gets its own **dataset** and its own **ingest token**. Dash0 has no free tier (14-day
trial, then billed per log record, span and metric data point); say so if the founder has no
organization yet (that is step 0).

```bash
node scripts/providers/dash0-dataset.mjs
```

It reads the organization's admin token, API URL and OTLP endpoint for the startup's region from
`startup-founder/master-keys`, creates (or reuses) the dataset named after the `slug`, creates an
ingest-only token scoped to it, and stores the endpoint and the headers
(`Authorization=Bearer …,Dash0-Dataset=<slug>`) in the `production` item, then regenerates
`.env.prod`. Success prints
`OK  dataset <slug> <state>, ingest token <state>, stored in startup-<slug>/production`.
It is idempotent, and rotates a token the vault lost. An "is not a valid Dash0 dataset id" error
means the slug does not fit Dash0 (3-26 letters, digits, `-` or `_`): tell the user before
changing anything.

Verify in Step 6j, after the first production deploy: the dataset shows logs from service
`<slug>` in Dash0 within a minute. On Vercel Hobby this OTLP export is the only path; Dash0's Vercel
log drain (build and request logs) needs Vercel Pro.

---

## Done with Step 4

Regenerate both files and check them against `src/shared/env.ts` by names and counts only:

```bash
node scripts/vault-sync.mjs --env local
node scripts/vault-sync.mjs --env production
cut -d= -f1 .env
cut -d= -f1 .env.prod
grep -c '^DATABASE_URL=postgresql://postgres:postgres@localhost' .env
grep -c '=op://' .env.prod
```

The name lists show which variables exist; the localhost check must print `1` and the `op://`
count is the number of secrets. No value is printed.

Every **required** var is populated (secret lines in `.env.prod` are `op://` references), formats
are correct, and optional ones are either set or left as an explicit `# TODO` line. `DATABASE_URL`
in `.env` still points at localhost, and the `production` item holds the Supabase pooler URL the
4a script connected to. Never print or open a secret value to check this.
Then move to Step 5 to verify.
