# Phase 1 — Setup with the founder (one sitting)

Everything the run needs from the founder happens here, in one sitting. Phase 2
(`phase-2-run.md`) then runs alone and asks nothing, so settle here anything phase 2 would need
from the founder.

Write every message to the founder in plain, full sentences, in their language, even when the
caveman plugin (`.claude/settings.json`) shortens the rest of the session.

Order of work:

1. Briefing (one message).
2. Interview (one message, one answer), then write the files.
3. Run every check of the founder-only checklist. Checks change nothing.
4. Consent (one message, one "yes").
5. Work through the failing checklist items, in order.
6. Preflight until `PREFLIGHT OK`.
7. Print the `/goal` line and hand over.

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
  given here, a deletion, a leaked secret); it never deletes a cloud resource; it uses free plans
  only (Dash0 excepted); and no secret reaches the transcript.
- **What stays for later** (`after-the-run.md`): the company, Stripe live and its KYC, a custom
  domain with Resend. Until go-live, production uses the Autumn sandbox: anyone can get past the
  paywall with a Stripe test card. The legal texts are templates to have reviewed before selling
  for real.

## 2. Interview

First gather what the machine can tell, with no question. Load the Chrome tools in one ToolSearch
call and read the `chrome-browser` skill, then read the Google account Chrome is signed in to
(`https://myaccount.google.com`). When `gh` is signed in, run `gh api user -q .login` and
`gh org list`. When the vault answers, run `node scripts/vault-put.mjs --list-fields master-keys`.
If `startup.config.json` already exists (an interrupted phase 1), propose its values.

**Ask** only what Claude cannot infer:

- the idea and the name, only if the first message lacks them;
- the founder's full name (legal notice) and contact email (default: the Google identity);
- the Gmail address for SMTP (default: the Google identity), only when `SMTP_USER` is not in the
  master keys;
- the GitHub owner, only when `gh org list` shows organizations or `gh` is not signed in yet
  (default: the personal account).

**Derive and show for review**, as the reference steps derive them:

- `slug` (`01-name-startup.md`): 3 to 26 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$` (the
  vault, Dash0 and GitHub rules), and `<owner>/<slug>` not already a GitHub repository
  (`gh repo view "<owner>/<slug>"`). When it is taken, propose another slug.
- the data region: `eu` by default (`"gdpr": true`, `"dataRegion": "eu"`: the founders are
  established in France); `us` only if the founder says so (`01-name-startup.md` item 3).
- the pricing: the proposal of `01b-set-pricing.md` sections 1 to 3 (amount, interval, trial,
  currency `EUR`, a one-sentence rationale).
- the brand and the landing copy: `01d-storefront.md` section 2 (lucide icon, accent color,
  headline and subheadline in French and English).
- the legal state: an individual founder, `legal.company` null.

Send all of it in **one message** and take **one answer**: the founder fills the asked items and
approves or changes the proposals. Apply what they changed and keep your proposals for the rest. A
follow-up question is allowed only for an asked item the answer leaves empty.

Then write, exactly as steps 1, 1b and 1d do:

- `startup.config.json`, shape below; `domain` is always `""` in a run, and `pricing.source` is
  `founder` when the founder gave the price;
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
  "idea": "Contract review assistant for freelance designers",
  "githubOwner": "ada-lovelace",
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

Phase 2 adds `repository` and `productionUrl`. Do not run the profile sync, commit or push here:
phase 2 does.

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
   region's account), Autumn, Dash0. Check: open each dashboard; a dashboard, not a login page,
   passes (`00-founder-setup.md` item 4). Action: open the sign-in page and use "Continue with
   Google" (GitHub for Supabase); the founder acts only for a password, a 2FA code, a CAPTCHA or an
   account creation. Once per founder: a Supabase organization `startup-factory` on the Free plan,
   and a Dash0 organization in the region's data location, which the founder creates at sign-up
   (it starts the trial).
3. **Master keys.** Check: `node scripts/vault-put.mjs --list-fields master-keys` lists
   `SUPABASE_ACCESS_TOKEN`, `POSTHOG_PERSONAL_API_KEY_<R>`, `DASH0_AUTH_TOKEN_<R>`,
   `DASH0_API_URL_<R>` and `DASH0_OTLP_ENDPOINT_<R>` (`<R>` is `EU` or `US`). Action: create each
   missing one in Chrome and store it from the clipboard, as `00-founder-setup.md` item 6 does;
   the founder acts only if a page demands a password or a 2FA code. No Resend key: it serves a
   custom domain, after the run.
4. **Gmail app password.** Check: the same listing has `SMTP_USER` and `SMTP_PASS`. Action: only
   the founder can create the app password (Google account, Security, 2-Step Verification on, App
   passwords) and copy it; then store both fields as the SMTP part of `00-founder-setup.md` item 6
   does. The app password never passes through you.
5. **A local database.** Check: `pg_isready -h localhost -p 5432` or `docker info` succeeds.
   Action: install Docker Desktop (`brew install --cask docker`) and open it once; the founder
   accepts its license and types the macOS password if asked. Step 3b starts Postgres in it.
6. **GitHub CLI.** Check: `gh auth status` passes and, when `gh config get git_protocol` prints
   `https`, shows the `workflow` scope. Action: the founder runs `gh auth login --web -s workflow`
   (or `gh auth refresh -s workflow`) in a terminal. If the interview could not check the owner or
   the slug, check them now; when the slug is taken, pick a free variant, update
   `startup.config.json` and `package.json`, and tell the founder.
7. **Site and app permissions.** Open once in Chrome every site phase 2 drives:
   `console.cloud.google.com`, `accounts.google.com`, the Supabase, PostHog, Autumn, Dash0 and
   Vercel dashboards, `http://localhost:3000`, `https://<slug>.vercel.app` and
   `checkout.stripe.com`. The founder picks "always allow" for each (if `vercel-project.mjs` later
   falls back to a suffixed `*.vercel.app` name, Chrome asks again there and phase 2 blocks on
   it). Then call `request_access`
   for the native apps phase 2 may drive (Docker Desktop). Never change your own permission
   settings.
