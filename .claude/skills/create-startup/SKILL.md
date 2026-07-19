---
name: create-startup
description: >-
  Bootstrap a new startup / SaaS project from this boilerplate end-to-end, all the way to a
  production deployment. Use this skill whenever the user wants to start, scaffold, initialize,
  provision, or ship a new startup from this repo — name their company, wire up and configure
  every service (Supabase, Google OAuth, OpenAI, ZeroEntropy, Autumn payments, PostHog, Resend,
  Vercel), set up the local environment against a local Postgres, connect Vercel to the GitHub
  repo with a CI/CD deploy pipeline, then build the separate production environment and deploy it
  live. Trigger on phrases like "set up my startup", "initialize the boilerplate", "create a new
  startup", "let's start the project", "connect the services", "connect vercel", "set up CI/CD",
  or "deploy it to prod", even when the skill is not named explicitly.
---

# Create Startup

Take a fresh clone of this boilerplate and drive it to a **production-ready, deployed** startup:
named, every service provisioned and configured, environment filled, running locally, then live
on Vercel — with as little manual dashboard work by the user as possible.

## How this skill works

Setup is a **hybrid**. Some services expose an MCP that lets you configure them directly
(create the project, mint keys, push config); others have no MCP and need a short guided
paste-back where the user creates something in a console and hands you the key. Your job is to
do everything you can automatically and make the manual parts a tight, well-signposted flow —
never a vague "go set up X yourself".

Three hard rules that keep this reliable:

- **`src/shared/env.ts` is the source of truth for configuration.** It validates every variable
  at boot (via valibot). Before filling any env file, read it — required vs optional, formats
  (e.g. `SUPABASE_SECRET_KEY` must start with `sb_secret_`, `BETTER_AUTH_SECRET` ≥ 32 chars),
  and cross-field rules (the email provider check). If a value doesn't satisfy `env.ts`, the app
  won't start. Treat that file as the contract, not this skill.
- **Local and production are two environments, two files — never one shared blob.** `.env` holds
  local values and points at a **local Postgres**; `.env.prod` holds production values and is
  pushed to Vercel. A Supabase Postgres connection string must never land in `.env`: local
  development would then run migrations and `drizzle:push` against real user data. See the table
  below.
- **Secrets live in the env files only, which are git-ignored. Never commit a key.** `.gitignore`
  covers `.env` and `.env.*`, with `.env.template` — the committed, empty shape — the sole
  exception. Project-level MCP config (URLs, no secrets) lives in `.mcp.json` and *is* committed.

### The two environments

| | `.env` (Steps 3–5) | `.env.prod` (Step 7) |
| --- | --- | --- |
| Database | local Postgres, `localhost:5432/<slug>` | Supabase session pooler, port 5432 |
| `DATABASE_SSL` | `allow` | `require` |
| App / auth URL | `http://localhost:3000` | `https://<prod-domain>` |
| Secrets | generated for local | generated separately |
| Autumn | sandbox (`am_sk_test_…`) | live (`am_sk_live_…`) |
| Consumed by | `pnpm dev` | pushed to the Vercel project env store |

