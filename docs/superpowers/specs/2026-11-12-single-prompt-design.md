# True single prompt (roadmap item 7) — design

Date: 2026-11-12. Status: agreed with the founder in chat (brainstorming), reviewed by a builder
check whose two open questions the founder answered. The founder asked to go from design to
build without a further approval step.

**Revised 2026-11-17, after the second live run.** That run stopped the founder four times in
phase 1: the interview (three questions, all with good defaults), the consent with a region
switch, the switch to bypass permissions mode, and the `/goal` paste. The flow is now: the
founder picks bypass permissions mode before the first message and pastes one start line
(`.claude/skills/create-startup/references/phase-1-setup.md` section 8) that carries the name,
the idea, the EU answer and the consent. Phase 1 derives every other answer, shows it without
waiting, runs every check first, and asks at most one `AskUserQuestion` for what only the founder
can do. Phase 2 follows in the same turn under the same `/goal`. The sections below describe the
first version; where they speak of the interview, the consent message or the hand-over paste,
the skill's references win.

## Intent

The boilerplate promises "one prompt to a running company". Today the `create-startup` skill
stops many times along the way: it asks for the name, then the pricing, then the founder's
details, then asks for a go-ahead before each OAuth consent, each key, each push. Sign-ins and
2FA codes come up in the middle of the run. The founder has to stay at the screen for the whole
run, which can take hours.

This step splits the run in two:

1. **Phase 1, with the founder, at the start, in one sitting.** Claude asks every question the
   run needs and gets every founder-only action done (accounts, sign-ins, 2FA, the Gmail app
   password), plus one blanket consent. It saves all of it to `startup.config.json`, checks that
   nothing is missing (the preflight), and prints one `/goal` line.
2. **Phase 2, Claude alone.** The founder pastes the `/goal` line and leaves. Claude runs every
   remaining step without a single question, deploys to production on the free `*.vercel.app`
   URL, and runs an automatic smoke test.

When the founder comes back, the startup is set up and live: the parent accounts are connected,
every cloud project exists for this startup, and the site is online on the URL that Vercel
assigned.

## Goals

1. **One sitting of founder work, then none.** Every question and every founder-only action of the
   current skill moves to phase 1. Phase 2 contains no question to the founder.
2. **Answers saved in a JSON file.** `startup.config.json` (already the per-startup config, read
   by the scripts) holds every answer. A new session can resume phase 2 from it with no context
   from phase 1. The founder's consent is not stored there (see "Blanket consent").
3. **A preflight that blocks early.** A script checks that the config is complete and valid, that
   the tools are installed, that the CLI sign-ins and the master keys work, and that the provider
   quotas leave room for this startup. If anything is missing, phase 2 does not start.
4. **An unattended run driven by `/goal`.** `/goal` makes Claude keep taking turns until its
   condition is met. The condition is provable from the transcript: the smoke test printed its
   pass line, or Claude printed `BLOCKED_ON_FOUNDER`.
5. **An automatic smoke test** on the production URL, as a script plus a short browser check.
6. **Caveman mode in the founder's session**, to cut output tokens over a long run.

## Non-goals

- A custom domain, Resend and DNS (roadmap item 4, set aside). Email uses SMTP with the founder's
  Gmail, which needs no domain.
- Live payments. The run ends with the production app wired to the Autumn **sandbox** (Stripe test
  mode). Creating the company, the startup's Stripe account, the KYC and the switch to live stay
  with the founder for later (the storefront design already gates this on the legal identity).
- Turning the idea into product features (roadmap item 6, skipped). The dashboard stays empty.
- Microsoft OAuth and Upstash Redis (still optional `TODO` lines).
- Running phase 2 in the cloud or on a server. It runs on the founder's machine, in the Claude
  Code session where phase 1 happened (or a resumed one).

## Anti-goals (a failure even if it works)

- Phase 2 asks the founder something that phase 1 could have asked or that Claude could have
  solved alone.