8. **Vercel CLI.** Check: `vercel whoami` prints the username. Action: `vercel login` as
   `00-founder-setup.md` item 5 describes (you click "Allow Access"; the founder types a 2FA code
   if asked). It comes last because its device code expires in minutes and its session must still
   be valid in phase 2.
9. **Bypass permissions mode**: section 7, together with the `/goal` line.

## 4. Consent

One message lists everything Claude will do alone, in this phase and in phase 2, and the founder
answers once:

- install the missing tools;
- accept the providers' terms of service and CLI consent pages (the founder chose this stack);
- give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and
  Dash0;
- publish the startup's Google OAuth app (from "Testing" to "In production"), so anyone can sign
  in to the live site;
- create the cloud projects for this startup, on free plans only, with one exception: the Dash0
  dataset (Dash0 has no free tier: a 14-day trial, then billing per record);
- create the private GitHub repo, push to `master`, merge its own PRs, deploy;
- during the local browser check and the smoke test, sign in to the app with the founder's Google
  account, create the founder's organization and accept the startup's own terms on the founder's
  behalf.

The same message states two facts the founder accepts with it: email goes through their Gmail (the
app password is copied into this startup's local `.env` and its production settings; Gmail caps
at about 500 emails a day), and until go-live any visitor can get past the paywall with a Stripe
test card.

Never write the consent to a file: it travels in the `/goal` line. If the founder strikes a
clause, leave it out of the line; phase 2 then blocks where it needs it.

## 5. Preflight

```bash
pnpm install    # only when node_modules is missing: the preflight loads valibot
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
| `vercel-session` | item 8 |
| `supabase-quota` | `startup-factory` already has 2 other active projects: the founder pauses or deletes one (never you) |
| `github-repo` | another slug, as in item 6 |
| `dash0` | the Dash0 trial ended or the token was revoked: the founder renews the subscription, or item 3 replaces the token |

## 6. The `/goal` line

Fill the placeholders (`<slug>`, `<name>`, `<owner>`) and change nothing else, except leaving out
a clause the founder struck. Print it alone in a code block so the founder copies it whole. It
must stay under 4,000 characters; filled with long values it is about 1,200.

```text
/goal Run phase 2 of the create-startup skill for <slug> (.claude/skills/create-startup/SKILL.md, startup.config.json) without asking me anything. I consent to: install the missing tools; accept the providers' terms of service and CLI consent pages; give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and Dash0; publish the <name> Google OAuth app to "In production" so anyone can sign in; create this startup's cloud projects on free plans only, except the Dash0 dataset (14-day trial, then billed per record); create the private GitHub repo <owner>/<slug>, push to master, merge your own PRs and deploy; during the local browser check and the smoke test, sign in to the app with my Google account, create my organization and accept the startup's terms on my behalf. Done when scripts/smoke-test.mjs printed "SMOKE TEST PASSED" for the production URL and the browser check printed "BROWSER CHECK PASSED", or when you printed a line starting with "BLOCKED_ON_FOUNDER:", or after 200 turns.
```

The pasted line is the founder's own message, so it is the consent in every phase 2 session, a
resumed one included. Nothing standing is stored in the repo.

## 7. Hand over

In the same message as the `/goal` line, tell the founder, in this order:

1. Switch this session to **bypass permissions mode**: the mode selector in the app, or
   Shift+Tab; in a terminal, quit and run `claude --dangerously-skip-permissions --continue`. You
   never change your own permission settings.
2. Paste the `/goal` line as a new message, then leave.
3. Keep the laptop awake, plugged in and online until the final push notification; turn Remote
   Control on to get it on the phone.

Then end the turn. The pasted line starts phase 2 (`phase-2-run.md`).
