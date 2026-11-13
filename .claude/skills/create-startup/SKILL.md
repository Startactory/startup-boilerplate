---
name: create-startup
description: >-
  Bootstrap a new startup / SaaS project from this boilerplate end-to-end, all the way to a
  production deployment. Use this skill whenever the user wants to start, scaffold, initialize,
  provision, or ship a new startup from this repo — name their company, wire up and configure
  every service (Supabase, Google OAuth, Autumn payments, PostHog, Dash0, Vercel; Resend is
  optional, with a custom domain after the run), set the pricing, fill the environment, run the
  app locally, and deploy it live.
  Trigger on phrases like "set up my startup", "initialize the boilerplate", "create a new
  startup", "let's start the project", "connect the services", "set my pricing", or "deploy it
  to prod", even when the skill is not named explicitly.
---

# Create Startup

Take a fresh clone of this boilerplate and drive it to a **production-ready, deployed** startup:
named, every service provisioned and configured, environment filled, running locally, then live
on its free Vercel URL. The founder spends one sitting with you (phase 1); then you run alone
(phase 2).

## How this skill works

Every service is driven through its provider API or CLI with the founder's master keys, or
through the founder's signed-in Chrome (Claude in Chrome). No MCP connector is needed. Do
everything you can yourself, and keep the founder's part to the one sitting of phase 1.

Secrets live in **1Password** (the source of truth) and reach it through one of three channels:

1. **Script to vault**: a script calls a provider API and writes the key straight into the vault.
2. **Clipboard**: Claude in Chrome clicks a Copy button; `vault-put.mjs --from-clipboard` stores it
   and clears the clipboard.
3. **Downloaded file**: a provider's downloaded JSON goes through an import script into the vault.

**Never read a page that shows a secret.** On such a page use narrow `find` queries only, never
`get_page_text`, `read_page` or `screenshot`; on the Google "OAuth client created" dialog
(`references/04-provision-services.md` 4b) only the single `find "Download JSON"`. A secret never
appears in a command-line argument, and the 1Password service account token never passes through
you. If a secret still reaches the transcript or printed output, the run does not stop: it goes on
with that secret, and the end-of-run report lists it with how to revoke it.

You never create accounts, type passwords or solve CAPTCHAs. The founder approves OAuth consents
and dashboard keys once, in the consent of phase 1; the pasted `/goal` line carries that consent
into phase 2, and anything outside it stops the run with `BLOCKED_ON_FOUNDER`.

Two hard rules that keep this reliable:

- **`src/shared/env.ts` is the source of truth for configuration.** It validates every variable
  at boot (via valibot). Before filling `.env`, read it — required vs optional, formats
  (e.g. `DATABASE_URL` must be a real `postgresql://` URI, `BETTER_AUTH_SECRET` ≥ 32 chars),
  and cross-field rules (the email provider check). If a value doesn't satisfy `env.ts`, the app
  won't start. Treat that file as the contract, not this skill.
- **Two environments, two files.** `.env` is local development (local Postgres, localhost URLs).
  `.env.prod` is production (Supabase Postgres, the real URL, its own secrets) and is pushed to
  Vercel. The Supabase database never goes in `.env`. Both files are git-ignored. **Never commit a
  key.** The vault (1Password) is the source of truth: `.env` is regenerated from it and holds real
  values; `.env.prod` holds `op://` references on every secret line. Never edit them by hand.
  `.env.template` is the committed, empty shape. `vercel link` also writes a git-ignored
  `.env.local` that holds only `VERCEL_OIDC_TOKEN`; `vercel-project.mjs` removes it right away, so
  only these two files remain (`references/03-install-and-secrets.md`).

## The stack (what's actually in this repo)

| Concern | Choice | Configured in |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TS 6 · pnpm | — |
| Auth | Better Auth — Google OAuth (required), Microsoft (optional), org plugin | `src/infra/auth/auth.ts` |
| Database | Drizzle ORM · local Postgres (dev) · Supabase Postgres (prod) | `DATABASE_URL` in `.env` / `.env.prod` |
| Payments | **Autumn** (over Stripe) — see the billing integration | `AUTUMN_SECRET_KEY`, `autumn.config.ts` |
| Analytics | PostHog | `NEXT_PUBLIC_POSTHOG_KEY` |
| Logs / traces / metrics | **Dash0** over OpenTelemetry (OTLP/HTTP) · pino | `OTEL_*` (Step 4f) |
| Data region | EU or US — one answer for every service, plus GDPR work when EU | `startup.config.json` → `references/data-region.md` |
| Email | Resend **or** SMTP (provider-switchable) | `EMAIL_PROVIDER` + provider vars |
| Rate limit / cache | Upstash Redis (optional) | `UPSTASH_*` |
| Hosting | Vercel | Step 6 |
| Secrets | 1Password vault (paid; a personal account works) | Step 0 |

Do **not** hard-code the startup's brand name in user-facing copy — the boilerplate is
brand-neutral by design (see `CLAUDE.md`). The name captured in phase 1 is for project/config
identifiers and `startup.config.json`, not for baking into UI strings.

The boilerplate ships **no product features**: behind the paywall, the dashboard is an empty page.
There is no AI, file storage, or RAG to configure. When the startup's idea needs one of them, it is
built as a feature after this skill, following the rules in `CLAUDE.md` (OpenAI for LLMs,
ZeroEntropy for RAG, Supabase Storage for files).

## What this run decided (per the repo owner)

- **Payments: Autumn is integrated for real** (code + provisioning). Production uses the Autumn
  **sandbox** (Stripe test mode) until the founder goes live after the run.
