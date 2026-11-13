# Phase 1 — Setup with the founder (one sitting)

Everything the run needs from the founder happens here, in one sitting. Phase 2
(`phase-2-run.md`) then runs alone and asks nothing, so settle here anything phase 2 would need
from the founder.

Write every message to the founder in plain, full sentences, in their language, even when the
caveman plugin (`.claude/settings.json`) shortens the rest of the session.

Order of work:

1. Briefing (one message). It ends with the idea and name question when the founder's first
   message lacks them.
2. Interview (one message, one answer, once the idea and the name are known), then write the
   files.
3. Run every check of the founder-only checklist. Checks change nothing.
4. Consent (one message, one "yes").
5. Work through the failing checklist items, in order.
6. The `repository` and `vercel-project` steps, and the production host's permission.
7. Preflight until `PREFLIGHT OK`.
8. Print the `/goal` line and hand over.

Say nothing about an item whose check passes. For a returning founder (second startup), most
items pass and this phase is short.

## 1. Briefing

One message that tells the founder:

- **Time.** Roughly 30 to 60 minutes here the first time, a few minutes when the accounts and
  keys already exist. Then phase 2 runs alone, usually one to a few hours.
- **Accounts**, all reached with one Google identity (GitHub for Supabase): 1Password (paid; a
  personal account works), Google, GitHub, Vercel, Supabase, PostHog and Autumn on free plans, and
  Dash0 (no free tier: a 14-day trial, then billing per log record, span and metric data point).
  PostHog and Dash0 must be in the startup's data region (`data-region.md`). Stripe and Resend are
  not needed for the run.
- **The machine.** Postgres or Docker. During phase 2, keep the laptop awake, plugged in and
  online. Push notifications reach the desktop, and the phone when Remote Control is on.
- **Phase 2 runs in bypass permissions mode**, so no tool approval stops it. What still guards
  it: Claude acts only within the consent given here; it calls the founder only for a human-only
  action (an account, a password, a 2FA code, a CAPTCHA, a payment or card, a KYC, a consent not
  given here, a deletion, a secret to copy by hand); it never deletes a cloud resource; it uses
  free plans only (Dash0 excepted); and no secret reaches the transcript. If one does by accident,
  the run does not stop: Claude goes on with it, and the final report lists it with how to revoke
  it.
- **What stays for later** (`after-the-run.md`): the company, Stripe live and its KYC, a custom
  domain with Resend. Until go-live, production uses the Autumn sandbox: anyone can get past the
  paywall with a Stripe test card. The legal texts are templates to have reviewed before selling
  for real.

When the founder's first message lacks the idea or the name, the briefing ends with one question
for what is missing (both in the same question), and the interview message (section 2) waits for
that answer: the slug, the GitHub and Vercel name checks, the pricing and the landing copy all
derive from the idea and the name. When the first message has both, the briefing asks nothing and
the interview message follows it at once.

## 2. Interview

The idea and the name are known by now: from the founder's first message, or from their answer to
the briefing's question.

First gather what the machine can tell, with no question. Load the Chrome tools in one ToolSearch
call and read the `chrome-browser` skill, then list **every** Google account Chrome is signed in
to, not only the default one: open `https://myaccount.google.com/?authuser=0`, then
`?authuser=1`, `?authuser=2` and so on, and note the address each page shows (a narrow `find` on
it is enough); stop at the first index that shows a sign-in page or an address already noted. The
account chooser (the account menu of any Google page) lists them too. Chrome's default account
(`authuser=0`) is not necessarily the founder's identity for this run. The chosen account is the
founder's Google identity for the whole run (`googleAccount`). When `gh` is
signed in, run `gh api user -q .login` and `gh org list`. When the vault answers, run
`node scripts/vault-put.mjs --list-fields master-keys`. If `startup.config.json` already exists
(an interrupted phase 1), propose its values.

**Ask** only what Claude cannot infer:

- which Google account is the founder's identity (`googleAccount`), when Chrome is signed in to
  more than one: list the addresses found and propose none of them; when Chrome is signed in to
  none, the founder signs in first (`00-founder-setup.md` item 3);
- the founder's full name (legal notice) and contact email (default: the Google identity);
- the Gmail address for SMTP (default: the Google identity), only when `SMTP_USER` is not in the
  master keys;
- the GitHub owner, only when `gh org list` shows organizations or `gh` is not signed in yet
  (default: the personal account).

**Derive and show for review**, as the reference steps derive them:

