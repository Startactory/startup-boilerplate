# Step 4 — Provision & configure services

**Phase 2.** Each section is one step of the run, closed with
`node scripts/run-ledger.mjs done <id>` once its success line appeared:

| Section | Step id |
| --- | --- |
| 4a Supabase | `supabase` |
| 4b Google OAuth | `google-oauth` |
| 4c PostHog | `posthog` |
| 4d Email (SMTP) | `smtp` |
| 4e Autumn | `autumn` |
| 4f Dash0 | `dash0` |

Fill every remaining value of the two environments. The founder pastes nothing and is asked
nothing. Each service uses one of three channels, and every secret goes into 1Password
(`startup-<slug>/local` or `startup-<slug>/production`), never into text you read. After each
service, print what you set (names and statuses only) and move on. Re-read `src/shared/env.ts` if
unsure about a name, format, or whether a var is required.

The founder's provider accounts, Chrome sessions and master keys were set up in phase 1
(`phase-1-setup.md` section 3, with the procedures of `00-founder-setup.md`), and the preflight
checked the master keys. If a script still reports a key missing in `startup-founder/master-keys`,
create it as `00-founder-setup.md` item 6 does (covered by the consent); a page that demands a
password or a 2FA code is a block.

Where each value lives: the local `.env` is regenerated from the `local` item, `.env.prod` from the
`production` item (secret lines are `op://` references). **Supabase (4a) and Dash0 (4f) are
production-only.** Every provider script writes to the vault first and regenerates the env file
itself; there is no copy from `.env` to `.env.prod` in Step 6. If you ever need to regenerate a
file by hand: `node scripts/vault-sync.mjs --env local|production`.

Order matters a little: do **Supabase** first (it creates the `production` item's database and
fixes the data region), then the other services, then Autumn (it depends on the billing code being
present), then Dash0.

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

OAuth consents, dashboard keys and the file downloads below are covered by the phase 1 consent in
the `/goal` line. Never create an account, type a password or solve a CAPTCHA: a page that demands
one is a block (`phase-2-run.md`, "Block protocol"). Check the Chrome session of a site right
before the step that drives it (`phase-2-run.md`, "Rules for the whole run").

Announce where you are ("4c, 3 of 6") so the run's progress is visible in the transcript.

---

## 4a. Supabase — production database (two scripts)

Fills, in the **`production`** item: `DATABASE_URL`, `DATABASE_SSL`. Supabase only hosts the
production Postgres; the boilerplate uses no Supabase Storage or API keys. Never write this
database into `.env`. No MCP and no cost question: the scripts use the Supabase Management API with
`SUPABASE_ACCESS_TOKEN` from the master keys, and create on the Free plan only.

### 1. Create or reuse the project

```bash
node scripts/providers/supabase-project.mjs
```

It finds the organization `startup-factory`, reuses a project named after the `slug` or creates
one in the Supabase region `references/data-region.md` gives for `dataRegion` (it cannot be moved
later), and waits until it is `ACTIVE_HEALTHY` (up to 10 minutes). That wait outlasts a Bash
call's 2-minute default: run the script in the background and read its output when it exits. The
project's first password is random and never leaves the script; step 3 replaces it. Success
prints `OK  Supabase project <ref> <created|reused> in <region>`. Note the `ref`.

A project named after the slug that is `GOING_DOWN` (being deleted) or `REMOVED` counts as gone:
the script creates a new one and does not count it against the free limit.

Failures:

- `Supabase project <ref> still <status> after 10 minutes — re-run to keep waiting`: run it again;
  it reuses that project and never creates a second one.
- `Supabase project <ref> is <status> — the founder restores or deletes it in the Supabase
  dashboard`: the project named after the slug is paused (`INACTIVE` or `PAUSED`: free projects
  pause after a week without activity) or failed (`INIT_FAILED`, `RESTORE_FAILED`, `PAUSE_FAILED`) and will
  never become healthy. Restoring it uses a free-project slot and deleting it is on the closed
  list, so in phase 2 it is a `BLOCKED_ON_FOUNDER` case, with an action such as
  `in the Supabase dashboard, restore project <ref> or delete it`. On resume,
  run the script again: it reuses a restored project or creates a new one.
