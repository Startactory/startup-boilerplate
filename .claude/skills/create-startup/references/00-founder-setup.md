# Step 0 — Founder setup (once per machine, idempotent)

**Phase 1.** Everything the founder needs before the first startup: tools, a 1Password service
account, provider accounts, CLI logins, and the master keys that let later steps create
per-startup keys on their own. The founder-only checklist of `phase-1-setup.md` (section 3) runs
these checks and acts on a failing one only after the founder's consent (section 4). Phase 2 uses
only item 1 (install a missing tool), item 4 (sign in again with "Continue with Google"), item 5
(`vercel login` again) and item 6 (create a missing or wrong master key), under the consent in
the `/goal` line. The rest is the founder's, so in phase 2 a block: item 2 (the service account,
in Terminal.app), item 3 (a Chrome with no Google sign-in) and the SMTP part of item 6 (the Gmail
app password).

**Each item is "check, then act only if the check fails".** Run the check, and do nothing else when
it passes. Never redo an item that already passes.

## Hard rules for this step

- You never create an account, type a password, or solve a CAPTCHA. The founder does those.
- Creating a key in a dashboard and giving an OAuth consent are covered by the phase 1 consent
  (`phase-1-setup.md` section 4); do neither before the founder gave it.
- On a page that shows a secret (an API key, a token, an app password), use narrow `find` queries
  only (for example "Copy button", "Create API key"). Never `get_page_text`, `read_page` or
  `screenshot` there: the secret would enter your context.
- A secret moves from its source to 1Password through the clipboard or a pipe, never through text
  you read, and never in a command-line argument.
- The service account token never passes through you. You hand the founder a command; the token goes
  from `op` straight into the macOS Keychain.
- The founder uses one Google identity for every provider below: `googleAccount` in
  `startup.config.json`. Use that one account everywhere. Chrome can be signed in to several
  Google accounts, so every Google account page and Google Cloud console URL you open carries
  `authuser=<googleAccount>` (the address works as the value): it then opens on that account, not
  on Chrome's default one.

## 1. Tools

Check each tool and install only what is missing. The consent clause "install the missing tools"
covers each install.

| Check | If it fails, run | Success |
| --- | --- | --- |
| `command -v node` | `brew install node` (the repo pins its version in `.nvmrc`) | prints a path |
| `command -v pnpm` | `npm i -g pnpm` | prints a path |
| `command -v op` | `brew install --cask 1password-cli` | prints a path |
| `command -v gh` | `brew install gh` | prints a path |
| `command -v vercel`, then `vercel deploy-hooks --help` | `npm i -g vercel@latest` (`pnpm add -g` fails when the pnpm global bin is not in `PATH`) | prints a path, and the help text appears (an older CLI does not know `deploy-hooks`: update it) |

The run needs no `supabase` CLI: the scripts call the Supabase Management API.

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

The founder's Google account is the identity for every provider. Chrome (the Claude in Chrome
extension) can be signed in to several Google accounts, and its default one (`authuser=0`) is not
necessarily the founder's. The phase 1 interview lists them all: it opens
`https://myaccount.google.com/?authuser=0`, then `?authuser=1`, `?authuser=2` and so on, and notes
the address each one shows, until a sign-in page or an address already noted (the account chooser
of any Google page lists them too). With one account, that account is `googleAccount`; with
several, the interview asks the founder which one is theirs for the startup. When Chrome is signed
in to none, the founder signs in: the password and any 2FA code are theirs.

## 4. Provider accounts

Accounts the run needs: **Google (the Google Cloud console,
`https://console.cloud.google.com/?authuser=<googleAccount>`), GitHub, Vercel, Supabase, PostHog,
Autumn, Dash0**. PostHog and Dash0 are in the startup's region (`EU` or `US`, see
`data-region.md`); a startup in the other region adds that region's accounts. Stripe and Resend
are not needed for the run: Stripe comes with going live, Resend with a custom domain
(`after-the-run.md`).

**Check**, per provider: open its dashboard in Chrome and look at the page. A signed-in dashboard
(not a login page) passes. Use narrow `find` queries ("Sign in", "Continue with Google") to tell.

PostHog regions are separate accounts on separate hosts: open `https://eu.posthog.com` for `EU`
and `https://us.posthog.com` for `US`. When Chrome holds a session in the other region only,
PostHog redirects there (its login page first shows "Redirecting to your logged-in account" with
a 3-second countdown), and the page you land on is the other region's dashboard. So the check
passes only when the final URL is still on the region's host. To sign in to the region's
account, open its `/login` page and click "Cancel redirect" before the countdown ends.

**If signed out**, follow the sign-in rule of `phase-1-setup.md` (section 3, item 2): the founder
says once, for all the signed-out providers together, where they already have an account. For a
confirmed existing account, open its sign-in page, click "Continue with Google" (GitHub for
Supabase) and pick `googleAccount` on the account chooser. For any other provider the founder
clicks it and finishes the sign-up: creating an account is theirs. The founder also types any
password, 2FA code, phone code or CAPTCHA. Then reload the dashboard and confirm the session.

Check also which identity each dashboard is signed in to (the account menu, or the address or
organization the page shows) and compare it with `googleAccount`:

- A provider that needs a phone number the founder already used elsewhere (Vercel, for example)
  may be on another of the founder's accounts, which is fine once they confirm it.
- A provider that phase 2 uses only through its API with a master key (Supabase, PostHog, Dash0)
  may be signed in to another account in Chrome: the scripts never use that session. It matters
  only when item 6 must still create that provider's master key, because the key then belongs to
  the account Chrome shows.
