# startup-boilerplate — Engineering Guide

You are a **senior engineer working in production**.
This is a real system with real users.

> Build code that is **correct, simple, and maintainable**.
> **Correctness > cleverness · Simplicity > abstraction · Explicitness > magic · Consistency > preference.**

Single Next.js app. This repo is a **reusable startup boilerplate** — the user-facing brand is per-startup and undecided; **never hard-code a product name in user-visible copy**.
Included base: auth, organizations, early-access onboarding, paywall + billing, email, rate-limit, i18n. **Everything behind the paywall is the startup's own product** — the dashboard ships as an empty page and features are built on top of this base from the founder's idea. Don't add product features to the boilerplate itself.

---

## Commands (pnpm 10)

- `pnpm dev` — Next.js dev server (Turbopack)
- `pnpm build` — production build
- `pnpm type-check` — `tsc --noEmit`
- `pnpm test` / `pnpm test:watch` — vitest (unit + co-located tests)
- `pnpm check` / `pnpm check:fix` — **biome** (format + organize-imports + light lint)
- `pnpm lint` / `pnpm lint:fix` — **ESLint** (`eslint-config-next` + `react-hooks`)
- `pnpm format` / `pnpm format:check` — biome format only
- `pnpm check:boundaries` — domain-isolation checker (`scripts/check-domain-boundaries.mjs`)
- `pnpm validate` — `type-check && check && lint && check:boundaries && test`
- `pnpm drizzle:generate` / `migrate` / `push` / `pull` / `drop` — Drizzle migrations

**Done-gate before claiming work complete:** `pnpm validate`.

**Husky pre-commit:** `tsc --noEmit` → `lint-staged` (eslint + biome on `*.{js,jsx,ts,tsx}`, biome format on JSON except `drizzle/**`) → `scripts/check-domain-boundaries.mjs` (layer purity, no barrels, and the domain-isolation rules below). Do **not** bypass with `--no-verify` unless explicitly asked.

**Pre-push** blocks direct push to `master`/`prod`. Use a feature branch + PR.

**Migrations are generated, never hand-written.** Edit schema in `src/infra/database/schema/*`, then `pnpm drizzle:generate` (writes to `drizzle/`).

---

## Stack — what's actually here

- **Runtime**: Next.js 16 (App Router) · React 19 · TypeScript 6
- **DB / data**: Drizzle ORM + Postgres (hosted on Supabase) · Upstash Redis (rate-limit / cache)
- **Auth**: Better Auth (Google + Microsoft OAuth)
- **Validation**: **valibot 1.x** (schemas at every boundary)
- **Errors**: **neverthrow** `Result<T, AppError>`
- **i18n**: **next-intl** — keys in `src/i18n/messages/{en,fr}.json`; `t('missing.key')` is a compile error via `IntlMessages` augmentation in `src/global.d.ts`
- **UI**: shadcn / Radix / Base UI · Tailwind v4 · `lucide-react` · `sonner` · `next-themes`
- **Email**: provider-switchable (Resend or SMTP), `react-email` for templates
- **Observability**: OpenTelemetry (OTLP/HTTP) to **Dash0** (logs, traces, metrics) + PostHog (product analytics) · `pino` logger — see `docs/observability.md`
- **Background work**: `@vercel/functions` `waitUntil` for fire-and-forget; **cron only for retry / stuck-state**, never as a primary work queue

---

## Codebase map

Single alias: `@/*` → `src/*`. There is **no `lib/` at repo root**; utilities live under `src/lib`, `src/shared`, `src/hooks`.

```
src/
  core/              Pure domain. NO infra/app/application/shared/i18n imports.
    errors.ts        AppError discriminated union + helper constructors
    ports/           Port interfaces (*.port.ts) the domain depends on
    <context>/       billing, email, … (one folder per bounded context)
    types/           cross-context types
  application/       Use cases — orchestration, called from route handlers
    <feature>/
      <action>.ts    one verb per file
      dto.ts         DTOs co-located with the use case
  infra/             IO only. Implements core ports. Returns Result.
    database/        Drizzle schema + connection
    data-access/     Repositories — map DB rows → DTOs (never raw rows out)
    external-apis/   Autumn, Resend, SMTP, Upstash Redis, …
    auth/            Better Auth (server + client)
  app/               Next.js App Router UI
    (public)/        unauthenticated routes
    (app)/           authenticated routes (gated by layout.tsx)
    api/             route handlers — the ONLY server entry point (billing, early-access, locale, …)
    auth/[...all]/   Better Auth handler
  shared/            logger, env, telemetry, errors-http, utils
  i18n/              messages + request config
  components/ui/     shadcn primitives (Button, Dialog, …)
  hooks/             cross-cutting React hooks
  lib/               small client-side utilities (cn, etc.)

drizzle/             Generated migrations + meta snapshots (don't hand-edit)
src/instrumentation.ts          OpenTelemetry boot
src/instrumentation-client.ts   PostHog client init
```

