# Credential vault and zero copy-paste — design

Status: approved by the founder (2026-11-09). Roadmap item 3 of "a startup from one prompt".

## Intent

The `create-startup` skill still asks the founder to copy keys out of dashboards and paste them at
hidden prompts: Google OAuth (4b), Dash0 (4f), the Vercel deploy hook (6d), the production Autumn
key (6f), and sometimes PostHog and Resend. Each paste is a manual step in a flow that promises
"one prompt to a running company", and each one is a chance to leak or mistype a secret.

The founder also has to own an account at every provider. The goal is that this happens **once per
founder**, never per startup, and that every startup after that gets its keys with no paste at all.

## Goals

- One identity: a single Google account signs in to every provider ("Continue with Google"),
  except Supabase, which signs in with GitHub (whose account is itself created with Google).
- Provider accounts are created once, in real time, during a guided one-time setup.
- 1Password is the single store of every secret: the founder's master keys and every startup's
  local and production secrets.
- Per startup, no key is pasted by the founder. Keys move from the provider to 1Password, then from
  1Password to their destination (Vercel, GitHub Actions), by script.
- No secret value ever appears in the Claude transcript (no echo, no page text, no screenshot).

## Non-goals

- Domain purchase, DNS and Resend domain verification (roadmap item 4).
- The early-access gate decision, landing page, legal pages (roadmap item 5).
- Supporting a password manager other than 1Password.
- Windows or Linux founder machines (macOS only for now: `pbpaste`, Touch ID, Homebrew).

## Anti-goals (failure even if it works)

- Claude creating provider accounts, typing passwords, or solving CAPTCHAs. Its rules forbid it,
  even at the founder's request. Account creation stays the founder's click.
- One password reused across providers.
- A secret printed to the terminal output Claude reads, or read off a page by browser automation.
- Real production secrets in a file on disk.

## Constraints

- Claude's own limits: no account creation, no password entry, no CAPTCHA, explicit permission
  before granting an OAuth consent or creating persistent configuration. Signing in through the
  1Password browser integration (`request_credentials` / `autofill_credential`) is allowed: the
  founder approves each item in 1Password and Claude never sees the value.
- `CLAUDE.md` forbids new SaaS without raising it. 1Password is the founder's explicit choice
  (2026-11-09); it becomes a prerequisite and must be added to the infra list in `CLAUDE.md`, the
  README prerequisites and `SKILL.md`. It has no free tier; the article must say so.
- Web dashboards go through Claude in Chrome (Computer Use treats browsers as read-only).
- Google has no API to create an OAuth web client; that step stays browser automation.
- Data region: every resource created by API follows `startup.config.json` `dataRegion`
  (`references/data-region.md`).

## Decisions taken with the founder

1. Accounts are created in real time, by the founder, with "Continue with Google" (GitHub for
   Supabase). Claude opens each sign-up page and checks the session afterwards.
2. 1Password, not the macOS keychain, is the vault.
3. Everything goes in 1Password, not only the master keys.
4. Each startup is its own business: its own Stripe account and its own Autumn organization
   (answered 2026-11-09). KYC therefore happens once per startup, before its first live
   payment; the article states it as the one per-startup human step.
5. No startup runs on the current flow yet (answered 2026-11-09), so this is a clean break: no
   migration command, and no support for plain secret values in `.env.prod`.

Sign-in options were checked on 2026-11-09 on the live pages: Google is offered by GitHub (sign-up
too), Vercel, Autumn, Resend, PostHog EU and Dash0. Supabase offers GitHub, ChatGPT, SSO and
email, not Google.

## Design

### 1. One-time setup (new skill step 0, once per founder machine)

A new reference, `references/00-founder-setup.md`, run before step 1. It is idempotent: each check
that passes is skipped, so later startups run it in seconds.

1. **Tools.** Install what is missing with Homebrew: `1password-cli`, `vercel`, `supabase`. `gh` and
   `gcloud` are already standard. Ask before each install.
2. **1Password CLI.** The founder turns on "Integrate with 1Password CLI" in the 1Password app
   (Settings → Developer). Check with `op whoami`. Create the `startup-founder` vault if it does
   not exist (§2). Each startup's own vault is created at the start of its run.