- Phase 2 calls the founder for something that is not on the closed list below.
- Claude deletes a cloud resource without the founder.
- A secret reaches the transcript, a command-line argument or printed output (the existing rule).
- The `/goal` loop keeps burning turns while it waits for the founder.
- A second, parallel config or answer store appears next to `startup.config.json`.
- A standing consent is stored in the repo, where a later session or a future hire could pick it
  up.

## The founder's experience

1. The founder opens Claude Code in a fresh clone of the boilerplate and writes one message, for
   example: "Create my startup: <the idea>. Name: <the name>."
2. **Briefing** (one message): what phase 1 needs from them (about how long, which accounts, that
   they must keep the laptop awake and plugged in during phase 2), and what stays manual for later
   (company, Stripe live, domain). When the first message lacks the idea or the name, the briefing
   ends with that one question.
3. **Interview** (one message, one answer, once the idea and the name are known): Claude derives
   everything it can from the idea and asks only for the rest. The founder answers once, approving
   or changing the proposals.
4. **Founder-only actions**: a checklist, each item checked first and skipped silently when it
   already passes. For a returning founder (second startup), most items pass and this is short.
5. **Blanket consent** (one message, one "yes").
6. **Preflight**: `PREFLIGHT OK`, or the exact list of what is missing and how to fix it.
7. Claude prints the `/goal` line. The founder pastes it and leaves.
8. Phase 2 runs. At the end, a push notification: "live at <url>, smoke test passed". If a
   founder-only action becomes necessary, a push notification says exactly what to do.

## Phase 1 in detail

### Interview

Asked, because Claude cannot infer them:

- the idea and the name (from the first message; when missing, asked at the end of the briefing,
  since every derivation below needs them);
- which Google account is the founder's identity, when Chrome is signed in to more than one
  (Claude lists them all through `myaccount.google.com/?authuser=0`, `1`, …; Chrome's default
  account is not necessarily the founder's);
- the founder's full name (legal notice) and contact email (default: the founder's Google
  identity);
- the Gmail address for SMTP (default: the Google identity);
- the GitHub owner, only when `gh org list` shows organizations (default: personal account).

Derived and shown for one review, as today's steps derive them:

- the slug (checked up front against the vault, Dash0 and GitHub name rules and against an
  existing `<owner>/<slug>` repo);
- the data region (default `eu`: the founders are established in France);
- the site's default language, `defaultLocale` (`fr` by default, `en` proposed for a `us` startup
  or a founder who writes in English);
- the pricing proposal of `01b-set-pricing.md` (amount, interval, trial, currency `EUR`,
  rationale);
- the brand (lucide icon, accent color) and the landing copy in French and English, from
  `01d-storefront.md`;
- the legal state: individual founder, `legal.company` null.

The founder's one answer is written to `startup.config.json` and `autumn.config.ts`, and the
landing copy to the messages files, exactly as steps 1, 1b and 1d do today. The domain is empty.

### Founder-only actions

Each item is a check first; only a failing check becomes an action. Order: long-lived items
first, short-lived sign-ins last, so they are fresh when phase 2 starts.

1. 1Password service account in the Keychain (`vault-put.mjs --check`); if missing, the existing
   Terminal.app procedure of step 0.
2. Provider accounts and Chrome sign-ins: Google, GitHub, Vercel, Supabase, PostHog (in the
   region), Autumn, Dash0 (an organization in the region). Claude opens each dashboard; the
   founder acts only where a sign-in needs a password, a 2FA code, a CAPTCHA or an account
   creation.
3. Master keys missing from `startup-founder/master-keys`: Claude creates them in Chrome under the
   blanket consent, as step 0 does today. The founder acts only if a page asks for a password or
   2FA.
4. The Gmail app password for SMTP: only the founder can create it; it reaches the vault through
   the clipboard, as step 0 does today. Claude first checks that 2-Step Verification is on for
   that account (App passwords does not exist without it).
5. Postgres or Docker on the machine (install under the consent).
6. `gh auth login`, with the `workflow` scope when the git protocol of github.com
   (`gh config get git_protocol -h github.com`) is https.