---

## Architecture — YOU uphold these (checker-enforced where noted, the rest by discipline)

### Never

- Import into `core/` from outside `core/`
- **Write a server action.** The `'use server'` directive is banned (ESLint `no-server-actions/no-use-server`). Every client→server call goes through a route handler under `src/app/api/*`, invoked with `fetch` from the client. Register the new route's directory in its domain in `scripts/boundaries/manifest.mjs`.
- Import `infra/` from `app/` UI (go through `application/`). Server-side wiring required by Next.js — route handlers, layout session checks — may import `@/infra/auth/auth`.
- Call infrastructure from domain — use ports (`core/ports/*.port.ts` → adapter in `infra/` → wired in `application/`)
- **Throw across layers from infrastructure** → return `Result<T, AppError>`. Internal pure helpers may throw; the calling adapter catches and converts.
- Return raw DB rows → map to DTOs in `infra/data-access/*`
- Create circular dependencies
- Use barrel files (`index.ts` re-exports) — import modules directly
- Write code comments — self-documenting names instead. (One short `// why` line is OK when the why is non-obvious — a hidden constraint, subtle invariant, or workaround.)
- Hard-code user-facing strings — `next-intl` (`useTranslations` / `getTranslations`)
- Read `process.env.X` outside `shared/env.ts` and `instrumentation.ts`
- Expose `unknown` from any layer — validate at the boundary, return strictly-typed `Result`. `any` is forbidden by lint; `unknown` is allowed only as a narrow boundary input that gets immediately validated.

### Always

- **Schemas first** — define valibot, types, ports before writing the use case
- **Layers**: `core/` (pure logic, domain services) → `application/` (use cases, entry points, DTOs) → `infra/` (IO, implements ports, returns `Result`) → `app/` (UI only)
- **`≥3 params → object param`** — convention; old call sites with positional triples are debt, don't copy them
- **Idempotent writes; retry-safe external calls**
- **Validate every boundary** with valibot (use-case input, API route body, env, external API response)
- **Log start / success / failure** with structured context — `shared/logger` (pino). No `console.log`. PII auto-redacted.

```ts
import { log } from '@/shared/logger';
log.info('feature.action.start', { userId, threadId });
log.info('feature.action.success', { rowsAffected });
log.warn('feature.action.failed', { reason });   // recoverable
log.error('feature.action.crashed', err, { userId });  // unexpected
```

---

## Domain isolation — manifest-driven, enforced at every layer

The codebase is partitioned into **domains** declared in `scripts/boundaries/manifest.mjs`. Every `src/` file belongs to exactly one domain (or the shared bucket / generic UI). The rule engine lives in `scripts/boundaries/evaluate.mjs` and is consumed by **independent enforcement layers** — client-side hooks are convenience, CI is the authority:

1. **ESLint** — the inline `domain-boundaries/enforce` rule (in `eslint.config.mjs`) reports violations live in the editor, in `lint-staged`, and in `pnpm lint`.
2. **Whole-tree checker** — `scripts/check-domain-boundaries.mjs` (`pnpm check:boundaries`) adds file-level rules (unassigned files, unowned schemas, barrels) and scans everything including regex-level dynamic-import detection. Runs in husky pre-commit and `pnpm validate`.
3. **Vitest** — `scripts/domain-boundaries.test.ts` runs the same checker inside `pnpm test`, so the CI `test` job enforces it too.
4. **CI** — a dedicated `boundaries` job runs on every push and pull request.
5. **Branch protection (do this once per clone)** — in GitHub settings, protect `master` and require the `boundaries`, `test`, and `type-check` checks. That is the only gate a developer cannot bypass locally; everything above is fast feedback for it.

Domains and their tables:

| Domain | Owns tables | Public entry points (examples) |
|---|---|---|
| `auth` | `user`, `session`, `account`, `verification` | `infra/auth/auth`, `application/me/get-current-user`, `application/me/organization-scope` |
| `organization` | `organization`, `member`, `invitation` (writes also via better-auth org plugin) | `application/organization/*` use cases |
| `early-access` | `early_access_code` | `application/early-access/redeem` |
| `billing` | none (Autumn owns billing state) | `application/billing/get-app-entitlement` |
| `rate-limit` / `email` | none (platform, open to all) | `apply-rate-limit`, `email-sender` |

