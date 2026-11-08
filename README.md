<img width="2144" height="730" alt="illustration" src="https://github.com/user-attachments/assets/41cd7b73-bd06-4aff-adcc-45c4905c1f6b" />

# Startup Boilerplate

Everything a SaaS needs on day one — auth, organizations, database, payments, email, analytics — wired up and ready to deploy. The product itself lives behind the paywall and is built on top of this base, around the founder's idea.

## Setup

```bash
git clone git@github.com:ismaelmehdid/startup-boilerplate.git
cd startup-boilerplate
claude
```

Then run:

```
/create-startup
```

That's it. The skill walks you through everything: naming the startup, connecting each service, filling `.env`, running the app, and deploying to production.

## Before you start

**Install:** Node (see `.nvmrc`), pnpm, git.

**Create free accounts:** [Supabase](https://supabase.com) · [Google Cloud](https://console.cloud.google.com) · [Autumn](https://useautumn.com) + [Stripe](https://stripe.com) · [Vercel](https://vercel.com) · [PostHog](https://posthog.com)

**Plus, for logs:** [Dash0](https://www.dash0.com) — no free tier (14-day trial, then usage-based). For a startup with EU users, create the PostHog account and the Dash0 organization in the EU region.

## What the skill asks you for

Most of the setup is automatic. You only need to:

1. Give your startup a name, and say whether it has users (or is based) in the EU
2. Authenticate the connectors once (`/mcp` → Authenticate)
3. Paste 3 secrets — Google OAuth, Autumn, and a Dash0 ingest token
4. Connect Stripe inside the Autumn dashboard

Everything else — installing dependencies, generating secrets, creating the Supabase project, running migrations, booting the app, and deploying to Vercel — is done for you.

## Stack

| | |
|---|---|
| Framework | Next.js 16 · React 19 · TypeScript · pnpm |
| Auth | Better Auth (Google OAuth) |
| Database | Supabase Postgres + Drizzle |
| Payments | Autumn |
| Analytics | PostHog |
| Logs & traces | Dash0 (OpenTelemetry) |
| Email | Resend |
| Hosting | Vercel |

## Commands

```bash
pnpm dev        # start the dev server
pnpm validate   # type-check, lint, boundaries, tests — run before committing
pnpm test       # tests only
```
