# Phase 1 — Setup, with the founder nearby

The founder starts the whole run with one message: the start line (section 8), pasted in a
session that is already in bypass permissions mode. That line carries the name, the idea, the
data region answer and the founder's consent. Phase 1 asks **nothing** when the line is complete
and every founder-only check passes: it derives every other answer, shows it, and goes on. It
stops at most **once**, with one question that gathers everything only a human can give
(section 3); a second, early question comes only when the line leaves out the name, the idea,
the EU answer or a needed Google account (section 2). Then it runs the `repository` and `vercel-project` steps and the preflight, tells
the founder they can leave, and phase 2 (`phase-2-run.md`) follows in the same turn.

Write every message to the founder in plain, full sentences, in their language, even when the
caveman plugin (`.claude/settings.json`) shortens the rest of the session.

Before the briefing, `node scripts/check-working-copy.mjs` must print `OK` (`SKILL.md`, "Where
to start"). On `STOP`, tell the founder in one message, clone the boilerplate into a new folder
with the command the line names, move the session there, and start this phase again.

Order of work:

1. Briefing (one message, no question).
2. Gather what the machine can tell, derive every answer, write the files and show the answers
   (one message, no question).
3. Run every check of the founder-only checklist. Checks change nothing. Then the one question,
   only when a check found something only the founder can do.
4. The consent is the start line's (no message).
5. Work through the failing checklist items, in order.
6. The `repository` and `vercel-project` steps, and the production host's permission.
7. Preflight until `PREFLIGHT OK`.
8. Tell the founder they can leave, and start phase 2.

On a resume (the founder pasted the start line again after a block), run
`node scripts/run-ledger.mjs status` first: on a `blocked` line, check the block and clear it as
`phase-2-run.md` Start step 2 says, then go on here.

Say nothing about an item whose check passes. For a returning founder (second startup), most
items pass and this phase takes a few minutes.

**The founder's consent** is the "I consent to" and "I accept that" lists of the start line
(section 8), in the founder's own pasted message. Phase 1 acts within it exactly as phase 2 does.
When the founder struck a clause, a step that needs it is a consent block (`phase-2-run.md`,
Block protocol). Never write the consent to a file.

**The one question** (and the early question) uses `AskUserQuestion`, never a turn that ends on a question: the `/goal`
evaluator runs when a turn ends and would start the next turn without the answer. Send a push
notification (`PushNotification`, under 200 characters) right before it, since the founder may
have stepped away. When the answer is "not now", or an action the founder said they did still
fails its check, use the Block protocol of `phase-2-run.md`; the founder's paste of the start
line resumes the run.

## 1. Briefing

One message, sent at once and without a question, that tells the founder:

- **Time.** Stay near the computer for this first part, about 10 to 20 minutes (more the first
  time, when accounts must be created): Chrome may ask to allow sites, and a sign-in may need a
  password or a 2FA code. A message will say when the founder can leave. Then phase 2 runs alone,
  usually 30 to 60 minutes.
- **Accounts**, all reached with one Google identity (GitHub for Supabase): 1Password (paid; a
  personal account works), Google, GitHub, Vercel, Supabase, PostHog and Autumn on free plans, and
  Dash0 (no free tier: a 14-day trial, then billing per log record, span and metric data point).
  PostHog and Dash0 must be in the startup's data region (`data-region.md`). Stripe and Resend are
  not needed for the run.
- **The machine.** Postgres or Docker. During phase 2, keep the laptop awake, plugged in and
  online. Push notifications reach the desktop, and the phone when Remote Control is on.
- **The run is in bypass permissions mode**, so no tool approval stops it. What still guards
  it: Claude acts only within the consent of the start line; it calls the founder only for a human-only
  action (an account, a password, a 2FA code, a CAPTCHA, a payment or card, a KYC, a consent not
  given in that line, a deletion, a secret to copy by hand); it never deletes a cloud resource; it uses
  free plans only (Dash0 excepted); and no secret reaches the transcript. If one does by accident,
  the run does not stop: Claude goes on with it, and the final report lists it with how to revoke
  it.
- **What stays for later** (`after-the-run.md`): the company, Stripe live and its KYC, a custom
  domain with Resend. Until go-live, production uses the Autumn sandbox: anyone can get past the
  paywall with a Stripe test card. The legal texts are templates to have reviewed before selling
  for real.

## 2. Answers, derived

The start line gives the name, the idea and the EU answer (company or users in the EU), and may
give the Google account and free-form notes (a price, a GitHub organization, a language). The
founder's notes win over every default below.

**The early question**, only when the line leaves something out that everything else derives
from: the name, the idea or the EU answer is missing (a placeholder left as is), or Chrome holds
several Google accounts and the line names none. Ask all of them in one `AskUserQuestion` call
as soon as the Google accounts are listed (below), before deriving anything: the Google
accounts found are the options of that question, none of them proposed. It is the only case
where phase 1 can ask twice.

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
(an interrupted run), keep its values and derive nothing again.

**Take from the line or the machine**, never as a question when one of these gives it:

- `googleAccount`: the start line's Google account; else the only account Chrome is signed in
  to; else the early question's answer. When Chrome holds none, signing in comes first: it is
  the early question, as a founder action (`00-founder-setup.md` item 3);
- the founder's full name (legal notice): the name the `googleAccount` page of
  `myaccount.google.com` shows (a narrow `find` on it); the contact email: `googleAccount`;
- the Gmail address for SMTP: `googleAccount`;
- the GitHub owner: the personal account (`gh api user -q .login`), or the organization the
  founder's notes name. When `gh` is not signed in yet, signing in is a founder action of the one
  question (item 6), and the owner is read after it.

**Derive**, as the reference steps derive them:

- `slug` (`01-name-startup.md`): 3 to 26 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$` (the
  vault, Dash0 and GitHub rules), and `<owner>/<slug>` not already a GitHub repository
  (`gh repo view "<owner>/<slug>"`) unless `startup.config.json` `repository` already is
  `<owner>/<slug>` (this startup's own repository, from an interrupted phase 1). The Vercel name
  must be free too, or this startup's: when `vercel whoami` works,
  `node scripts/providers/vercel-project.mjs --check-name <slug> --repository <owner>/<slug>`
  prints `OK  Vercel name <slug> is free` or `OK  Vercel project <slug> is this startup's`
  (Git-linked to that repository, or never linked nor deployed), and otherwise
  `Vercel project <slug> already exists and belongs to something else — …`. When either name is
  taken by anything else, pick a variant free on both.
- the data region (`01-name-startup.md` item 3): the start line's EU answer. `yes` gives `"gdpr":
  true`, `"dataRegion": "eu"`; `no` gives `"gdpr": false`, `"dataRegion": "us"`. Then check that
  the region is ready: its PostHog and Dash0 master keys exist, or the founder has the region's
  PostHog account and Dash0 organization (checklist items 2 and 3). When it is not ready, the
  missing accounts are founder actions of the one question (section 3).
- the site's default language, `defaultLocale` (`01-name-startup.md` item 4): `fr` by default;
  `en` when the region is `us`, or when the founder wrote the idea and the notes in English (the
  start line's own wording is always English and says nothing). The founder's notes win.
- the pricing: the proposal of `01b-set-pricing.md` sections 1 to 3 (amount, interval, trial,
  currency `EUR`, a one-sentence rationale).
- the brand and the landing copy: `01d-storefront.md` section 2 (lucide icon, accent color,
  headline and subheadline in French and English).
- the legal state: an individual founder, `legal.company` null.

None of these is a question: the founder sees them in the message that ends this section.

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

Then show the answers in one message, with no question and without waiting: the slug, the
region, the default language, the price with its rationale, the icon and accent color, the
landing copy in both languages, the legal name and contact email, the GitHub owner, and the
Google identity. Say that the run goes on with them; that the price can change after the run
(`after-the-run.md`) and the brand and the copy whenever the founder asks; and that a change of
name or region must reach you within the next few minutes. A message the founder sends now
reaches the running turn: apply its change before the `repository` step, rewrite the files, and
go on. After that step, the slug and the region are fixed for this clone.

## 3. Founder-only checklist

Each item is a check first; only a failing check becomes an action. Run every check now, before
any action. Long-lived items come first and short-lived sign-ins last, so they are still fresh
when phase 2 starts.

**The one question.** Collect every action only the founder can take from all the failing
checks (an account to create, the service account procedure, a password or 2FA code, the Gmail
app password, `gh auth login`, the Vercel GitHub App, the Docker license, and the region's
missing PostHog account or Dash0 organization), and ask them all in one `AskUserQuestion` call:
one numbered list of exact steps (what, where, which account), with the options "Done" and "Not
now". The one other question that can come with the same call:

- the region, only when it is not ready (section 2) and the other region's master keys exist:
  the options "Create the missing accounts" (in the list) and "Use the other region instead"
  (say that the French-law legal pages stay, and that the data then sits in that region). On
  "Use the other region instead", rewrite `gdpr`, `dataRegion` and `defaultLocale` as section 2
  derives them for that region.

On "Done", run each item's check again; on "Not now", or a check that still fails, use the Block
protocol (`phase-2-run.md`). When no check found a founder action, there is no question. Items
Claude can act on alone (a missing CLI, a master key to create, the Chrome sessions to reopen
with "Continue with Google") are never in it: section 5 does them.

Before item 1, the CLIs: `command -v` for `node`, `pnpm`, `op`, `gh` and `vercel`, and
`vercel deploy-hooks --help` must work. Install a missing one as `00-founder-setup.md` item 1 does.
The run needs neither the `supabase` CLI nor `gcloud`.

1. **1Password service account.** Check: `node scripts/vault-put.mjs --check` prints
   `startup-founder: existing` (or `created`). Action: the founder runs the Terminal.app procedure
   of `00-founder-setup.md` item 2.
2. **Provider accounts and Chrome sessions**: Google, GitHub, Vercel, Supabase, PostHog (the
   region's account), Autumn, Dash0. Check: open each dashboard (Google:
   `https://console.cloud.google.com/?authuser=<googleAccount>`; PostHog: the region's host,
   `https://eu.posthog.com` or `https://us.posthog.com`, and only a page that stays on that host
   passes); a dashboard, not a login page, passes (`00-founder-setup.md` item 4). Then read
   which identity each one is signed in to (a narrow `find` on the account menu, or the address
   or organization the page shows) and compare it with `googleAccount`. A different identity is
   fine for a provider that phase 2 uses only through its API with a master key (Supabase, also
   PostHog and Dash0), as long as that provider's master key already exists: item 3 would create
   a missing one in this Chrome session, so in that account. For a provider that phase 2 drives
   in Chrome (Google Cloud, Autumn, Vercel's device page), a different identity is not a
   question: sign out of it there and sign in again with "Continue with Google" and
   `googleAccount`, as the action below does.
   This check proves the Chrome session only, never which account an existing master key belongs
   to: the preflight's `supabase-quota` and `dash0` checks prove that the keys reach the right
   organization. Action, before the one question: for each signed-out provider, open its sign-in
   page, click "Continue with Google" (GitHub for Supabase) and pick `googleAccount` on the
   account chooser. When that lands on a dashboard, the item passes with no question. When it
   lands on a sign-up form or a "no account" page, creating the account is the founder's: it goes
   into the one question, as the provider's sign-up page to finish. The founder also types any password, 2FA
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
   runs `gh auth login --web -s workflow` (or `gh auth refresh -s workflow`) in a terminal. If
   section 2 could not check the owner or the slug, check them now; when the slug is taken by a
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
   section 6. Call `request_access` for Docker Desktop only when item 5 settled on Docker (neither
   `pg_isready` nor a Homebrew Postgres passed): it is the one native app phase 2 may then drive
   (`03-install-and-secrets.md` 3b). When item 5 found a local Postgres, skip it, so the founder is
   not asked for a grant the run never uses. Never change your own permission settings.
9. **Vercel CLI.** Check: `vercel whoami` prints the username. Action: `vercel login` as
   `00-founder-setup.md` item 5 describes (you click "Allow Access"; the founder types a 2FA code
   if asked). It is the last sign-in because its device code expires in minutes and its session
   must still be valid in phase 2. If section 2 could not check the Vercel name (the CLI was
   signed out), run its `--check-name` now; when the name is taken, pick a variant free on both
   GitHub and Vercel, update `startup.config.json` and `package.json`, and tell the founder.
10. **Bypass permissions mode.** The session must already be in it: the founder chose it before
   pasting the start line (`SKILL.md`, "Where to start"). A tool approval prompt in this phase
   means it is not; then tell the founder to switch to it (the mode selector, or Shift+Tab) and
   go on once they did. Never change your own permission settings.

## 4. Consent

There is no consent message. The founder's pasted start line (section 8) holds the consent: what
Claude does alone, in this phase and in phase 2, and three facts the founder accepts with it.
Its clauses, in the order the line lists them:

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
- set the GitHub Actions secrets, the `PRODUCTION_URL` variable and the branch protection of
  `master`;
- create the private GitHub repo, push to `master`, merge its own PRs, deploy;
- during the local browser check and the smoke test, sign in to the app with the founder's Google
  account, create the founder's organization and accept the startup's own terms on the founder's
  behalf.

The three facts the line's "I accept that" list states: email goes through their Gmail (the app
password is copied into this startup's local `.env` and its production settings; Gmail caps at
about 500 emails a day); until go-live any visitor can get past the paywall with a Stripe test
card; and a secret that reaches the transcript or printed output by accident does not stop the
run: Claude goes on with it, revokes nothing, and the end-of-run report lists it with how to
revoke it.