- `slug` (`01-name-startup.md`): 3 to 26 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$` (the
  vault, Dash0 and GitHub rules), and `<owner>/<slug>` not already a GitHub repository
  (`gh repo view "<owner>/<slug>"`) unless `startup.config.json` `repository` already is
  `<owner>/<slug>` (this startup's own repository, from an interrupted phase 1). The Vercel name
  must be free too, or this startup's: when `vercel whoami` works,
  `node scripts/providers/vercel-project.mjs --check-name <slug> --repository <owner>/<slug>`
  prints `OK  Vercel name <slug> is free` or `OK  Vercel project <slug> is this startup's`
  (Git-linked to that repository, or never linked nor deployed), and otherwise
  `Vercel project <slug> already exists and belongs to something else — …`. When either name is
  taken by anything else, propose another slug.
- the data region: `eu` by default (`"gdpr": true`, `"dataRegion": "eu"`: the founders are
  established in France); `us` only if the founder says so (`01-name-startup.md` item 3).
- the site's default language, `defaultLocale` (`01-name-startup.md` item 4): `fr` by default;
  propose `en` when the founder chose `us` or writes to you in English. The founder's choice wins.
- the pricing: the proposal of `01b-set-pricing.md` sections 1 to 3 (amount, interval, trial,
  currency `EUR`, a one-sentence rationale).
- the brand and the landing copy: `01d-storefront.md` section 2 (lucide icon, accent color,
  headline and subheadline in French and English).
- the legal state: an individual founder, `legal.company` null.

Send all of it in **one message** and take **one answer**: the founder fills the asked items and
approves or changes the proposals. Apply what they changed and keep your proposals for the rest. A
follow-up question is allowed only for an asked item the answer leaves empty.

Then write, exactly as steps 1, 1b and 1d do:

- `startup.config.json`, shape below; `domain` is always `""` in a run, `pricing.source` is
  `founder` when the founder gave the price, `googleAccount` (required: the preflight's
  `config` check refuses a config without a valid email there) records the Google identity, and
  `defaultLocale` is `"fr"` or `"en"` (an optional key: a config without it means `fr`; write it
  anyway);
- `package.json` `name` = the slug;
- the `pro` plan of `autumn.config.ts` (`01b-set-pricing.md` section 5);
- `Storefront.hero.headline` and `Storefront.hero.subheadline` in `src/i18n/messages/en.json` and
  `src/i18n/messages/fr.json`.

```json
{
  "name": "Acme Analytics",
  "slug": "acme-analytics",
  "domain": "",
  "gdpr": true,
  "dataRegion": "eu",
  "defaultLocale": "fr",
  "idea": "Contract review assistant for freelance designers",
  "githubOwner": "ada-lovelace",
  "googleAccount": "ada@example.com",
  "pricing": {
    "source": "derived",
    "customer": "individual",
    "amount": 19,
    "interval": "month",
    "currency": "EUR",
    "trialDays": 14,
    "cardRequired": true,
    "rationale": "Freelancers pay about 30-60 per contract review today; 19 is well under the value.",
    "deferred": []
  },
  "brand": { "icon": "Receipt", "accent": "#2f6f5e" },
  "legal": {
    "termsVersion": "2026-11-12",
    "founderName": "Ada Lovelace",
    "contactEmail": "ada@example.com",
    "company": null
  }
}
```

Section 6 adds `repository` and `productionUrl`. Do not run the profile sync here (phase 2 does),
and do not commit yet (section 6 does).

## 3. Founder-only checklist

Each item is a check first; only a failing check becomes an action. Run every check now, and act
on the failing items only after the consent (section 4). Long-lived items come first and
short-lived sign-ins last, so they are still fresh when phase 2 starts.

Before item 1, the CLIs: `command -v` for `node`, `pnpm`, `op`, `gh` and `vercel`, and
`vercel deploy-hooks --help` must work. Install a missing one as `00-founder-setup.md` item 1 does.
The run needs neither the `supabase` CLI nor `gcloud`.

1. **1Password service account.** Check: `node scripts/vault-put.mjs --check` prints
   `startup-founder: existing` (or `created`). Action: the founder runs the Terminal.app procedure
   of `00-founder-setup.md` item 2.
