# Step 0 — Founder setup (once per machine, idempotent)

Everything the founder needs before the first startup: tools, a 1Password service account, provider
accounts, CLI logins, and the master keys that let later steps create per-startup keys without
asking. Run it once; on every later run each item is only a check that passes.

**Each item is "check, then act only if the check fails".** Run the check, report the result, and do
nothing else when it passes. Never redo an item that already passes.

## Hard rules for this step

- You never create an account, type a password, or solve a CAPTCHA. The founder does those.
- Before creating a key in a dashboard, ask the founder's go-ahead. Same before any OAuth consent.
- On a page that shows a secret (an API key, a token, an app password), use narrow `find` queries
  only (for example "Copy button", "Create API key"). Never `get_page_text`, `read_page` or
  `screenshot` there: the secret would enter your context.
- A secret moves from its source to 1Password through the clipboard or a pipe, never through text
  you read, and never in a command-line argument.
- The service account token never passes through you. You hand the founder a command; the token goes
  from `op` straight into the macOS Keychain.
- The founder uses one Google identity for every provider below. Use that one account everywhere.

## 1. Tools

Check each tool; install only what is missing, and ask the founder before each install.

| Check | If it fails, ask, then run | Success |
| --- | --- | --- |
| `command -v op` | `brew install --cask 1password-cli` | prints a path |
| `command -v vercel`, then `vercel deploy-hooks --help` | `pnpm add -g vercel@latest` | prints a path, and the help text appears (an older CLI does not know `deploy-hooks`: update it) |
| `command -v supabase` | `brew install supabase/tap/supabase` | prints a path |

Also confirm `gh` and `gcloud` exist (`command -v gh`, `command -v gcloud`); item 5 uses them. If one
is missing, tell the founder which, and ask before installing it with Homebrew.

## 2. Service account (how scripts reach 1Password)

1Password is paid (no free tier); a personal account works. Scripts reach it through a service
account named `startup-factory`, whose token lives in the macOS Keychain (service
`startup-factory-op`). The 1Password desktop-app integration refuses every process the Claude app
launches, so it cannot be used from here.

**Check:**

```bash
node scripts/vault-put.mjs --check
```

Success prints `startup-founder: existing` (`startup-founder: created` the first time: the command
creates the founder vault when it is missing, and writes no field). Item 2 is done.

**If it reports a missing or rejected token** (`no 1Password service account token in the Keychain`
or `1Password rejected the service account token`), the founder creates it once:

1. The founder opens **macOS Terminal.app** themselves (Spotlight, then "Terminal"). Not a Claude
   terminal tab: processes launched by the Claude app cannot use the desktop-app integration.
2. In Terminal.app the founder checks that `op vault list` works (the 1Password app may ask
   to approve; an empty
   list is fine). If `op` asks for a sign-in address instead, the founder presses Ctrl-C, opens the
   1Password app, Settings, Developer, and ticks "Integrate with 1Password CLI" again (adding a
   second account to the app can switch it off), then retries.
3. The founder runs this single line. Give it exactly, and do not ask them to paste its output
   anywhere:

   ```bash
   { printf 'add-generic-password -U -a %s -s startup-factory-op -w ' "$USER"; op service-account create startup-factory --can-create-vaults --raw; } | security -i
   ```

   The token is piped from `op` into the Keychain and never shown.
4. Back here, re-run `node scripts/vault-put.mjs --check`. It must print `startup-founder: …`.

Tell the founder plainly:

- The service account must belong to the founder's **own** 1Password account (a personal account
  works). A Business account of another company may refuse it with `(402)`.
- It can never see the founder's built-in vaults (Personal, Private); it only sees the vaults it
  creates (`startup-founder`, and one `startup-<slug>` per startup).
- A personal account allows 100 writes and 1,000 reads per hour, and 1,000 requests per day. A
  startup run stays well under that. On `rate limit reached`, wait an hour and re-run.

From now on, a raw `op` command you need goes through `node scripts/with-vault.mjs <command…>`, which
supplies the token to the child process. The vault scripts read the token themselves.

## 3. Identity

The founder's Google account is the identity for every provider. Check that Chrome (the Claude in
Chrome extension) is signed in to it; if not, ask the founder to sign in.

## 4. Provider accounts