Rules the checker enforces:

1. **Table ownership** — a drizzle schema file may only be imported from its owning domain's `infra/` layer (plus `infra/database/*`). The application layer never imports schema.
2. **DB access** — `@/infra/database/connection` is importable only from `infra/data-access/**`, `infra/auth/**`, `infra/database/**`. Use cases never touch `db` directly.
3. **Repository privacy** — `infra/data-access/<ctx>/**` is private to its domain. Other domains go through application entry points.
4. **Entry points** — a cross-domain import must target a module listed in the target domain's `public` array. Everything else is internal.
5. **Declared edges** — domain-to-domain dependencies must be listed in `ALLOWED_EDGES` (platform domains `auth`, `rate-limit`, `email` are open to all). Undeclared coupling fails.
6. **Layer purity + no barrels** — `core/` imports nothing from `application`/`infra`/`shared`/`app`; no `index.ts` anywhere.

**Adding a domain**: create its dirs (`core/<x>`, `application/<x>`, `infra/data-access/<x>`, schema file), register it in `scripts/boundaries/manifest.mjs` with dirs, owned schemas, and public entry points, and declare any edges it needs. The checker's `unassigned-file` rule will remind you if you forget.

**Extending a domain's API deliberately**: add the module to its `public` list (or add an edge). That diff on `scripts/boundaries/manifest.mjs` is the reviewable contract change — never work around the checker by moving files between domains to dodge a rule.

---

## Stack-specific rules

### Product features (added per startup)

The boilerplate ships no AI, file storage, or RAG. Add them only when the startup's idea needs them, as a new domain registered in `scripts/boundaries/manifest.mjs`:

- **LLM** → OpenAI only, through the Vercel AI SDK (`ai` + `@ai-sdk/openai`). Never propose Anthropic / Claude / Mistral / any other LLM.
- **RAG / vector search** → ZeroEntropy. Never propose pgvector / qdrant / Weaviate / any other vector store.
- **File storage** → Supabase Storage (same Supabase project as the database).
- New env vars go in `shared/env.ts`, `.env.template`, `scripts/env/rules.mjs` (rules and `SECRET_KEYS`), `scripts/set-env-var.mjs` and `scripts/push-env-to-vercel.mjs`.
- Fire-and-forget work → **`waitUntil` from `@vercel/functions`**. Bare `void asyncFn()` dies on Vercel.
- **Evals are hard.** Don't require manual golden queries; default to auto-generated evals or skip the eval gate.

### UI

- **Sidebar stays collapsed (icon-rail only)** in this app — deliberate stylistic choice, never propose expanding it.
- shadcn primitives in `src/components/ui/*` — copy patterns from there. Reuse `cn()` from `src/lib/utils.ts`.
- Design language lives in `DESIGN.md` — light-mode, layered off-whites, one accent color.
- No emojis in code/files unless the user asks.

### Cross-app rule

- **Respect another agent's deletions.** If code was removed, replan around the deletion — never silently restore it.

### Infra constraints

- **No new infra / SaaS subscriptions.** Stick to the existing stack: Supabase, Upstash, Vercel, PostHog, Autumn, Resend, Dash0, 1Password — plus OpenAI / ZeroEntropy when the idea needs them. If you think you need something else, raise it explicitly first.
- **One data region per startup.** `startup.config.json` `dataRegion` (`eu` / `us`) decides the region of every service; never pick a region for one service on its own. See `.claude/skills/create-startup/references/data-region.md`.
- **Cron is only for retry / stuck-state cleanup.** Primary work runs in-request (or via `waitUntil`).

---

## i18n

- Default `fr`, fallback `en`. No `[locale]` in URLs — locale comes from `LOCALE` cookie.
- **Type-source-of-truth: `src/i18n/messages/en.json`.** All other locales must mirror its shape.
- `IntlMessages` augmentation in `src/global.d.ts` turns missing keys into compile errors.

---

## Done =

- Types strict (no `any`; no leaking `unknown`)
- Validates at every boundary (valibot)
- Errors handled (`Result<T, AppError>`)
- Logs added (start / success / failure with context)
- Architecture respected (no forbidden imports)
- Tests added for domain + critical logic
- Code is clear (small functions, no dead `// what` comments)
- `pnpm validate` is green

---

## Mindset

Write code that:

- **scales** — domain stays pure, infra stays swappable
- **is easy to change** — small focused modules, no premature abstraction
- **fails safely** — `Result` over throw, idempotent writes, retry-safe externals
- **other engineers understand** — boring patterns over clever ones