Never write the consent to a file: it travels in the start line. A founder who struck a clause
from the line before pasting it gets a consent block where the run needs that clause; the block
offers the line with the clause added, which the founder pastes to consent.

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
   boilerplate kept as a fetch-only `upstream`, `repository` written to `startup.config.json`,
   one commit on `master` of what section 2 wrote (`startup.config.json`, `package.json`,
   `autumn.config.ts`, the two messages files), and the `ours` merge driver
   (`git config merge.ours.driver true`, 01c 4.4). Set `origin` without pushing
   (`gh repo create … --private --source=. --remote=origin`, no `--push`): the first push of
   `master` is phase 2's `deploy`. Done when `gh repo view "<githubOwner>/<slug>"` answers,
   `git remote -v` shows `origin` on it and `git config merge.ours.driver` prints `true`. Then
   `node scripts/run-ledger.mjs done repository`.
2. **`vercel-project`** (`06-deploy-production.md` 6b): when the founder said the Vercel GitHub
   App is limited to selected repositories (item 7), they first add `<githubOwner>/<slug>` to it.
   Then `node scripts/providers/vercel-project.mjs`. On `vercel git connect failed: …`, the app
   cannot see the repository: the founder adds it to the app's repository access (the
   installations page of item 7, Vercel, Configure; its GitHub sudo mode prompt is theirs), then
   run the script again.
   It creates the Vercel project `<slug>`, or reuses it only when it is this startup's, links and
   Git-connects it, removes the `.env.local` that `vercel link` writes
   (`OK  removed .env.local written by vercel link`), gives it its free domain, writes
   `productionUrl` into `startup.config.json`, and sets the project's framework and function
   region through the Vercel API. It never writes `vercel.json`: the committed file is the same
   for every startup. Success ends with
   `OK  Vercel project <slug> <created|reused>, production URL <url>`, then
   `OK  Vercel framework nextjs, function region <cdg1|iad1>`. Commit only
   `startup.config.json` on `master`, then `node scripts/run-ledger.mjs done vercel-project`. On
   `Vercel project <slug> already exists and belongs to something else — pick another slug
   (founder decision)`, pick a variant free on GitHub and Vercel (`<slug>-app`, then
   `<slug>-<2 digits>`) and tell the founder in one line, without asking; then rename
   the repository to it (`gh repo rename <new slug> --repo <repository> --yes`), point `origin`
   at the renamed repository (`git remote set-url origin …`), update `slug` and `repository` in
   `startup.config.json` and `name` in `package.json`, commit, and run this step again.
