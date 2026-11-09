---
name: create-startup
description: >-
  Bootstrap a new startup / SaaS project from this boilerplate end-to-end, all the way to a
  production deployment. Use this skill whenever the user wants to start, scaffold, initialize,
  provision, or ship a new startup from this repo — name their company, wire up and configure
  every service (Supabase, Google OAuth, Autumn payments, PostHog, Resend, Vercel), set the pricing, fill the environment, run the app locally, and deploy it live.
  Trigger on phrases like "set up my startup", "initialize the boilerplate", "create a new
  startup", "let's start the project", "connect the services", "set my pricing", or "deploy it
  to prod", even when the skill is not named explicitly.
---

# Create Startup

Take a fresh clone of this boilerplate and drive it to a **production-ready, deployed** startup:
named, every service provisioned and configured, environment filled, running locally, then live
on Vercel — with as little manual dashboard work by the user as possible.

## How this skill works

Setup is a **hybrid**. Some services expose an MCP that lets you configure them directly; the
rest are driven through their provider API with the founder's master keys, or through the founder's
signed-in Chrome. Your job is to do everything you can automatically and make the manual parts a
tight, well-signposted flow, never a vague "go set up X yourself".

Secrets live in **1Password** (the source of truth) and reach it through one of three channels:

1. **Script to vault**: a script calls a provider API and writes the key straight into the vault.
2. **Clipboard**: Claude in Chrome clicks a Copy button; `vault-put.mjs --from-clipboard` stores it
   and clears the clipboard.
3. **Downloaded file**: a provider's downloaded JSON goes through an import script into the vault.

**Never read a page that shows a secret.** On such a page use narrow `find` queries only, never
`get_page_text`, `read_page` or `screenshot`. A secret never appears in a command-line argument,
and the 1Password service account token never passes through you.

You never create accounts, type passwords or solve CAPTCHAs, and you ask the founder's go-ahead
before an OAuth consent or before creating a key in a dashboard.

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
  Project-level MCP config (URLs, no secrets) lives in `.mcp.json` and *is* committed.
  `.env.template` is the committed, empty shape.

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
brand-neutral by design (see `CLAUDE.md`). The name captured in Step 1 is for project/config
identifiers, not for baking into UI strings.

The boilerplate ships **no product features**: behind the paywall, the dashboard is an empty page.
There is no AI, file storage, or RAG to configure. When the startup's idea needs one of them, it is
built as a feature after this skill, following the rules in `CLAUDE.md` (OpenAI for LLMs,
ZeroEntropy for RAG, Supabase Storage for files).

## What this run decided (per the repo owner)

- **Payments: Autumn is integrated for real** (code + provisioning), not deferred.
- **End state: production.** A full run ends with a live Vercel deployment, hosted DB, and
  payments configured.
- **Optional services: PostHog is set up.** Upstash Redis and Microsoft OAuth
  are left as clearly-marked `TODO` lines in `.env` (the app degrades gracefully without them).
- **Observability: Dash0.** One Dash0 organization per data region for all of the founder's
  startups; one dataset and one ingest token per startup.
- **Data region is asked once, in Step 1.** `gdpr` + `dataRegion` in `startup.config.json` decide
  the region of every service; no later step picks a region on its own.

## The flow

Execute in order. Each step is detailed in its own reference file — **read the file when you
reach that step** and follow it; don't run ahead. Keep a todo per step.

0. **Founder setup** → `references/00-founder-setup.md`
   Once per machine, idempotent: tools, the 1Password service account, provider accounts, CLI
   logins, master keys. Each item is a check that passes silently when already done.
1. **Name the startup** → `references/01-name-startup.md`
   Capture the name, derive identifiers, persist `startup.config.json`.
1b. **Set the pricing** → `references/01b-set-pricing.md`
   The founder gives the price, or you derive it from the idea; write it to `autumn.config.ts`.
1c. **Create the startup's repository** → `references/01c-create-repository.md`
   A private GitHub repo named after the slug becomes `origin`; the boilerplate stays as a
   fetch-only `upstream`.
2. **Connect the connectors** → `references/02-connect-connectors.md`
   Add every service MCP so you can configure them from here; authenticate each.
3. **Install & build the local environment** → `references/03-install-and-secrets.md`
   `pnpm install`, start a local Postgres, create `.env` with local values and secrets.
4. **Provision & configure services** → `references/04-provision-services.md`
   Supabase production database (automatic, into `.env.prod`), Google OAuth, PostHog, email,
   Autumn, Dash0 (production only, into `.env.prod`) — fill every `.env` value, each service in the
   region `startup.config.json` records.
5. **Verify locally** → `references/05-verify-locally.md`
   Migrate the local database, boot `pnpm dev`, sign in, and pass the `pnpm validate` gate.
6. **Deploy to production** → `references/06-deploy-production.md`
   Connect the Vercel project to the GitHub repo, create the deploy hook, finish and push
   `.env.prod`, set the GitHub Actions secrets, wire prod OAuth + Autumn + Stripe, deploy
   through CI.

At the end, report a per-service status checklist (configured / needs user action / skipped) and
the live URL.

## Prerequisites to tell the user up front

They'll need **1Password** (paid, no free tier; a personal account works) and accounts (free tiers
are fine to start) for: **Supabase, Google Cloud** (OAuth), **Autumn** (+ a **Stripe** account to
connect for real payments), **Vercel**, **GitHub**, **PostHog** and **Resend**. They sign in to all
of them with the one Google identity (GitHub for Supabase). Everything else is optional. Step 0
checks all of this once; if it is incomplete, run it before Step 1.

On the machine, local development needs **Postgres or Docker** (Step 3 starts the database). If
neither is installed, say so at the start.

Logs need a **Dash0** organization too. Dash0 has no free tier: a 14-day trial, then billing per
log record, span and metric data point. For an EU startup, the PostHog account and the Dash0
organization must both be in the EU region (see `references/data-region.md`).
