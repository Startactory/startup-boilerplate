# Public Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every startup made from the boilerplate a minimal public landing page, a per-startup logo and accent color, French-law legal pages, recorded acceptance of the terms of sale at checkout, and a cookie banner that gates PostHog.

**Architecture:** Per-startup data (brand, legal identity, currency) lives in `startup.config.json`; a sync script validates it and writes a committed `src/shared/startup-profile/profile.json` plus `src/app/brand.css`, which the app imports. The boilerplate commits neutral versions of both, so it builds with no startup configured. Price and trial come from `autumn.config.ts`. Copy lives in `next-intl` messages (`en.json` is the type source, `fr.json` mirrors it). Terms acceptance is a new `billing`-owned table written through a route handler before Autumn's `attach`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, shadcn (`base-nova` on Base UI) + Tailwind v4, `lucide-react`, valibot, neverthrow, Drizzle + Postgres, posthog-js, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-11-12-storefront-design.md`

## Global Constraints

- Every rule in `CLAUDE.md`: layers, no server actions, route handlers registered in `scripts/boundaries/manifest.mjs`, valibot at boundaries, `Result` from infra, logs start/success/failure, no `process.env` outside `src/shared/env.ts` and the instrumentation files (client code may read `process.env.NEXT_PUBLIC_*` as today), no code comments except a short "why".
- No product name, pitch or legal identity hard-coded in boilerplate UI; neutral defaults ("Votre startup" / "Your startup") come from messages.
- Every user-facing string in `src/i18n/messages/en.json` and `fr.json`, same shape. Default locale `fr`.
- UI uses existing shadcn primitives in `src/components/ui/` (button, card, checkbox, dialog, switch, separator…); any missing one is added with `pnpm dlx shadcn add <name>`, never hand-written. Styling follows `DESIGN.md`.
- Cookie banner: "Refuse" and "Accept" equally prominent (same component, same size, same row); "Customize" secondary.
- PostHog: no `posthog.init` and no `identify` before consent; "Refuse" means PostHog off.
- Migrations are generated with `pnpm drizzle:generate`, never hand-written.
- No new dependency except shadcn components; no new SaaS.
- Done gate per task: its tests pass; at the end `pnpm validate` is green.

## Review Focus

1. Boilerplate with no startup configured (neutral `profile.json`): landing and legal pages render neutral copy and an individual-publisher legal notice with empty fields hidden, no crash — tested in Task 1 (default profile parses) and Task 5 (`resolvePublisher` on the neutral profile).
2. Consent cookie with a garbage or expired value is treated as unset (banner shown, PostHog off), never as granted — tested in Task 3.
3. Accept, then later Refuse from "Manage cookies": capturing stops at once and the person is reset — tested in Task 3.
4. `freeTrial` absent or 0 days: no trial wording at all; decimal prices format per locale (`9,99 €` in `fr`) — tested in Task 2.
5. Accent too light for white text (e.g. `#FFE600`): darkened until contrast with `#faf9f5` is at least 4.5:1 — tested in Task 1.

---

### Task 1: Startup profile (data, accent tokens, sync script)