3. Open `productionUrl` and `http://localhost:3000` once in Chrome; the founder picks "always
   allow" for each exact host. These two prompts are the reason the founder stays until
   section 9.

## 7. Preflight

```bash
export PATH="$HOME/.nvm/versions/node/$(cat .nvmrc)/bin:$PATH" && node scripts/preflight.mjs
```

It prints `OK  <name>` or `MISSING  <name>: <fix>` per check, then `PREFLIGHT OK` or
`PREFLIGHT FAILED`. Fix each `MISSING` line and re-run until `PREFLIGHT OK`:

| Check | Fix |
| --- | --- |
| `node-version` | the Node major on `PATH` does not match `.nvmrc`: prefix every command with the line it prints, `export PATH="$HOME/.nvm/versions/node/v<nvmrc>/bin:$PATH"`, where `<nvmrc>` is the `.nvmrc` version number (for example `25.2.1`); it is the same directory as `$(cat .nvmrc)` in `03-install-and-secrets.md` 3a item 1. When that directory is missing, install the version once with `source "$HOME/.nvm/nvm.sh" && nvm install` |
| `dependencies` | `pnpm install` (section 6 runs it first) |
| `config` | the section 2 fields; the line names each invalid key |
| `tool:*` | the CLIs before item 1; item 5 for `tool:database` |
| `vault` | item 1 |
| `master-keys` | items 3 and 4 |
| `gh-session` | item 6 |
| `vercel-session` | item 9 |
| `supabase-quota` | `startup-factory` already has 2 other active projects: the founder pauses or deletes one (never you) |
| `github-repo` | the repository exists and is not this startup's: another slug, as in item 6, then section 6 again |
| `dash0` | the Dash0 trial ended or the token was revoked: the founder renews the subscription, or item 3 replaces the token |