- `Supabase organization "startup-factory" not found — run step 0`, `… is on a paid plan — the run
  creates free projects only`, or `Supabase Free plan allows 2 active projects and startup-factory
  has <n> — pause one or upgrade (founder action)`: the founder's (an organization, a plan, a
  pause or a deletion), so in phase 2 a block. The preflight's `supabase-quota` check normally
  catches these first.
- Supabase refuses the creation itself with its own message, which starts with `The following
  organization members have reached their maximum limits for the number of active free projects`
  (or any refusal naming the free project limit). Supabase counts free projects per member across
  every organization where the founder is an owner or admin, not in `startup-factory` alone, so
  the preflight's count can pass while the creation fails. The fix is the founder's (pause a
  project, in any of their organizations, or upgrade), so in phase 2 it is a `BLOCKED_ON_FOUNDER`
  case; on resume, run the script again.

### 2. Seed `.env.prod`

```bash
node scripts/init-env.mjs --apply --file .env.prod
```

This creates the `production` item with its **own** secrets, generated independently of the local
ones: a leaked local secret must not forge a production session. Success ends with
`startup-<slug>/production updated; .env.prod regenerated (<n> keys)`. The app URL stays on
localhost until Step 6e sets `productionUrl`.

### 3. Replace the password and store `DATABASE_URL`

```bash
node scripts/providers/supabase-database.mjs --ref <ref>
```

The script resets the database password through the Supabase Management API, finds the session
pooler host itself (user `postgres.<ref>`, port 5432), writes `DATABASE_URL` and
`DATABASE_SSL=require` to the `production` item, connects to check them, and regenerates
`.env.prod`. Success prints
`OK  database password created, DATABASE_URL stored in startup-<slug>/production`.

- It reads `SUPABASE_ACCESS_TOKEN` from `startup-founder/master-keys`. If it reports the key is
  missing, create it as `00-founder-setup.md` item 6 does.
- On `database password set but connection failed: <code>` the password is already replaced and
  stored. The script already retries the connection for about a minute while the new password
  propagates. If it still fails, run the same command again: it checks the stored URL, reuses it
  when it works and re-syncs `.env.prod`, so a re-run after a failed check is safe. Do not add
  `--rotate`; it never rotates on a network error.
- `--rotate` is for a deliberate password rotation only (a leaked password, after the run), not for
  retries. On an already deployed startup, re-run the 6g push of `.env.prod` to Vercel and
  `node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL`
  afterwards, or production and CI keep the old password.

Do not run a manual connection check: the script already connected.

---

## 4b. Google OAuth — required sign-in (Claude in Chrome)

Fills: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in **both** items, with a separate OAuth client
per environment. Email/password is disabled, so without this **no one can sign in**. Better Auth
mounts at `/auth` (not `/api/auth`). One pass: the production URL is already known
(`productionUrl`, written in phase 1 by `06-deploy-production.md` 6b), so both redirect URIs are
set now.

Load the Chrome tools in one ToolSearch call and read the `chrome-browser` skill first. Check that
Chrome is signed in to Google as `googleAccount`. On a re-run, reuse the Google project recorded
in `googleCloudProject` and its Auth Platform setup, and create only a client whose item still
lacks it: `node scripts/vault-put.mjs --list-fields local` (or `production`) lists
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` by name once they are stored. Then in Chrome:

1. **The Google Cloud project.** When `startup.config.json` has `googleCloudProject`, open
   `https://console.cloud.google.com/auth/overview?project=<googleCloudProject>` and work in that
   project. Otherwise create a new one at `https://console.cloud.google.com/projectcreate`, named
   after the startup, and keep the project ID Google proposes (unique across Google Cloud). Right
   after the creation, write that ID to `startup.config.json` as `googleCloudProject` and commit it
   (on `master` before the first push, through a PR after it), so a re-run finds it. Never select an existing project because it has the
   startup's name: it may belong to something else, and step 5 would publish its OAuth app. A
   project created by an attempt that never recorded its ID stays; the end-of-run report lists it
   for cleanup.