Supabase is used for **two unrelated things**: object Storage (required in both environments —
`env.ts` marks the three `SUPABASE_*` vars required, so the app won't boot without them) and a
hosted Postgres (**production only**). "Don't use Supabase locally" means its *database*, not its
*storage*.

## The stack (what's actually in this repo)

| Concern | Choice | Configured in |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TS 6 · pnpm | — |
| Auth | Better Auth — Google OAuth (required), Microsoft (optional), org plugin | `src/infra/auth/auth.ts` |
| Database | local Postgres (dev) · Supabase Postgres (prod) · Drizzle ORM | `DATABASE_URL` |
| File storage | Supabase Storage (private `files` bucket) | `SUPABASE_*` |
| Payments | **Autumn** (over Stripe) — see the billing integration | `AUTUMN_SECRET_KEY`, `autumn.config.ts` |
| AI | OpenAI via Vercel AI SDK + Mastra agents | `OPENAI_API_KEY` |
| RAG | ZeroEntropy (locked) | `ZEROENTROPY_API_KEY` |
| Analytics | PostHog | `NEXT_PUBLIC_POSTHOG_KEY` |
| Tracing / logs | OpenTelemetry (+ PostHog exporter) · pino | `OTEL_*` (optional) |
| Email | Resend **or** SMTP (provider-switchable) | `EMAIL_PROVIDER` + provider vars |
| Rate limit / cache | Upstash Redis (optional) | `UPSTASH_*` |
| Hosting | Vercel (+ cron), deployed by CI via a deploy hook on `main` | Steps 6–7 |

Do **not** hard-code the startup's brand name in user-facing copy — the boilerplate is
brand-neutral by design (see `CLAUDE.md`). The name captured in Step 1 is for project/config
identifiers, not for baking into UI strings.

## What this run decided (per the repo owner)

- **Payments: Autumn is integrated for real** (code + provisioning), not deferred.
- **End state: production.** A full run ends with a live Vercel deployment, hosted DB, and
  payments configured.
- **Local development runs on local Postgres**, never on the Supabase database.
- **The default branch is `main`.** `ci.yml`, `production.yml` and `vercel.json` all key off it;
  a repo left on `master` looks wired up and silently never deploys.
- **Deploys are CI-driven, not push-driven.** `vercel.json` disables Vercel's own auto-deploy on
  `main`; a green CI run fires a Vercel deploy hook, so migrations land before the new code is
  live and a red test suite can't reach production.
- **Optional services: PostHog is set up.** Upstash Redis, Microsoft OAuth, and Brave Search
  are left as clearly-marked `TODO` lines in `.env` (the app degrades gracefully without them).

## The flow

Execute in order. Each step is detailed in its own reference file — **read the file when you
reach that step** and follow it; don't run ahead. Keep a todo per step.

1. **Name the startup** → `references/01-name-startup.md`
   Capture the name, derive identifiers, persist `startup.config.json`.
2. **Connect the connectors** → `references/02-connect-connectors.md`
   Add every service MCP so you can configure them from here; authenticate each.
3. **Local environment** → `references/03-local-environment.md`
   `pnpm install`, start a local Postgres and create the `<slug>` database, generate the local
   secrets, create `.env` pointing at `localhost:5432/<slug>`.
4. **Provision & configure services** → `references/04-provision-services.md`
   Supabase **Storage**, Google OAuth, OpenAI, ZeroEntropy, Autumn sandbox, PostHog, email — fill
   every remaining *local* `.env` value. Not `DATABASE_URL`; that stays local.
5. **Verify locally** → `references/05-verify-locally.md`
   Migrate the local database, boot `pnpm dev`, sign in, and pass the `pnpm validate` gate.
6. **Connect Vercel & the CI/CD pipeline** → `references/06-connect-vercel-cicd.md`
   Put the repo on `main`, create the Vercel project and **connect it to the GitHub repo**, create
   the deploy hook, give CI the hook secret, protect the branch. No production values yet.
7. **Production environment & deploy** → `references/07-production-env.md`
   Build `.env.prod` (Supabase pooler DB, prod URLs, fresh secrets, Autumn live), push it to
   Vercel, give CI the prod `DATABASE_URL`, wire prod OAuth, then push `main` and let the pipeline
   deploy.

Steps 3–5 produce a working local app; 6 makes deployment possible; 7 gives it production values.
Keeping those separate is deliberate — see the two-environment rule above.

At the end, report a per-service status checklist (configured / needs user action / skipped) and
the live URL.

## Prerequisites to tell the user up front

**Locally:** Node (see `.nvmrc`), pnpm 10, the `gh` and `vercel` CLIs, and a **Postgres they can
run** — either an existing local install or Docker, which Step 3b uses to start one.

**Accounts** (free tiers are fine to start): **Supabase, Google Cloud** (OAuth), **OpenAI** (with
billing), **ZeroEntropy**, **Autumn** (+ a **Stripe** account to connect for real payments),
**Vercel**, **GitHub**, and **PostHog**. Everything else is optional. Surface the account list at
the start of Step 4 so they can create any missing ones before the guided parts.