## 8. The start line

The founder starts the run by pasting this line, filled in, as the first message of a session in
bypass permissions mode. `README.md` shows the same line to founders; keep the two copies
identical. The founder fills `<name>`, `<idea>` and `<yes or no>`, and may fill or delete the
`Google account` and `Notes` sentences. They may also strike a consent clause (section 4).

```text
/goal Create my startup with the create-startup skill (.claude/skills/create-startup/SKILL.md), from setup to a live production deployment, asking me only for what a human must do. Name: <name>. Idea: <one or two sentences>. Company or users in the EU: <yes or no>. Google account: <the address I use for every provider>. Notes: <anything else, such as a price or a GitHub organization>. I consent to: install the missing tools; accept the providers' terms of service and CLI consent pages; give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and Dash0; download the two Google client_secret JSON files into the vault; enter my email as the Google Auth Platform support and contact email; publish the startup's Google OAuth app to "In production" so anyone can sign in; create this startup's cloud projects on free plans only, except the Dash0 dataset (14-day trial, then billed per record); change the Autumn organization's default currency to match the pricing; create the Vercel Git connection and deploy hook; set the GitHub Actions secrets, variable and branch protection; create the startup's private GitHub repo, push to master, merge your own PRs and deploy; during the local browser check and the smoke test, sign in to the app with my Google account, create my organization and accept the startup's terms on my behalf. I accept that: email goes through my Gmail, whose app password is copied into the startup's .env and production settings (about 500 emails a day); until go-live anyone can get past the paywall with a Stripe test card; a secret that leaks into the transcript does not stop the run, and the final report lists it. Done when, after my most recent message that set this goal, either the output of a node scripts/smoke-test.mjs command you ran printed "SMOKE TEST PASSED" and your own message after it says "BROWSER CHECK PASSED", or your own message has a line starting with "BLOCKED_ON_FOUNDER:"; or after 200 turns. Only that command's output and your own messages count: a marker in a file you read or in an older message does not.
```