2. **Google Auth Platform → Get started** (`console.cloud.google.com/auth/overview`): app name
   (startup name), user support email `googleAccount`, audience **External**, contact email
   `googleAccount`, tick the Google API Services User Data Policy (covered by the consent to
   accept the providers' terms), **Create**. Then **Data Access** → add scopes
   `.../auth/userinfo.email` and `.../auth/userinfo.profile` (the code requests these). If the
   Google Cloud console first shows its own terms dialog, tick it (same consent) and keep the
   country it shows.
3. **Clients → Create client → Application type: Web application**, twice:
   - `<name> (local)` with redirect URI `http://localhost:3000/auth/callback/google`
   - `<name>` with redirect URI `<productionUrl>/auth/callback/google`
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

   Fallback when no Download JSON button is offered: the ID and secret must be copied by hand,
   which only the founder can do without the secret reaching you (`phase-2-run.md`, closed list:
   "copy a secret by hand"). In phase 2 that is a block. Google shows a new client's secret only
   in its creation dialog, so **leave that dialog open** in its Chrome tab when you block, with an
   action such as
   `in the open Google client dialog in Chrome, copy the ID, run node scripts/vault-put.mjs --from-clipboard <env> GOOGLE_CLIENT_ID; same for the secret, GOOGLE_CLIENT_SECRET`.
   If the dialog was closed, the secret cannot be shown again, so the founder adds a new secret to
   that client and copies that one; the action is then
   `Google Cloud: open the <env> OAuth client, Add secret; copy the ID, then the secret, each into node scripts/vault-put.mjs --from-clipboard <env> GOOGLE_CLIENT_ID (then _SECRET)`.
   `<env>` is `local` or `production`, never the startup name, so both actions stay under the
   200-character push limit (at most 186 characters filled in). The founder
   runs the commands in a terminal in the repo before copying the `/goal` line, which overwrites
   the clipboard. On resume, `node scripts/vault-put.mjs --list-fields <env>` must list both
   names. A client ID in the secret slot (or the reverse) is rejected by validation.

   If a secret did reach the transcript, that is a decision block (`phase-2-run.md`, "Block
   protocol"): the founder decides whether to delete that client (never you). The action is
   `a Google <env> client secret reached the transcript: delete that client in Google Cloud and answer Decision: revoked, or answer Decision: keep`.
   On resume, `revoked`: create a new `<env>` client and import its Download JSON; `keep`: go on
   with that client (import its file if it is still in `~/Downloads`), and the end-of-run report
   lists its secret as exposed. A client from an earlier attempt whose file never reached the vault
   stays; the end-of-run report lists it under "left for cleanup".
5. **Publish the app** so anyone can sign in to the live site (covered by the consent):
   **Audience → Publish app**, from "Testing" to "In production". When Google requires a home page
   and a privacy policy (**Branding**), give `<productionUrl>` and `<productionUrl>/legal/privacy`.
   No test users are needed.

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

On the free plan the local project is refused, so it is skipped with a warning, not a failure.
Local analytics are then a clean no-op (the key stays empty), which is fine. A missing master key,
or an error naming a missing scope (the key needs `organization:write` and `project:write`), means
the master key is wrong: create a new one with the right scopes as `00-founder-setup.md` item 6
does (the old key stays; the report lists it for cleanup), then re-run.

---

## 4d. Email — SMTP during the run, Resend with a domain

`env.ts` requires the vars of the **selected** provider only. A run has no domain
(`startup.config.json` `domain` is `""`), so it uses **SMTP with the Gmail app password**: it
works without a domain.

The phase 1 consent states this fact and the founder accepted it: a Gmail app password cannot be
split per environment, and `env.ts` requires the selected provider's credentials at boot, locally
too. So the founder's app password sits in this startup's local `.env` and in the production item.
Resend replaces it as soon as the startup has a domain; migrate before scaling invites (Gmail caps
at about 500 emails a day).

The app password was created once in phase 1 and lives in `startup-founder/master-keys`. Copy it:

```bash
node scripts/vault-copy-smtp.mjs
```

It copies `SMTP_USER` and `SMTP_PASS` from the founder vault into both items, sets
`SMTP_FROM_EMAIL` to `SMTP_USER` (Gmail rewrites otherwise) and `EMAIL_PROVIDER=smtp`, and
regenerates `.env` and `.env.prod`. Success prints
`OK  SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL and EMAIL_PROVIDER stored in startup-<slug>/local and startup-<slug>/production`.
Failures: "missing in startup-founder/master-keys: …" means phase 1 has no app password yet; only
the founder can create one (`00-founder-setup.md` item 6, SMTP), so in phase 2 it is a block.
"no 1Password item …" means run 3c (and 4a step 2) first. `SMTP_HOST` and `SMTP_PORT` are already
set by `init-env.mjs`. Then set `SMTP_FROM_NAME` to the startup name:

```bash
printf %s "<name>" | node scripts/vault-put.mjs local SMTP_FROM_NAME
printf %s "<name>" | node scripts/vault-put.mjs production SMTP_FROM_NAME
```

**Resend, once the startup has a domain** (after the run only, `after-the-run.md`, "A custom
domain, with Resend"; better for production deliverability):

```bash
node scripts/providers/resend-keys.mjs
```

It creates (or reuses) two sending-only keys scoped to the domain, one per environment, and stores
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` (`noreply@<domain>`) in the matching items. Success prints
`OK  Resend local <state>, production <state>, scoped to <domain>, stored in …`. If it reports
"no domain in startup.config.json" or "domain … is not in Resend", the domain step is not done:
keep SMTP for now. A key that exists remotely while the vault lost it is rotated by the script.

---

## 4e. Autumn — payments (Claude in Chrome + CLI)

Fills: `AUTUMN_SECRET_KEY` with the sandbox key (`am_sk_test_…`) in **both** items: production
uses the sandbox (Stripe test mode) until the founder goes live after the run. Depends on the
**billing integration being present in the code** (`autumn.config.ts`, the `/api/autumn/[...all]`
handler, `AutumnProvider`, and the `AUTUMN_SECRET_KEY` entry in `env.ts`); the boilerplate ships
it.

1. **Create or reuse the Autumn organization.** Claude in Chrome, signed in to Autumn: create an
   organization named after the startup, or select it when it already exists. It is a separate
   org per startup; there is no secret on that page.
2. **Log in the CLI and move the keys into the vault.** Run in the background:

   ```bash
   node scripts/providers/autumn-login.mjs
   ```

   It runs `atmn login` in a throwaway directory (so `atmn` never asks to overwrite `.env`) and
   prints `OPEN  <url>` instead of opening a browser. Open that URL in Chrome, check that the
   organization selector shows the startup's org, and click "Authorize" (covered by the phase 1
   consent). The script then validates the keys, stores the sandbox key in `startup-<slug>/local`
   and in `startup-<slug>/production` (its default: production uses the sandbox key), deletes the
   throwaway directory, and regenerates both env files. Success prints
   `OK  Autumn sandbox key stored in startup-<slug>/local, production uses the sandbox key`.
   Failures: "atmn login never opened a browser" or "atmn login failed" mean run it again (the
   consent page expires after a few minutes); "… is a live key" means the wrong environment was
   chosen; "no 1Password item …" means run 3c and 4a step 2 first.

   If `atmn login` was run by hand instead, `node scripts/vault-import-autumn-keys.mjs` moves the
   keys it wrote to `.env` into the vault (sandbox for production too, by default).
3. **Check the currency.** The plan amounts are in the Autumn organization's default currency, and
   the storefront shows `pricing.currency`. In the Autumn dashboard (the organization's settings),
   check that the default currency equals `pricing.currency`. If it does not, change the
   organization's default to `pricing.currency` before pushing any price (covered by the consent).
4. **Push the product/pricing config** to Autumn's sandbox:

   ```bash
   pnpm dlx atmn push --yes
   ```

   The products/plans live in `autumn.config.ts`; phase 1 already set the `pro` price and trial
   (`references/01b-set-pricing.md`).
5. **Test mode only.** The Autumn sandbox comes with its own test Stripe account, so you connect
   nothing and add no Stripe key to this app (Autumn manages the Stripe webhooks). Never run
   `atmn push -p` while production uses the sandbox: live Stripe, the live key and the production
   push are going live (`after-the-run.md`).

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
trial, then billed per log record, span and metric data point): the phase 1 briefing and consent
name it, and the preflight's `dash0` check proved the organization still answers.

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
means the slug does not fit Dash0 (3-26 letters, digits, `-` or `_`); the preflight's slug rule
already fits it, so never rename the slug in phase 2.

Logs reach the dataset once production gets traffic. Phase 2 does not wait for them; the live
checks after going live (`after-the-run.md`, "Go live") look for logs from service `<slug>`. On
Vercel Hobby this OTLP export is the only path; Dash0's Vercel log drain (build and request logs)
needs Vercel Pro.

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
4a script connected to. Never print or open a secret value to check this. This check closes the
`dash0` step; Step 5 comes next.