3. **Identity.** The founder creates or picks one Google account. Claude cannot create it.
4. **Provider accounts.** For each of GitHub, Vercel, Supabase, PostHog (in the account region that
   matches the founder's usual `dataRegion`), Autumn, Stripe, Resend, Dash0 and Google Cloud:
   Claude opens the sign-up or sign-in page in Chrome, the founder clicks "Continue with Google"
   (GitHub for Supabase), Claude reloads the dashboard URL and confirms it is signed in. An
   existing session is skipped. The Stripe and Autumn logins are the founder's; each startup
   later gets its own Stripe account and Autumn organization under them (§4).
5. **CLI logins.** `gh auth login`, `vercel login`, `supabase login`, `gcloud auth login`. Each opens
   the browser; the founder approves. Check with each tool's status command.
6. **Master keys.** Three providers need an account-level key so later steps can create
   per-startup keys by API: Resend (full-access API key), PostHog (personal API key with project
   write), Dash0 (API auth token). For each, Claude asks the founder's go-ahead, creates the key in
   the dashboard through Chrome, and moves it to 1Password through the clipboard channel (§3).

The SMTP fallback (Gmail app password) cannot be created by Claude. If a startup uses SMTP, the
founder creates the app password and saves it in 1Password once; scripts read it from there.

### 2. Vault layout

- **One vault per startup**, named `startup-<slug>`, plus one founder vault, `startup-founder`, for
  the master keys. A 1Password vault is the unit of sharing: a vault per startup lets the founder
  later share one startup (with a co-founder or a hire) without sharing the others, and avoids
  rewriting every `op://` reference if that day comes. Vaults are separate from the founder's
  personal ones.
- `startup-founder` holds one item, `master-keys`, one field per key.
- Each `startup-<slug>` vault holds two items, `local` and `production`. No `/` in vault or item
  names: it separates the parts of an `op://` reference. One concealed field per env variable,
  named exactly as the variable (`GOOGLE_CLIENT_SECRET`, …). Non-secret values (URLs,
  `EMAIL_PROVIDER`, `NEXT_PUBLIC_POSTHOG_HOST`, …) are stored too, so an item alone can rebuild its
  env file.

### 3. How a secret travels — three channels, one rule

Rule: a secret goes from its source to 1Password through a pipe, never through text Claude reads.

1. **API or CLI response.** A script calls the provider (Dash0, Resend, PostHog, the Supabase
   password reset) or runs its CLI (`atmn login`), takes the key from the response, and writes it
   to 1Password. The script prints only names and status, never values.
2. **Clipboard.** For a dashboard with no API (Google OAuth client, any master key): Claude in
   Chrome clicks the page's own "Copy" button, then one Bash command runs
   `pbpaste | node scripts/vault-put.mjs <item> <field>` and clears the clipboard afterwards. On a
   page that shows a secret, Claude only uses narrow `find` queries for the copy button. It never
   calls `get_page_text`, `read_page` or `screenshot` there.
3. **Downloaded file.** Fallback where a dashboard offers a download (Google's "Download JSON"): a
   script reads the file from `~/Downloads`, writes the fields to 1Password, then deletes the file.

Writing to 1Password never puts a value on a command line (visible in `ps`): `vault-put.mjs`
passes it to `op` on stdin, through a JSON item template.

### 4. Per-key plan

Local and production get **separate credentials wherever the provider allows it**, so a
production secret never sits on disk (§5).

| Variable | Today | New source | Channel | Founder step |
| --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET`, other generated secrets | `init-env.mjs` writes to the file | generated by a script, written to the vault | local | none |
| `DATABASE_URL` (prod) | Supabase MCP; Claude generates the password and passes it in the MCP call, so it is in the transcript | MCP still creates the project (keeps its cost approval); a script then resets the database password through the Management API and writes the password and `DATABASE_URL` to the vault | API | approve cost (unchanged) |
| `GOOGLE_CLIENT_ID` / `SECRET` | pasted (4b), one client shared by both environments | Claude in Chrome creates the project, the consent screen and **two clients**: `<name> (local)` with the localhost redirect, `<name>` with the production one | clipboard or file | none |
| `NEXT_PUBLIC_POSTHOG_KEY` | MCP or settings page | PostHog API with the master key: **two projects**, `<name> (local)` and `<name>`, so local events stay out of production analytics | API | none |
| `RESEND_API_KEY` | Resend MCP | Resend API: **two sending-only keys** scoped to the startup's domain, one per environment | API | none (domain is item 4) |
| `SMTP_*` | pasted | read from the vault | — | create the app password once |
| Autumn organization | one shared org (implicit) | Claude in Chrome creates an org named after the startup (the Autumn Platform API that could do it is in private preview) | — (no secret) | none |
| `AUTUMN_SECRET_KEY` sandbox and prod | pasted (4e, 6f) | `atmn login` against the startup's org, then moved from `.env` to the vault | CLI | approve the Autumn login |
| Stripe account | connected by hand in the Autumn dashboard | test: the test Stripe account that comes with the Autumn sandbox. Live: Claude in Chrome creates a new Stripe account for the startup under the founder's Stripe login and connects it to the startup's Autumn org, after the founder's go-ahead | — | KYC for each startup (legal) |
| `OTEL_EXPORTER_OTLP_*` | pasted (4f) | Dash0 API with the master key: dataset `<slug>`, ingest token scoped to it (production only, as today) | API | none |
| `VERCEL_DEPLOY_HOOK_URL` | pasted at `gh secret set` | Vercel API if it can create deploy hooks, else Chrome + clipboard; then piped to `gh secret set` | API or clipboard | none |
| Production redirect URI | manual (6h) | Claude in Chrome adds it to the production OAuth client | — (no secret) | none |

**Stated exception: SMTP.** A Gmail app password cannot be split per environment, and `env.ts`
requires the selected provider's credentials at boot, locally too. A startup on SMTP therefore has
the founder's app password in its local `.env`. Resend stays the default whenever the startup has a
domain; the skill says this exception out loud when SMTP is chosen.

### 5. Env files

- **The vault is the source of truth for both environments.** Every script writes to the vault
  first, then regenerates the env file from it. Nobody edits an env file by hand.
- **`.env.prod`** holds no secret values. Each secret line is a 1Password reference:
  `GOOGLE_CLIENT_SECRET=op://startup-<slug>/production/GOOGLE_CLIENT_SECRET`. Non-secret lines stay
  plain. Everything that consumes `.env.prod` resolves references through `op` at the moment of
  use: `push-env-to-vercel.mjs`, the `gh secret set DATABASE_URL` step, the database checks.
- **`.env`** (local) holds real values, regenerated from the `local` item. `pnpm dev` keeps working
  without 1Password, so a hire without vault access can still run the app with their own local
  values. Every value in it is local-only (local Postgres, Autumn sandbox, local secrets, the
  `(local)` Google client, PostHog project and Resend key), except the SMTP exception above.
- The 6e loop that copies Google, PostHog and email values from `.env` to `.env.prod` goes away:
  each environment gets its own values from the per-key plan.

### 6. Script and skill changes

- New `scripts/vault-put.mjs`: reads a value on stdin, validates it with the same rules as
  `set-env-var.mjs`, creates or updates the field in the given vault item. Prints field name and
  status.
- New `scripts/vault-sync.mjs` (name is the builder's): regenerates `.env` (real values) or
  `.env.prod` (references) from the vault.
- `scripts/set-env-var.mjs`: writes to the vault, then regenerates the target file. Its validation
  rules stay; `vault-put.mjs` reuses them.
- `scripts/init-env.mjs`: generated secrets go to the vault for both environments.
- `scripts/push-env-to-vercel.mjs`: resolves `op://` references before pushing (it reads the file
  itself today, so it would otherwise push the literal reference). Refuses to push an unresolved
  `op://` value.
- New provider scripts, one per API: Dash0 (dataset + token), Resend (two keys), PostHog (two
  projects + tokens), Supabase (database password reset), each writing straight to the vault, each
  idempotent (reuse an existing resource named after the slug).
- Skill: new step 0; steps 3c, 4a, 4b, 4c, 4d, 4e, 4f, 6d, 6e, 6f, 6g, 6h rewritten to the channels
  above; `SKILL.md` prerequisites; `CLAUDE.md` infra list and env rules; README; `.env.template`
  comments.

## Open questions for the founder

None left.

## Left to the builder (verify before building)

1. **Touch ID frequency (spike first).** With the 1Password app integration, does each `op` call from
   Claude Code's Bash tool ask for Touch ID, or does one approval cover the session? If every call
   asks, batch vault access into few script runs, or evaluate a 1Password service account scoped
   to the startup vaults (check plan availability and where its token would live).
2. **API coverage.** Confirm the exact endpoints and scopes: Dash0 dataset and auth-token creation,
   Resend API key creation scoped to a domain, PostHog project creation with a personal key,
   Supabase database password reset, Vercel deploy-hook creation. Where one is missing, fall back
   to Chrome + clipboard; for the Supabase password, fall back to a documented exception.
3. **Google console flow.** Confirm the OAuth client dialog still has a Copy button and "Download
   JSON", and that `find` results on that dialog do not include the secret text.
4. **`atmn login` output.** Confirm which keys it writes and where, and how it picks the org, so
   the move to the vault is exact and the keys belong to the startup's own org.
5. **Stripe sign-in and multiple accounts.** Check which sign-in methods Stripe offers (Google was
   not checked on 2026-11-09) and that one Stripe login can create and switch between several
   accounts.
6. Item field types and how scripts find the slug's vault.
7. Whether `scripts/vault-put.mjs` and the provider scripts need tests (they are scripts, not
   `src/`; follow how `set-env-var.mjs` is tested today).

## Calls made by Claude, not by the founder

- One vault per startup plus a founder vault, named `startup-<slug>` and `startup-founder`.
- The vault is the source of truth; `.env` is regenerated with real local-only values, `.env.prod`
  with references.
- Separate local and production credentials for Google, PostHog and Resend; SMTP is a stated
  exception.
- Supabase project creation stays on the MCP for its cost approval; the password is reset by script.
- Clipboard as the channel for dashboards without API, with the "never read a secret page" rule.
- macOS only for now.