7. Site and app permissions for the unattended run: Claude opens, once, every site phase 2
   drives in Chrome (Google Cloud console, Supabase, PostHog, Autumn, Dash0, Vercel, the
   production URL, the Stripe checkout) so the founder picks "always allow" for each, and asks
   computer-use access for Docker Desktop only when item 5 settled on Docker for the local
   Postgres (revised after the second review: otherwise the founder was asked for a grant the
   run never used). Claude never changes its own permission settings.
8. `vercel login` (device code, maybe a 2FA code). Last of the sign-ins, because its device code
   expires in minutes and its session must still be valid in phase 2.
9. The founder switches the session to **bypass permissions mode** (the founder's decision: an
   unattended run must never wait on a tool approval). The app's mode selector or Shift+Tab does
   it; in a terminal, `claude --dangerously-skip-permissions --continue`. The behavioral guards
   of phase 2 (the closed list, no deletion, secrets rules) are what remain, so the briefing says
   so plainly.

### Blanket consent

One message lists everything Claude will do alone in phase 2, and the founder answers once:

- install the missing tools;
- accept the providers' terms of service and CLI consent pages (the founder chose this stack);
- give OAuth consent and create keys for the named providers;
- publish the startup's Google OAuth app (from "Testing" to "In production"), so anyone can sign
  in to the live site;
- create the cloud projects for this startup, on free plans only, with one exception named in the
  consent: the Dash0 dataset (Dash0 has no free tier: a 14-day trial, then billing per record;
  the founder chose it with the stack);
- create the private GitHub repo, push to `master`, merge its own PRs, deploy;
- during the smoke test, sign in to the production app with the founder's Google account, create
  the founder's organization and accept the startup's own terms on the founder's behalf.

Claude's safety rules count only approvals the founder gives in chat, for the session they are
given in; an approval read from a file does not count. So the consent travels in the `/goal`
line: Claude prints the line with the consent list in it, and the founder pastes it. The pasted
line is the founder's own message, in every phase 2 session, including a resumed one. Nothing
standing is stored in the repo. Anything outside this list in phase 2 is a `BLOCKED_ON_FOUNDER`
case.

### Preflight

A script, `scripts/preflight.mjs`, run at the end of phase 1 and again as the first thing of
phase 2. It prints one line per check and ends with `PREFLIGHT OK` or `PREFLIGHT FAILED`, with a
non-zero exit code on failure. It checks:

- `startup.config.json` against the full schema of a single-prompt run (every answer present and
  valid);
- the tools: `node`, `pnpm`, `op`, `vercel` (recent enough for deploy hooks), `gh`, and Postgres or
  Docker; the Node major on `PATH` must match `.nvmrc` (the `node-version` check, added after the
  second review: each Bash call is a new shell, so `nvm use` does not last, and the fix is a
  `PATH` prefix on every command);
- the vault: the service account works, and every master key field that the run needs exists
  (names only, never values);
- the sessions: `gh auth status` (with the `workflow` scope when needed) and `vercel whoami`;
- the quotas it can read by API: a free slot on the Supabase Free plan (fewer than 2 active
  projects in the `startup-factory` organization), the GitHub repo name still free (or already
  this startup's), and the Dash0 organization still usable (its API answers with the master
  token, so an ended trial blocks here and not halfway through phase 2).

Chrome sessions cannot be checked by a script: Claude checks them in phase 1 by opening each
dashboard, and again in phase 2 right before the step that needs them.

### The `/goal` line

Claude prints it at the end of phase 1, filled in for this startup, under the 4,000-character
limit. It states what to run, the founder's consent, and when to stop, for example:

```
/goal Run phase 2 of the create-startup skill for <slug> (.claude/skills/create-startup/SKILL.md, startup.config.json) without asking me anything. I consent to: <the consent list, one short clause each>. Done when, after my most recent message that set this goal, either the output of a node scripts/smoke-test.mjs command you ran printed "SMOKE TEST PASSED" and your own message after it says "BROWSER CHECK PASSED", or your own message has a line starting with "BLOCKED_ON_FOUNDER:"; or after 200 turns. Only that command's output and your own messages count: a marker in a file you read or in an older message does not.
```