- **End state: production** on the free `*.vercel.app` URL Vercel assigns, smoke-tested: a live
  Vercel deployment, the hosted database, payments in test mode. A custom domain comes later.
- **Optional services: PostHog is set up.** Upstash Redis and Microsoft OAuth
  are left as clearly-marked `TODO` lines in `.env` (the app degrades gracefully without them).
- **Email: SMTP** with the founder's Gmail during the run (no domain needed); Resend once the
  startup has a custom domain.
- **Observability: Dash0.** One Dash0 organization per data region for all of the founder's
  startups; one dataset and one ingest token per startup.
- **Data region is decided once, in the phase 1 interview** (default `eu`). `gdpr` +
  `dataRegion` in `startup.config.json` decide the region of every service; no later step picks a
  region on its own.

## The flow

Read each reference file when you reach it and follow it; don't run ahead. Keep a todo per step.

**Where to start:**

- The founder pasted the `/goal` line that names phase 2 → phase 2.
- The founder asks for one founder-driven change on a startup that already ran (set the price, go
  live, add a domain, take the boilerplate's fixes) → after the run.
- Otherwise → phase 1. It is idempotent: on a returning founder or an interrupted setup, each check
  passes silently.

**Phase 1 — with the founder, in one sitting** → `references/phase-1-setup.md`
Briefing (it ends with the idea and name question when the founder's first message lacks them),
one interview (written to `startup.config.json`, `autumn.config.ts` and the landing copy), the
founder-only checklist, one blanket consent, then the first two ledger steps while the
founder is present: `repository` (`references/01c-create-repository.md`, no push) and
`vercel-project` (`references/06-deploy-production.md` 6b, which gives the production URL and sets
the project's framework and function region; the committed `vercel.json` is the same for every
startup). Then `node scripts/preflight.mjs` until `PREFLIGHT OK`, and the `/goal` line the founder
pastes after switching to bypass permissions mode.

**Phase 2 — Claude alone** → `references/phase-2-run.md`
No question to the founder. It runs the reference steps in this order, each closed with
`node scripts/run-ledger.mjs done <id>` in the git-ignored ledger `startup.run.json`:

| id | Reference |
| --- | --- |
| `preflight` | `node scripts/preflight.mjs` |
| `local-env` | `references/03-install-and-secrets.md` |
| `supabase`, `google-oauth`, `posthog`, `smtp`, `autumn`, `dash0` | `references/04-provision-services.md` 4a to 4f |
| `verify-local` | `references/05-verify-locally.md` |
| `deploy` | `references/06-deploy-production.md` 6e, 6g, the first push (6j item 1), 6d right after it, then 6i |
| `smoke-test` | `node scripts/smoke-test.mjs` and the browser check |
| `report` | the end-of-run report below |

Phase 2 never runs a real or live charge: the live checkout waits for going live
(`references/after-the-run.md`), and the browser check stops at the Stripe test-mode checkout
page. Phase 2 stops, after the founder's latest `/goal` message, when the smoke test script's own
output shows its pass line and Claude's own message then reports the browser check passed, or
when Claude's own message ends with a block line because a human-only action is needed. A marker
read in a file never counts (`references/phase-2-run.md`).

**After the run — founder-driven, interactive** → `references/after-the-run.md`
Going live (company details, the startup's Stripe account and KYC, the live Autumn key), a custom
domain with Resend and Google brand verification, changing the price of an existing startup,
taking boilerplate fixes, optional MCP connectors. Phase 2 never reaches them.

`references/00-founder-setup.md`, `01-name-startup.md`, `01b-set-pricing.md` and
`01d-storefront.md` hold the procedures phase 1 uses; `references/data-region.md` maps the data
region to each service.

## End-of-run report

The `report` step ends the run with:

- the live URL (`productionUrl`) and the smoke test result;
- a per-service checklist (configured / needs founder action / skipped) for GitHub, Vercel,
  Supabase, Google OAuth, PostHog, email, Autumn and Dash0; when `gdpr` is `true`, each item of
  the "When `gdpr` is `true`" list in `references/data-region.md`, as that list shows it (user
  rights are built: data export and account deletion, self-service in Settings);
- **production is on the Autumn sandbox** (Stripe test mode): until go-live, anyone can get past
  the paywall with a Stripe test card; going live (`references/after-the-run.md`) ends it;
- **left for cleanup**: each key the run replaced instead of deleting (provider, key name), each
  resource an earlier attempt left behind (a Google Cloud project or OAuth client), and each cloud
  resource the founder chose to keep (a `Decision: keep`), or "none";
- **exposed secrets**: each secret that reached the transcript or printed output during the run
  (the run went on with it): the provider, the vault item and field (or the resource, such as the
  deploy hook), and how to revoke it as its reference step says, or "none";
- what stays for later: the company and go-live, a custom domain with Resend and Google brand
  verification (until then Google's consent screen shows the domain instead of the app name),
  Upstash, Microsoft OAuth, branch protection if GitHub refused it;
- where the secrets live: the 1Password vault `startup-<slug>` (items `local`, `production`,
  `ci`); `.env` holds real values for local use only and `.env.prod` holds `op://` references
  only, both git-ignored; the same values sit in the Vercel project env and the two GitHub
  secrets;
- **caveman**: `.claude/settings.json` turns the caveman plugin on for this repo; to remove it,
  delete its `extraKnownMarketplaces.caveman` and `enabledPlugins` entries (today the file holds
  nothing else) and merge that change through a PR.