**Files:**
- Create: `scripts/brand/accent.mjs`, `scripts/sync-startup-profile.mjs`
- Create: `src/shared/startup-profile/profile.json` (neutral default), `src/shared/startup-profile/startup-profile.ts`
- Create: `src/app/brand.css` (neutral default = today's charcoal values); import it from `src/app/globals.css` after `:root`
- Test: `test/scripts/accent.test.ts`, `test/scripts/sync-startup-profile.test.ts`, `src/shared/startup-profile/startup-profile.test.ts`
- Modify: `scripts/boundaries/manifest.mjs` only if the checker needs it

**Interfaces:**
- Produces `startup.config.json` additions (written by the skill, read here):
  `brand: { icon: string /* lucide-react icon name, e.g. "Receipt" */, accent: string /* #rrggbb */ }`,
  `legal: { termsVersion: string, founderName: string, contactEmail: string, company: null | { name, form, address, siren, publicationDirector, rcs?, vatNumber?, shareCapital? } }`,
  `pricing.currency: string /* ISO 4217, default "EUR" */`.
- Produces `profile.json` shape: `{ name: string, brand: { icon, accent }, currency: string, legal: <legal as above> }`. Neutral default: `name: ""`, `icon: "Sparkles"`, `accent: "#2f3130"`, `currency: "EUR"`, `legal: { termsVersion: "0", founderName: "", contactEmail: "", company: null }`.
- Produces `src/shared/startup-profile/startup-profile.ts`: `type StartupProfile`, `type LegalIdentity`, `getStartupProfile(): StartupProfile` (valibot-parses the imported JSON once; throws at build if invalid — it is committed data, not user input).
- Produces `scripts/brand/accent.mjs`: `contrastRatio(hexA, hexB): number`, `deriveAccentTokens(hex): { charcoal, charcoalDeep, charcoalSoft, ring }` (all `#rrggbb`; `charcoal` darkened in steps until `contrastRatio(charcoal, '#faf9f5') >= 4.5`; `charcoalDeep` darker; `charcoalSoft` a very light tint).
- Produces `scripts/sync-startup-profile.mjs`: `syncStartupProfile({ config, writeFile })` (pure, testable) and a CLI that reads `startup.config.json`, validates (unknown lucide icon name or bad hex → error naming the field), writes `profile.json` and `brand.css`, prints `OK  startup profile synced (<name>)`.
- `brand.css` overrides in `:root` exactly: `--charcoal`, `--charcoal-deep`, `--charcoal-soft`, `--primary`, `--ring`, `--chart-1`, `--sidebar-primary`, `--sidebar-accent-foreground`, `--sidebar-accent`.

- [ ] **Step 1: Write failing tests**
  - `contrastRatio('#000000', '#ffffff')` ≈ 21; `contrastRatio('#2f3130', '#faf9f5') >= 4.5`.
  - `deriveAccentTokens('#FFE600').charcoal` gives `contrastRatio(…, '#faf9f5') >= 4.5`; `deriveAccentTokens('#2f3130').charcoal === '#2f3130'`; `deriveAccentTokens('blue')` throws `accent must be #rrggbb`.
  - `syncStartupProfile` with a full config writes `profile.json` matching the shape above and a `brand.css` containing `--primary: <charcoal>`; with `brand.icon: "NotAnIcon"` it throws mentioning `brand.icon`; with no `legal` it writes the neutral legal block with the founder fields empty.
  - `getStartupProfile()` on the committed neutral `profile.json` returns `name: ""` and `legal.company: null`.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/accent.test.ts test/scripts/sync-startup-profile.test.ts src/shared/startup-profile` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the files above. Icon validation uses `icons` from `lucide-react` (keys are icon names).
- [ ] **Step 4: Run** the same command — expect PASS; `pnpm type-check` passes; `pnpm dev` still renders the dashboard in charcoal.
- [ ] **Step 5: Commit** `feat(storefront): add startup profile, accent tokens and sync script`

### Task 2: Price line

**Files:**
- Create: `src/shared/storefront/price-line.ts`, test `src/shared/storefront/price-line.test.ts`

**Interfaces:**
- Consumes: `pro` from `autumn.config.ts` (`price: { amount, interval }`, optional `freeTrial: { durationLength, durationType }`), `getStartupProfile().currency`.
- Produces: `getProPricing(): { amount: number; interval: 'month' | 'year'; currency: string; trialDays: number }` (trialDays 0 when `freeTrial` is absent or not in days), `formatPrice({ amount, currency, locale }): string` via `Intl.NumberFormat`, and `vatRegime(legal: LegalIdentity): 'franchise' | 'vat'` (`vat` when `legal.company?.vatNumber` is non-empty).

- [ ] **Step 1: Write failing tests:** `formatPrice({ amount: 9.99, currency: 'EUR', locale: 'fr' })` contains `9,99` and `€`; `formatPrice({ amount: 20, currency: 'EUR', locale: 'en' })` is `€20.00` or `€20` (assert it contains `20` and `€`); `getProPricing()` on the committed config returns `{ amount: 20, interval: 'month', currency: 'EUR', trialDays: 0 }`; `vatRegime` → `vat` with a company `vatNumber`, `franchise` for the neutral legal block and for a company without one.
- [ ] **Step 2: Run** `pnpm vitest run src/shared/storefront/price-line.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Wording (trial / "then X per month" / VAT mention) stays in messages; this module only supplies numbers and the formatted amount.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(storefront): read the pro price and trial for display`

### Task 3: Cookie consent and PostHog gating

**Files:**
- Create: `src/lib/consent.ts` (+ `src/lib/consent.test.ts`), `src/lib/analytics.ts` (+ `src/lib/analytics.test.ts`)
- Create: `src/components/cookie-consent/cookie-banner.tsx`, `cookie-preferences-dialog.tsx`, `consent-store.ts` (client state + `openCookiePreferences()`)
- Modify: `src/instrumentation-client.ts` (init only when consent is already granted), `src/app/layout.tsx` (mount the banner), `src/i18n/messages/en.json` + `fr.json` (`CookieConsent` namespace)

**Interfaces:**
- Produces `consent.ts`: `CONSENT_COOKIE = 'cookie_consent'`, `CONSENT_MAX_AGE_SECONDS = 15552000` (180 days), `type Consent = 'granted' | 'denied' | 'unset'`, `parseConsent(raw: string | undefined): Consent` (only exact `granted`/`denied`), `serializeConsentCookie(choice: 'granted' | 'denied'): string` (`cookie_consent=<choice>; Path=/; Max-Age=15552000; SameSite=Lax`, plus `Secure` on https — take a `secure: boolean` param).
- Produces `analytics.ts`: `createAnalytics({ client, key, host }): { start(): void; stop(): void }` where `client` is the subset of posthog-js used (`init`, `opt_in_capturing`, `opt_out_capturing`, `reset`, `__loaded`). `start` inits once (no-op without key), or opts back in if already loaded; `stop` opts out and resets. Default export wired to the real `posthog`.
- Produces `openCookiePreferences(): void` for the footer and the cookies page.
- Banner copy (messages): one sentence on audience measurement, buttons `Refuser` / `Accepter` (same variant and size), link-style `Personnaliser`. Preferences dialog: one switch "Mesure d'audience (PostHog)", Save.

- [ ] **Step 1: Write failing tests:** `parseConsent('granted') === 'granted'`, `parseConsent('yes') === 'unset'`, `parseConsent(undefined) === 'unset'`; `serializeConsentCookie('denied', { secure: true })` contains `Max-Age=15552000` and `Secure`; with a fake client: `start()` twice calls `init` once; `start()` without key never calls `init`; `stop()` after `start()` calls `opt_out_capturing` and `reset`; `start()` after `stop()` calls `opt_in_capturing`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/consent.test.ts src/lib/analytics.test.ts` — FAIL.
- [ ] **Step 3: Implement** the modules, the banner (fixed bottom card, shown when consent is `unset`), the dialog, the instrumentation change (read `document.cookie`, start only if `granted`), and the layout mount. `PostHogIdentity` already skips `identify` until `posthog.__loaded`.
- [ ] **Step 4: Run** — PASS. Manually: fresh browser shows the banner and no request to the PostHog host; Accept starts it; Manage cookies → off stops it.
- [ ] **Step 5: Commit** `feat(storefront): add cookie consent that gates PostHog`

### Task 4: Landing page, header, footer, brand logo

**Files:**
- Create: `src/components/brand/brand-logo.tsx` (server component: lucide icon from `profile.brand.icon` + name)
- Create: `src/app/(public)/components/storefront/site-header.tsx`, `hero.tsx`, `site-footer.tsx`
- Create: `src/app/(public)/home-destination.ts` (+ `home-destination.test.ts`)
- Modify: `src/app/(public)/page.tsx`, `src/app/(public)/sign-in/page.tsx` + `sign-in-form.tsx` (use `BrandLogo` instead of `/logo.svg`), messages (`Storefront` namespace)

**Interfaces:**
- Consumes: `getStartupProfile()`, `getProPricing()`, `formatPrice()`, `openCookiePreferences()`.
- Produces: `resolveHomeDestination({ signedIn: boolean, organizationId: string | null, pendingInvitationId: string | null }): string | null` — `null` means "render the landing"; otherwise `/dashboard`, `/accept-invitation/<id>` or `/onboarding` (today's order).
- Produces `<SiteFooter />` used by Task 5: links to `/legal/notice`, `/legal/terms`, `/legal/privacy`, `/legal/cookies`, and a "Manage cookies" button.
- Messages `Storefront`: `defaultName`, `hero.headline`, `hero.subheadline` (neutral boilerplate copy), `cta` (`Commencer` / `Get started`), `priceMonthly`/`priceYearly` with `{price}`, `trial` with `{days}`, `vat.franchise` (`TVA non applicable, art. 293 B du CGI`), `vat.included` (`TTC`), `signIn`.

- [ ] **Step 1: Write failing tests** for `resolveHomeDestination`: signed out → `null`; with org → `/dashboard`; no org + invite `inv_1` → `/accept-invitation/inv_1`; no org, no invite → `/onboarding`.
- [ ] **Step 2: Run** `pnpm vitest run 'src/app/(public)/home-destination.test.ts'` — FAIL.
- [ ] **Step 3: Implement.** Hero: headline, one sentence, one `Button` linking to `/sign-in` with the price line under it (trial wording only when `trialDays > 0`; VAT mention from `vatRegime(profile.legal)`). Header: `BrandLogo` + "Se connecter". Name shown is `profile.name || t('defaultName')`.
- [ ] **Step 4: Run** — PASS; `pnpm dev`: signed out `/` shows the landing; signed in keeps the redirects.
- [ ] **Step 5: Commit** `feat(storefront): add the public landing page`

### Task 5: Legal pages

**Files:**
- Create: `src/app/(public)/legal/[page]/page.tsx`, `src/shared/storefront/publisher.ts` (+ test)
- Modify: messages (`Legal` namespace: `notice`, `terms`, `privacy`, `cookies`, each with `title` and section strings using `{placeholders}`)

**Interfaces:**
- Consumes: `getStartupProfile()`, `<SiteFooter />`, `openCookiePreferences()` (cookies page has a "Manage cookies" button).
- Produces: `LEGAL_PAGES = ['notice', 'terms', 'privacy', 'cookies'] as const`, `isLegalPage(slug): slug is LegalPage`, `resolvePublisher(legal): { kind: 'individual'; name; contactEmail } | { kind: 'company'; name; form; address; siren; rcs?; vatNumber?; shareCapital?; publicationDirector; contactEmail }`. Terms use `vatRegime` from Task 2.
- Content (messages, French and English): notice = publisher block (individual or company), publication director, host `Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis`; terms = seller, subscription and price from Task 2, trial, cancellation at any time effective at period end, refunds, the 14-day withdrawal right and its express waiver for immediate execution, governing law (French); privacy = controller, data collected (Google account name and email, organization, billing via Autumn/Stripe, analytics only with consent), purposes, retention, rights (access, rectification, erasure, portability, objection, CNIL complaint), sub-processors Supabase, Vercel, PostHog, Dash0, Resend or the SMTP provider, Autumn, Stripe, Google; cookies = what is set (session, consent, PostHog only after consent), 180-day consent, the manage button. Each page ends with "Version {termsVersion}" for terms only.

- [ ] **Step 1: Write failing tests:** `isLegalPage('terms')` true, `isLegalPage('foo')` false; `resolvePublisher` on the neutral legal block → `{ kind: 'individual', name: '', contactEmail: '' }`; on a company → `kind: 'company'` with its fields.
- [ ] **Step 2: Run** `pnpm vitest run src/shared/storefront/publisher.test.ts` — FAIL.
- [ ] **Step 3: Implement**; unknown slug → `notFound()`; empty fields are not rendered.
- [ ] **Step 4: Run** — PASS; `pnpm dev`: the four pages render in `fr` and `en`.
- [ ] **Step 5: Commit** `feat(storefront): add French-law legal pages`

### Task 6: Recorded acceptance of the terms at checkout

**Files:**
- Create: `src/infra/database/schema/billing-schema.ts` (table `terms_acceptance`: `id` text pk, `userId` text not null, `organizationId` text not null, `termsVersion` text not null, `acceptedAt` timestamp not null default now), generated migration under `drizzle/`
- Create: `src/infra/data-access/billing/terms-acceptance-repo.ts`, `src/application/billing/accept-terms.ts` (+ test), `src/app/api/billing/accept-terms/route.ts` (+ `test/app/api/billing/accept-terms/route.test.ts`)
- Modify: `src/infra/database/connection.ts` (add the billing schema), `scripts/boundaries/manifest.mjs` (billing: add `src/infra/data-access/billing` to dirs, `src/infra/database/schema/billing-schema` to schemas), `src/app/(app)/paywall/components/paywall-view.tsx`, messages (`Paywall.acceptTerms`, `Paywall.acceptTermsError`)

**Interfaces:**
- Produces `recordTermsAcceptance({ id, userId, organizationId, termsVersion }): Promise<Result<void, AppError>>`.
- Produces `acceptTerms(): Promise<Result<{ termsVersion: string }, AppError>>` — reads the current user and organization, uses `getStartupProfile().legal.termsVersion`, logs start/success/failure.
- Produces `POST /api/billing/accept-terms` → `200 { termsVersion }`, `401` signed out, `500` on failure; uses `requireAuthedRoute` with rate limiting like the other authed routes.
- Paywall: a shadcn `Checkbox` with label "J'accepte les CGV et je demande l'accès immédiat au service, en renonçant à mon droit de rétractation." (link to `/legal/terms`); the upgrade button is disabled until ticked; on click it POSTs the route and calls `attach({ planId: 'pro' })` only on `200`, otherwise shows `acceptTermsError`.

- [ ] **Step 1: Write failing tests:** `acceptTerms` records the profile's `termsVersion` with the current user and organization and returns it; returns an error and records nothing when signed out; propagates a repo error. Route: `200` with `termsVersion`, `401` signed out, `500` on use-case error.
- [ ] **Step 2: Run** `pnpm vitest run src/application/billing/accept-terms.test.ts test/app/api/billing/accept-terms` — FAIL.
- [ ] **Step 3: Implement**, then `pnpm drizzle:generate` (a dummy local `DATABASE_URL` is enough; it does not connect).
- [ ] **Step 4: Run** the tests — PASS; `pnpm check:boundaries` — "Domain boundaries OK."
- [ ] **Step 5: Commit** `feat(billing): record terms acceptance before checkout`

### Task 7: Legal-identity gate and skill docs

**Files:**
- Create: `scripts/check-legal-identity.mjs` (+ `test/scripts/check-legal-identity.test.ts`)
- Create: `.claude/skills/create-startup/references/01d-storefront.md`
- Modify: `.claude/skills/create-startup/SKILL.md` (step list: 1d after 1c), `01b-set-pricing.md` (`pricing.currency`), `06-deploy-production.md` (6f: run the gate before live), `data-region.md` (French-law set for every startup; `gdpr`/`dataRegion` decide only regions), `DESIGN.md` (accent is per-startup, set by `brand.css`), `CLAUDE.md` (included base mentions the storefront and legal pages)

**Interfaces:**
- Produces `checkLegalIdentity(config): { ok: true } | { ok: false; missing: string[] }` and a CLI printing `OK  legal identity complete` or `MISSING  legal.company.siren, …` with exit 1.
- `01d-storefront.md` tells Claude to: ask only the founder's full name and contact email; derive from `idea` a headline and one sentence (fr and en, written into the `Storefront.hero` messages), a lucide icon name and one accent hex; write `brand`, `legal` (company `null`, `termsVersion` = today's date) into `startup.config.json`; run `node scripts/sync-startup-profile.mjs`; check `/` and `/legal/notice` in the browser; tell the founder the legal texts are templates to have reviewed. When the company exists later: fill `legal.company`, bump `termsVersion`, re-run the sync.

- [ ] **Step 1: Write failing tests:** a config with `legal.company: null` → `{ ok: false, missing: ['legal.company'] }`; a company missing `siren` → missing contains `legal.company.siren`; a micro-entrepreneur without `rcs` and `vatNumber` → `{ ok: true }`.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/check-legal-identity.test.ts` — FAIL.
- [ ] **Step 3: Implement** the script and write the docs.
- [ ] **Step 4: Run** — PASS; then `pnpm validate` — green.
- [ ] **Step 5: Commit** `feat(skill): add the storefront step and the live-mode legal gate`