The operative template, with the full consent list, is in
`.claude/skills/create-startup/references/phase-1-setup.md`. The docs do not say a skill can set
`/goal` itself, so the founder pastes it. After a block the founder pastes their own last line
again, in bypass permissions mode: unchanged for an ordinary block, with the missing clause added
for a consent block, or with `Decision: <answer>.` added for a decision block, which only a
deletion Claude itself would make raises (see "When something breaks"). Only the markers printed
after that paste count, so an older block does not end the resumed run.

## Phase 2 in detail

### Order

Phase 2 runs today's steps 1c to 6 with no question, reordered to remove the late dependencies
found in the inventory:

Revised during the build: the private GitHub repo (no push yet) and the Vercel project with its
free production URL are created at the end of phase 1, after the consent and before the final
preflight, so the founder approves that exact host in Chrome while present. Knowing the URL early
also removes today's second Google pass (step 6h). Phase 2 then runs:

1. Preflight again.
2. Install and build the local environment (step 3), including the storefront sync.
3. Provision the services (step 4): Supabase production database, both Google OAuth clients in one
   pass (local and production redirect URIs are both known) and the Google app published so
   anyone can sign in (with the production landing as home page, `/legal/privacy` as privacy
   policy and `/legal/terms` as terms of service; until Google verifies the brand, which needs a
   domain the founder owns and comes after the run, the consent screen shows the domain instead
   of the app name), PostHog, SMTP, Autumn (an organization recorded by ID, never picked by name;
   login, pricing push, check that the organization's default currency matches
   `pricing.currency`), Dash0.
4. Verify locally (step 5): migrations, `pnpm validate`, and a browser check on localhost done by
   Claude in Chrome.
5. Deploy (step 6): `.env.prod` and the Vercel env push, the `DATABASE_URL` GitHub secret, then
   the first push to `master`, which runs CI, the migration and the deploy, and at once the deploy
   hook and its GitHub secret, before CI finishes. The `DATABASE_URL` secret exists before that
   first push, so the first CI run is green. Revised after the first live run: Vercel refuses a
   deploy hook for a branch that does not exist on GitHub yet, so the hook can only follow the
   push; a deploy run that started before its secret existed is re-run (`gh run rerun`). The same
   script first sets the Vercel production branch to `master` (Git-connected to an empty repository
   in phase 1, the project keeps `main`, and hook builds of `master` were then Previews), and
   `vercel.json` disables every Git deployment (`"git": { "deploymentEnabled": false }`), so no
   branch or pull request builds a Preview: production deploys only through the hook. Revised
   after the second review: `production.yml` no longer turns green when the hook answers. Its
   `Wait for the production deployment` step polls `<productionUrl>/api/version` until
   `commitSha` equals the pushed commit (15 minutes at most) and fails otherwise, so a green run
   means production serves the commit. It reads the GitHub Actions variable `PRODUCTION_URL`,
   which the deploy hook script sets with the production branch and the hook secret. The
   committed `vercel.json` is the same for every startup (`git.deploymentEnabled: false`,
   `framework: nextjs`): the Vercel project script sets the framework and the function region on
   the project through the Vercel API, so merging boilerplate fixes later never conflicts on
   `vercel.json`. The same script removes the `.env.local` that `vercel link` writes, so only
   `.env` and `.env.prod` remain.
6. Smoke test, after the Vercel build is Ready.
7. Final report (the per-service checklist of today) and a push notification.

Each step announces itself and ends with a `STEP <id> DONE` line, and records its completion in a
git-ignored run ledger, `startup.run.json`. Every step is idempotent (it creates or reuses), so a
resumed run can also start over; the ledger only lets it skip finished steps faster.

### Changes to today's steps