- This check proves the Chrome session only. It never proves which account an existing master
  key belongs to; the preflight's `supabase-quota` and `dash0` checks call the APIs with the keys.

In phase 2, a login page means signing in again the same way ("Continue with Google", then
`googleAccount`); a password, 2FA or CAPTCHA prompt is a block (`phase-2-run.md`).

The phase 1 consent covers the providers' terms of service and CLI consent pages: tick the terms
box on a sign-up's legal-consent page (Dash0 shows one after Google sign-in) and click
"Authorize" / "Allow Access" on the CLI consent pages below. If the founder struck that clause,
they click them.

**Then set each account up**, once per founder:

- **Supabase:** an organization on the **Free** plan (`dashboard/new`: name `startup-factory`, plan
  "Free - $0/month"). Startups are projects in it; Free allows 2 active projects.
- **Dash0:** one organization per region, created in the region's data storage location
  (`data-region.md`) when the founder signs up. New Dash0 organizations start on a 14-day trial,
  then need a subscription; the phase 1 briefing says so.
- **PostHog:** nothing; each startup gets its own organization from `posthog-projects.mjs`.

## 5. CLI logins

| Check | If it fails | Success |
| --- | --- | --- |
| `gh auth status`, with the `workflow` scope when `gh config get git_protocol -h github.com` prints `https` (the github.com value, which `gh auth status` shows as `Git operations protocol`) | the founder runs `gh auth login --web -s workflow` (or `gh auth refresh -s workflow`) in a terminal | logged in to github.com |
| `vercel whoami` | `vercel login` in a Claude terminal tab | prints the username |

`vercel login` prints a device URL (`vercel.com/oauth/device?user_code=…`). Open it in Chrome, check
the signed-in account, and click "Allow Access" (covered by the phase 1 consent). Vercel may then
ask for the founder's 2FA code: the founder types it (in phase 2, that is a block). The device code
expires after a few minutes; if the command has exited, run it again. No Vercel token goes in the
vault: later steps use the `vercel login` session. Phase 1 does this login last, so the session is
still fresh when phase 2 starts.

There is no `supabase login`: the Supabase scripts read `SUPABASE_ACCESS_TOKEN` from the master
keys.

## 6. Master keys (and SMTP)

The master keys live in `startup-founder/master-keys`, one field per key, field label = the name
below. Later steps use them to create per-startup keys through the provider APIs.

**Check** which fields exist, by name only (the command prints sorted labels, never values):

```bash
node scripts/vault-put.mjs --list-fields master-keys
```

It prints one field name per line, or `none` when the item does not exist yet (then every field is
missing). Compare with the table, keeping only the
rows for the startup's region `<R>` (`EU` or `US`).

| Field | Where (dashboard path) | Permission |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens → Generate new token | expires Never, resource access "Organization" = `startup-factory`, preset "Full access" |
| `POSTHOG_PERSONAL_API_KEY_<R>` | PostHog (region account) → Settings → Personal API keys | expires Never, all access, scopes `organization:write` and `project:write` (each startup gets its own organization) |
| `DASH0_AUTH_TOKEN_<R>` | Dash0 (region org) → Settings → Auth Tokens | all actions, no dataset restriction (managing tokens requires it) |
| `DASH0_API_URL_<R>`, `DASH0_OTLP_ENDPOINT_<R>` | Dash0 → Organization Settings → Endpoints | not secret |
| `RESEND_FULL_ACCESS_API_KEY` (custom domain only, after the run) | Resend → API Keys → Create | Full access |

Another region's keys are added when the first startup in that region runs. The run needs no
Resend key: `after-the-run.md` creates it when the startup gets a custom domain.

**For each missing field** (the phase 1 consent covers creating these keys; the founder acts only
if a page asks for a password or a 2FA code):

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
   provider showed the key only once and it is lost, create a new key and store it. Never delete
   the lost one (deleting is the founder's); the end-of-run report lists it under "left for
   cleanup".

The two Dash0 endpoints are not secret; copy each the same way, one command per field.

### SMTP

SMTP is the no-domain email option, and every run uses it (a run has no domain). Claude cannot
create a Gmail app password, so the founder does. `<gmail address>` is the SMTP Gmail address
from the phase 1 interview (default `googleAccount`).

1. **2-Step Verification first.** Open
   `https://myaccount.google.com/security?authuser=<gmail address>` and check, with a narrow
   `find "2-Step Verification"` (not a secret page, but read nothing else), whether it is on.
   When it is off, App passwords only shows "The setting you are looking for is not available for
   your account". Send the founder first to
   `https://myaccount.google.com/signinoptions/twosv?authuser=<gmail address>`, and tell them that
   adding an authenticator app does not turn 2-Step Verification on: they must click "Turn on
   2-Step Verification". Check the security page again afterwards.
2. At `https://myaccount.google.com/apppasswords?authuser=<gmail address>` the founder creates an
   app password and copies it themselves.
3. Immediately after, you run:

   ```bash
   node scripts/vault-put.mjs --vault startup-founder --from-clipboard master-keys SMTP_PASS
   printf %s '<gmail address>' | node scripts/vault-put.mjs --vault startup-founder master-keys SMTP_USER
   ```

   The address is not a secret. The app password never passes through you.

Check for these two fields the same way as above.

## Done

Every check of this file passes: tools, service account (`startup-founder: existing`), provider
sessions, CLI logins, and the master-key field names (SMTP included). At the end of phase 1,
`node scripts/preflight.mjs` checks the tools (the Node major of `.nvmrc` included), the vault,
the master keys and the CLI sessions again.
