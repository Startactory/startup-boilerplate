# Step 3 — Install & bootstrap the environment

## 3a. Install toolchain & dependencies

1. Use the Node version in `.nvmrc` (`nvm use` if available).
2. `pnpm install` — this also runs husky's `prepare` and builds the allowed native deps
   (`sharp`, `esbuild`, …). Expect it to take a bit on first run.

## 3b. Create `.env` from the template

Copy `.env.template` → `.env` (git-ignored). You'll fill service values in Step 4; here you only
generate the local secrets that don't depend on any external account.

## 3c. Generate the local secrets

Read `src/shared/env.ts` first to confirm the exact constraints, then generate and write these
into `.env`:

| Variable | Constraint (`env.ts`) | Generate with |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ≥ 32 chars | `openssl rand -base64 32` |
| `EARLY_ACCESS_PEPPER` | ≥ 16 chars | `openssl rand -hex 32` |
| `CRON_SECRET` | ≥ 16 chars | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | optional, but set it | `openssl rand -hex 32` |

Generate each value with a real command (don't invent strings), and write it verbatim. Leave the
service-dependent variables (Supabase, OAuth, OpenAI, ZeroEntropy, Autumn, email, PostHog) empty
for now — Step 4 fills them.

## 3d. Sanity check

The app can't boot yet (services unset), and that's expected. Do **not** run `pnpm dev` here —
that's Step 5, after provisioning. Confirm `.env` exists, the four secrets are populated, and move
to Step 4.