- **No MCP needed.** The Supabase project is created through the Supabase Management API with the
  master token (cost check: Free plan only, 0 per month), not through the Supabase MCP. Phase 2 no
  longer needs the `/mcp` OAuth sign-ins of step 2, which could expire mid-run and only the founder
  can redo.
- **`gcloud` is dropped** from step 0: no later step uses it.
- **Production uses the Autumn sandbox key** until the founder goes live. Today the docs do not say
  what to push to production while Stripe is not live, and the production build fails without
  `AUTUMN_SECRET_KEY`.
- **Every question inside the reference steps reads its answer from `startup.config.json`**
  instead, and every go-ahead is covered by the consent in the `/goal` line.
- **The founder-driven paths stay, outside phase 2.** Going live (company details, the legal gate
  of step 6f, the startup's Stripe account, KYC, the live Autumn key), a custom domain with
  Resend, and changing the price of an existing startup move to a separate "After the run"
  section of the skill. They stay interactive, phase 2 never reaches them, and the skill's
  single-step triggers ("set my pricing", "deploy it to prod") still work outside a run. Added
  after the second review: taking boilerplate fixes later (merge `upstream/master` on a branch,
  regenerate the startup profile, PR). The repo's `.gitattributes` marks the three files the
  profile sync generates `merge=ours`, and the repository step defines that merge driver once per
  clone (`git config merge.ours.driver true`), so those files never conflict.

### When something breaks

1. **Claude solves it alone first**, in this order: the provider's API or CLI; Claude in Chrome
   (the founder's signed-in browser); computer use for native apps. It may change approach, wait
   and retry (for example the 1Password rate limit of 100 writes per hour, or a provider
   propagation delay).
2. **It calls the founder only when a human is required.** Closed list:
   - create an account;
   - type a password;
   - enter a 2FA code;
   - solve a CAPTCHA;
   - pay or enter a card (including moving off a free plan);
   - complete a KYC;
   - give a consent that the saved consent does not cover;
   - delete a cloud resource;
   - copy a secret by hand when Claude cannot copy it without seeing it (for example a Google
     client secret when the console offers no Download JSON). Added during the build: a security
     rule makes the founder necessary.
3. **When blocked**, Claude records the block in the run ledger, sends a push notification with
   the exact action (under 200 characters), and prints a `BLOCKED_ON_FOUNDER: <the action>` line
   that tells the founder to paste their own last `/goal` line again in bypass permissions mode
   (see "The `/goal` line" for the consent and decision variants; the operative wording is in
   `.claude/skills/create-startup/references/phase-2-run.md`). That line meets the `/goal`
   condition, so the loop stops instead of spinning. A consent block is cleared by the clause in
   the pasted line, a decision block (a deletion Claude itself would make) by the `Decision:` word
   in it, and any other block by its check passing on resume.
4. **A leaked secret is not a block.** A secret that reaches the transcript or printed output is
   still a failure (see the anti-goals), but the run does not stop for it: Claude goes on as if the
   founder had kept it, revokes nothing, and the final report lists each exposed secret (provider,
   vault item, how to revoke it). Revised after the first live run, at the founder's request: the
   earlier decision block stopped an unattended run for something the founder preferred to handle
   at the end.
5. **No deletion.** A one-time key that was lost is replaced by a new key; the old one stays and
   the final report lists it for cleanup.

### Smoke test

Two parts, both on the production URL.

**Script**, `scripts/smoke-test.mjs --url <production URL>`, prints one line per check and ends
with `SMOKE TEST PASSED` or `SMOKE TEST FAILED`:

- `/` answers 200 and shows the startup name; each `/legal/*` page answers 200;
- `/api/version` returns the commit that was pushed;
- starting a Google sign-in returns a redirect to Google with the production client ID and the
  production callback URL;
- the production database has every migration of `drizzle/` applied (read through the vault, the
  URL never printed);
- added after the second review: `/brand-logo.png` (the brand mark the invitation email shows) is
  a PNG (`brand-logo`), and the Vercel production branch is `master` (`production-branch`; the
  fix is to run the deploy hook script again).

**Browser check**, by Claude in Chrome: sign in with Google as the founder, create the
organization (named after the startup), reach the paywall, tick the terms, and reach the Stripe
checkout page in test mode. Claude stops there and never enters a card number. Then it prints
`BROWSER CHECK PASSED`. This leaves the founder's own account, organization and terms acceptance
in the production database, which is expected: the founder is the first user.

## Caveman mode

The boilerplate commits a project `.claude/settings.json` that declares the caveman marketplace
(GitHub `JuliusBrussee/caveman`) and enables the `caveman@caveman` plugin, so Claude Code offers
to install it when the founder trusts the folder. The questions of phase 1 stay in plain, full
sentences (caveman already drops its style for confirmations and questions that need clarity).
Code, docs and commits stay in normal English, as today. The setting stays in each startup's
repo; the final report says how to remove it.

## Constraints

- All existing rules hold: secrets only through the vault, the clipboard or a downloaded file;
  Claude never creates accounts, types passwords or solves CAPTCHAs; one data region for every
  service; no new SaaS; English for code, docs and commits.
- `/goal` facts (code.claude.com/docs/en/goal): one goal per session, a condition of at most 4,000
  characters, checked after each turn by a small model that reads only the transcript and runs no
  tools; it survives `--resume`; it has no built-in turn cap.
- Push notifications reach the founder's desktop, and their phone when Remote Control is on; the
  briefing tells the founder so.
- The founder's machine must stay awake for the whole of phase 2.

## Decided (by the founder, in the conversation)

- Two phases: every question and founder-only action first, then an unattended run.
- Answers saved in a file; Claude recommended JSON (`startup.config.json`) plus `/goal` to drive
  the run, and the founder agreed.
- Done means: accounts set up, the startup's cloud projects created, the startup online on the
  free Vercel URL.
- On failure, Claude finds a solution alone (API, Claude in Chrome, computer use) and calls the
  founder only when the founder's action is truly necessary.
- The founder's session runs in caveman mode.
- Phase 2 runs in bypass permissions mode; the founder switches to it at the end of phase 1.
- Anyone can sign in to the live site from the end of the run: the Google OAuth app is
  published. The founder accepted that, while production is on the Autumn sandbox, any visitor
  can get past the paywall with a Stripe test card; the final report says so, and going live
  ends it.
- A secret that reaches the transcript does not stop the run; the founder is told at the very end,
  in the final report (decided after the first live run).

## Claude's calls (marked as such, from the playback the founder approved)

- The closed list of founder-required actions above.
- `BLOCKED_ON_FOUNDER` stops the `/goal` loop; the founder resumes by pasting their own last `/goal` line (with a clause or a `Decision:` word added when the block asks for one).
- No deletion of cloud resources in phase 2.
- Production stays on the Autumn sandbox (Stripe test mode) at the end of the run.
- The Vercel project is created right after the repo, so Google OAuth is done in one pass.
- The Supabase MCP is replaced by the Management API, and `gcloud` is dropped.
- A git-ignored run ledger `startup.run.json`, and `STEP <id> DONE` lines.
- The `/goal` turn cap of 200.
- The consent travels in the pasted `/goal` line, never in a file.
- Dash0 is the one paid service named in the consent; the preflight checks it is still usable.
- The founder-driven paths (go-live, domain, price changes) move to an "After the run" section.
- The caveman setting stays in each startup's repo.

## Left to the builder

- The exact JSON schema additions (consent, production URL, GitHub owner) and where the schema
  lives so the preflight and the existing scripts share it.
- How to read the Vercel-assigned production domain right after project creation.
- How to start a Google sign-in from a script and read the redirect.
- How to check the Autumn organization's default currency, and how to fix a mismatch alone.
- How the skill files are reorganized: the phase 1 and phase 2 flows in `SKILL.md`, the questions
  removed from the reference steps.
- Whether the browser check on localhost (step 5) and the production browser check share one
  procedure.
- Tests for the preflight and the smoke test scripts, with the network calls faked.