Accounts needed: **GitHub, Vercel, Supabase, PostHog, Autumn, Stripe, Resend, Dash0, Google Cloud**.
PostHog and Dash0 are in the founder's usual region (`EU` or `US`, see `data-region.md`); a startup
in the other region adds that region's accounts later.

**Check**, per provider: open its dashboard in Chrome and look at the page. A signed-in dashboard
(not a login page) passes. Use narrow `find` queries ("Sign in", "Continue with Google") to tell.

**If signed out:** open the sign-in page and ask the founder to click "Continue with Google" (GitHub
for Supabase) and finish any consent or CAPTCHA themselves. When they say it is done, reload the
dashboard and confirm the session. You never create the account or type credentials.

Stripe is only connected to Autumn later; here the account just has to exist.

## 5. CLI logins

| Check | If it fails | Success |
| --- | --- | --- |
| `gh auth status` | founder runs `gh auth login` | logged in to github.com |
| `vercel whoami` | founder runs `vercel login` | prints the username |
| `supabase projects list` | founder runs `supabase login` | prints a table (possibly empty) |
| `gcloud auth list` | founder runs `gcloud auth login` | an active account |

The login commands open a browser; the founder runs them (a Claude terminal tab is fine here: these
do not need the 1Password integration) and finishes the browser step. Re-run the check afterwards. No
Vercel token goes in the vault: later steps use the `vercel login` session.

## 6. Master keys (and SMTP)

The master keys live in `startup-founder/master-keys`, one field per key, field label = the name
below. Later steps use them to create per-startup keys through the provider APIs.

**Check** which fields exist, by name only (the command prints sorted labels, never values):

```bash
node scripts/vault-put.mjs --list-fields master-keys
```

It prints one field name per line, or `none` when the item does not exist yet (then every field is
missing). Compare with the table, keeping only the
rows for the founder's region `<R>` (`EU` or `US`).

| Field | Where (dashboard path) | Permission |
| --- | --- | --- |
| `RESEND_FULL_ACCESS_API_KEY` | Resend → API Keys → Create | Full access |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | (personal token) |
| `POSTHOG_PERSONAL_API_KEY_<R>` | PostHog (region account) → Settings → Personal API keys | `organization:read`, `project:read`, `project:write` |
| `DASH0_AUTH_TOKEN_<R>` | Dash0 (region org) → Settings → Auth Tokens | all actions, no dataset restriction (managing tokens requires it) |
| `DASH0_API_URL_<R>`, `DASH0_OTLP_ENDPOINT_<R>` | Dash0 → Organization Settings → Endpoints | not secret |

Another region's keys are added when the first startup in that region runs.

**For each missing field**, ask the founder's go-ahead ("I will create a <provider> key for
`<FIELD>` with <permission>, then store it in 1Password. OK?"). On a yes:

1. In Chrome, go to the dashboard path, create the key with the listed permission, and stop at the
   page that shows it. Use `find` queries only ("Create", "Copy").
2. Click the **Copy** button, so the key is on the clipboard. Do not read the page.
3. Store it from the clipboard. The script validates the value, clears the clipboard, and never
   prints the key:

   ```bash
   node scripts/vault-put.mjs --vault startup-founder --from-clipboard master-keys <FIELD>
   ```

   Success: `OK  <FIELD> stored in startup-founder/master-keys (<n> chars)`. An `ERROR` line means
   nothing was written (wrong or empty clipboard): go back to the page and copy again. If the
   provider showed the key only once and it is lost, delete that key in the dashboard (ask first)
   and create a new one.

The two Dash0 endpoints are not secret; copy each the same way, one command per field.

### SMTP (only when a startup will use SMTP)

SMTP is the no-domain email option. Claude cannot create a Gmail app password, so the founder does:

1. In their Google account (Security, 2-Step Verification on, then App passwords) the founder
   creates an app password and copies it themselves.
2. Immediately after, you run:

   ```bash
   node scripts/vault-put.mjs --vault startup-founder --from-clipboard master-keys SMTP_PASS
   printf %s '<gmail address>' | node scripts/vault-put.mjs --vault startup-founder master-keys SMTP_USER
   ```

   The address is not a secret, so you may take it from the founder in chat. The app password never
   passes through you.

Check for these two fields the same way as above. Skip this section when no startup uses SMTP.

## Done

Report a short checklist: tools, service account (`startup-founder: existing`), provider sessions,
CLI logins, master-key field names present, SMTP present or skipped. Then continue with step 1.