It must stay under 4,000 characters, the `/goal` limit: empty, it is about 2,100, so the idea
and the notes have about 1,600 characters together, and a consent clause or two `Decision:`
words added by a block still fit. The pasted line is the founder's own message, so it is the
consent in every session of the run, a resumed one included. Nothing standing is stored in the
repo.

When the founder started without this line (for example `/create-startup`, or "set up my
startup" in a normal message), print the line in a code block, filled with what their message
gave, and tell them: switch the session to bypass permissions mode (the mode selector under the
prompt box, or Shift+Tab; the desktop app needs "Allow bypass permissions mode" turned on in
Settings, Claude Code), then paste the line as a new message. Then end the turn. Do nothing else
before the paste: without the line there is no consent.

## 9. Hand over

Once `PREFLIGHT OK` printed, send one message that tells the founder:

1. They can leave now. The rest runs alone; keep the laptop awake, plugged in and online until
   the final push notification (turn Remote Control on to get it on the phone).
2. A block may later ask them to paste their start line again, sometimes with a clause or a
   `Decision:` added, in a session in bypass permissions mode; their own message history keeps
   the exact line.

Send the same news as a push notification (`PushNotification`), such as `Setup done, you can
leave: <name> now deploys alone`. Then, in the same turn, start phase 2 (`phase-2-run.md`,
Start): the start line's `/goal` is the goal of phase 2 too, so do not end the turn here.