2. **Provider accounts and Chrome sessions**: Google, GitHub, Vercel, Supabase, PostHog (the
   region's account), Autumn, Dash0. Check: open each dashboard (Google:
   `https://console.cloud.google.com/?authuser=<googleAccount>`); a dashboard, not a login page,
   passes (`00-founder-setup.md` item 4). Then read which identity each one is signed in to (a
   narrow `find` on the account menu, or the address or organization the page shows) and compare
   it with `googleAccount`. A different identity is fine for a provider that phase 2 uses only
   through its API with a master key (Supabase, also PostHog and Dash0), as long as that
   provider's master key already exists: item 3 would create a missing one in this Chrome
   session, so in that account. For a provider that phase 2 drives in Chrome (Google Cloud,
   Autumn, Vercel's device page), the founder confirms the account or signs in to the right one.
   This check proves the Chrome session only, never which account an existing master key belongs
   to: the preflight's `supabase-quota` and `dash0` checks prove that the keys reach the right
   organization. Action: ask the founder once, for all the signed-out providers together, at
   which of them they already have an account. For a confirmed existing account, open its sign-in
   page, click "Continue with Google" (GitHub for Supabase) and pick `googleAccount` on the
   account chooser. For any other provider the founder clicks it and
   finishes the sign-up: creating an account is theirs. The founder also types any password, 2FA
   code or CAPTCHA. Once per founder: a Supabase organization `startup-factory` on the Free plan,
   and a Dash0 organization in the region's data location, which the founder creates at sign-up
   (it starts the trial).
3. **Master keys.** Check: `node scripts/vault-put.mjs --list-fields master-keys` lists
   `SUPABASE_ACCESS_TOKEN`, `POSTHOG_PERSONAL_API_KEY_<R>`, `DASH0_AUTH_TOKEN_<R>`,
   `DASH0_API_URL_<R>` and `DASH0_OTLP_ENDPOINT_<R>` (`<R>` is `EU` or `US`). Action: create each
   missing one in Chrome and store it from the clipboard, as `00-founder-setup.md` item 6 does;
   the founder acts only if a page demands a password or a 2FA code. No Resend key: it serves a
   custom domain, after the run.
4. **Gmail app password.** Check: the same listing has `SMTP_USER` and `SMTP_PASS`. Action, for
   the SMTP Gmail address (`<gmail address>`, `googleAccount` by default): first check
   2-Step Verification on `https://myaccount.google.com/security?authuser=<gmail address>` with a
   narrow `find "2-Step Verification"` (it is not a secret page, but read nothing else). When it
   is off, App passwords only answers "The setting you are looking for is not available for your
   account", so send the founder first to
   `https://myaccount.google.com/signinoptions/twosv?authuser=<gmail address>`, and tell them that
   adding an authenticator app does not turn 2-Step Verification on: they must click "Turn on
   2-Step Verification". Then only the founder can create the app password, at
   `https://myaccount.google.com/apppasswords?authuser=<gmail address>`, and copy it; then store
   both fields as the SMTP part of `00-founder-setup.md` item 6 does. The app password never
   passes through you.
5. **A local database**, as step 3b will use it. Check, in this order: a Postgres answers
   (`pg_isready -h localhost -p 5432`); or Homebrew installed one (`brew services list | grep
   '^postgresql'` prints a formula), which 3b starts with `brew services start`; or Docker answers
   (`docker info`). When Docker Desktop is installed but not running (`command -v docker` finds
   it), open it now (`open -a Docker`) so the founder accepts any license or password prompt while
   present, then `docker info` must pass. Action, when none of these passes: install Docker Desktop
   (`brew install --cask docker`) and open it once; the founder accepts its license and types the
   macOS password if asked. Step 3b starts Postgres in it.
6. **GitHub CLI.** Check: `gh auth status` passes and, when
   `gh config get git_protocol -h github.com` prints `https`, shows the `workflow` scope. Read the
   github.com value (the one `gh auth status` shows as `Git operations protocol`): the global
   `gh config get git_protocol` can say `https` while pushes go over `ssh`. Action: the founder
   runs `gh auth login --web -s workflow` (or `gh auth refresh -s workflow`) in a terminal. If the
   interview could not check the owner or the slug, check them now; when the slug is taken by a
   repository that is not this startup's (same exception as in section 2), pick a free variant,
   update `startup.config.json` and `package.json`, and tell the founder.
7. **Vercel GitHub App** (`vercel-project.mjs` Git-connects the repo through it). Check: in Chrome,
   `https://github.com/settings/installations` (personal owner) or
   `https://github.com/organizations/<githubOwner>/settings/installations` (organization) lists
   Vercel. Claude only checks that Vercel is listed: its Configure page (which shows "All
   repositories" or the selected ones) asks for GitHub sudo mode (a password or GitHub Mobile),
   so Claude never opens it. Repository access is proven when `vercel-project.mjs` runs (section
   6): `vercel git connect failed: …` then means the founder adds the repository to the app.
   Action: the founder installs it for `githubOwner` from `https://github.com/apps/vercel`, for
   all repositories (or adds the new repository to its selection right after the `repository`
   step); for an organization, an organization owner must approve it.
8. **Site and app permissions.** Open once in Chrome every site phase 2 drives:
   `https://console.cloud.google.com/?authuser=<googleAccount>`, `accounts.google.com`, the
   Supabase, PostHog, Autumn, Dash0 and Vercel dashboards, and `checkout.stripe.com`. The founder
   picks "always allow" for each; the production host and `http://localhost:3000` follow in
   section 6. Then call `request_access` for the native apps phase 2 may drive (Docker Desktop).
   Never change your own permission settings.
9. **Vercel CLI.** Check: `vercel whoami` prints the username. Action: `vercel login` as
   `00-founder-setup.md` item 5 describes (you click "Allow Access"; the founder types a 2FA code
   if asked). It is the last sign-in because its device code expires in minutes and its session
   must still be valid in phase 2. If the interview could not check the Vercel name (the CLI was
   signed out), run its `--check-name` now; when the name is taken, pick with the founder a
   variant free on both GitHub and Vercel, update `startup.config.json` and `package.json`, and
   tell the founder.
10. **Bypass permissions mode**: section 9, right after the `/goal` line.

## 4. Consent

One message lists everything Claude will do alone, in this phase and in phase 2, and the founder
answers once:

- install the missing tools;
- accept the providers' terms of service and CLI consent pages (the founder chose this stack);
- give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and
  Dash0;
- download the two Google `client_secret_*.json` files, which go straight into the vault;
- enter the founder's email (`googleAccount`) as the Google Auth Platform support and contact
  email;
- publish the startup's Google OAuth app (from "Testing" to "In production"), so anyone can sign
  in to the live site;
- create the cloud projects for this startup, on free plans only, with one exception: the Dash0
  dataset (Dash0 has no free tier: a 14-day trial, then billing per record);
- change the Autumn organization's default currency to `pricing.currency` when it differs;
- create the Vercel Git connection and the Vercel deploy hook;
- set the GitHub Actions secrets and the branch protection of `master`;
- create the private GitHub repo, push to `master`, merge its own PRs, deploy;
- during the local browser check and the smoke test, sign in to the app with the founder's Google
  account, create the founder's organization and accept the startup's own terms on the founder's
  behalf.

The same message states three facts the founder accepts with it: email goes through their Gmail
(the app password is copied into this startup's local `.env` and its production settings; Gmail
caps at about 500 emails a day); until go-live any visitor can get past the paywall with a Stripe
test card; and a secret that reaches the transcript or printed output by accident does not stop
the run: Claude goes on with it, revokes nothing, and the end-of-run report lists it with how to
revoke it.

Never write the consent to a file: it travels in the `/goal` line. If the founder strikes a
clause, leave it out of the line; phase 2 then blocks where it needs it and offers the line with
that clause added, which the founder pastes to consent.

## 5. Act on the failing items

Work through the failing checklist items in order, items 1 to 9. Re-run each check after its
action; it must pass before the next item.

## 6. Repository and Vercel project

These two phase 2 steps run here, with the founder present: the Vercel Git connection is easier to
fix in person, and the production URL is then known, so the founder can allow its exact host.
Keep their ledger ids. Run `pnpm install` first when `node_modules` is missing: the commit hooks
and the preflight need it. Run every `node` and `pnpm` command with the `.nvmrc` version on `PATH`
(`03-install-and-secrets.md` 3a item 1).

1. **`repository`** (`01c-create-repository.md`): the private repo `<githubOwner>/<slug>`, the
   boilerplate kept as a fetch-only `upstream`, `repository` written to `startup.config.json`, and
   one commit on `master` of what section 2 wrote (`startup.config.json`, `package.json`,
   `autumn.config.ts`, the two messages files). Set `origin` without pushing
   (`gh repo create … --private --source=. --remote=origin`, no `--push`): the first push of
   `master` is phase 2's `deploy`. Done when `gh repo view "<githubOwner>/<slug>"` answers and
   `git remote -v` shows `origin` on it. Then `node scripts/run-ledger.mjs done repository`.
2. **`vercel-project`** (`06-deploy-production.md` 6b): when the founder said the Vercel GitHub
   App is limited to selected repositories (item 7), they first add `<githubOwner>/<slug>` to it.
   Then `node scripts/providers/vercel-project.mjs`. On `vercel git connect failed: …`, the app
   cannot see the repository: the founder adds it to the app's repository access (the
   installations page of item 7, Vercel, Configure; its GitHub sudo mode prompt is theirs), then
   run the script again.
   It creates the Vercel project `<slug>`, or reuses it only when it is this startup's, links and
   Git-connects it, gives it its free domain, and writes `productionUrl` into
   `startup.config.json` and `"framework": "nextjs"` and `"regions"` into `vercel.json`. Success:
   `OK  Vercel project <slug> <created|reused>, production URL <url>`. Commit both files on
   `master`, then `node scripts/run-ledger.mjs done vercel-project`. On
   `Vercel project <slug> already exists and belongs to something else — pick another slug
   (founder decision)`, settle another slug with the founder (free on GitHub and Vercel), rename
   the repository to it (`gh repo rename <new slug> --repo <repository> --yes`), point `origin`
   at the renamed repository (`git remote set-url origin …`), update `slug` and `repository` in
   `startup.config.json` and `name` in `package.json`, commit, and run this step again.
3. Open `productionUrl` and `http://localhost:3000` once in Chrome; the founder picks "always
   allow" for each exact host.

## 7. Preflight

```bash
node scripts/preflight.mjs
```

It prints `OK  <name>` or `MISSING  <name>: <fix>` per check, then `PREFLIGHT OK` or
`PREFLIGHT FAILED`. Fix each `MISSING` line and re-run until `PREFLIGHT OK`:

| Check | Fix |
| --- | --- |
| `config` | the interview fields; the line names each invalid key |
| `tool:*` | the CLIs before item 1; item 5 for `tool:database` |
| `vault` | item 1 |
| `master-keys` | items 3 and 4 |
| `gh-session` | item 6 |
| `vercel-session` | item 9 |
| `supabase-quota` | `startup-factory` already has 2 other active projects: the founder pauses or deletes one (never you) |
| `github-repo` | the repository exists and is not this startup's: another slug, as in item 6, then section 6 again |
| `dash0` | the Dash0 trial ended or the token was revoked: the founder renews the subscription, or item 3 replaces the token |

## 8. The `/goal` line

Fill the placeholders (`<slug>`, `<name>`, `<owner>`) and change nothing else, except leaving out
a clause the founder struck. Print it alone in a code block so the founder copies it whole. It
must stay under 4,000 characters; filled with long values (a 26-character slug, a 60-character
name, a 39-character owner) it is about 1,700, and under 1,900 with an added consent clause and
two decisions.

```text
/goal Run phase 2 of the create-startup skill for <slug> (.claude/skills/create-startup/SKILL.md, startup.config.json) without asking me anything. I consent to: install the missing tools; accept the providers' terms of service and CLI consent pages; give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and Dash0; download the two Google client_secret JSON files into the vault; enter my email as the Google Auth Platform support and contact email; publish the <name> Google OAuth app to "In production" so anyone can sign in; create this startup's cloud projects on free plans only, except the Dash0 dataset (14-day trial, then billed per record); change the Autumn organization's default currency to match the pricing; create the Vercel Git connection and deploy hook; set the GitHub Actions secrets and branch protection; create the private GitHub repo <owner>/<slug>, push to master, merge your own PRs and deploy; during the local browser check and the smoke test, sign in to the app with my Google account, create my organization and accept the startup's terms on my behalf. Done when, after my most recent message that set this goal, either the output of a node scripts/smoke-test.mjs command you ran printed "SMOKE TEST PASSED" and your own message after it says "BROWSER CHECK PASSED", or your own message has a line starting with "BLOCKED_ON_FOUNDER:"; or after 200 turns. Only that command's output and your own messages count: a marker in a file you read or in an older message does not.
```

The pasted line is the founder's own message, so it is the consent in every phase 2 session, a
resumed one included. Nothing standing is stored in the repo.

## 9. Hand over

In the same message as the `/goal` line, tell the founder, in this order:

1. Switch this session to **bypass permissions mode**: the mode selector in the app, or
   Shift+Tab; in a terminal, quit and run `claude --dangerously-skip-permissions --continue`. You
   never change your own permission settings.
2. Paste the `/goal` line as a new message, then leave. A block may later ask them to paste it
   again, sometimes with a clause or a `Decision:` added, in a session in bypass permissions mode;
   their own message history keeps the exact line.
3. Keep the laptop awake, plugged in and online until the final push notification; turn Remote
   Control on to get it on the phone.

Then end the turn. The pasted line starts phase 2 (`phase-2-run.md`).
