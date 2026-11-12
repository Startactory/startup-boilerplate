# Public storefront (roadmap item 5) — design

Date: 2026-11-12. Status: agreed with the founder in chat (brainstorming), reviewed by a builder
check, pending the founder's approval of this document.

## Intent

The boilerplate's promise is "one prompt to a running company". Today `/` redirects straight to
`/sign-in`: a stranger who lands on a new startup's site sees a login box, with no idea what the
product is, what it costs, or who runs it. And a French company cannot sell online without legal
pages, nor load analytics cookies without consent.

This step gives every startup made from the boilerplate a **minimal public storefront**, with
copy and branding that Claude generates from the founder's idea, plus French-law legal pages and a
cookie consent banner. It is the smallest storefront that lets a stranger understand the product
in 30 seconds and start paying.

## Goals

1. A public landing page at `/` for signed-out visitors (the founder chose the minimal version):
   - a header with the logo, the startup name and a "Sign in" link;
   - a headline (what the product does, for whom) and one supporting sentence, generated from the
     idea;
   - one call-to-action button showing the `pro` price and the trial length, read from the
     pricing in `startup.config.json` (step 1b). It leads to Google sign-in, then onboarding
     (organization name), then the Autumn paywall;
   - a footer with links to the legal pages and "Manage cookies".
   A signed-in visitor on `/` keeps today's behavior: sent to the dashboard (or onboarding, or a
   pending invitation).
2. Branding per startup: a logo made of one `lucide` icon chosen from the idea next to the
   startup name (an SVG), and one accent color derived from the idea that replaces the single
   accent of `DESIGN.md` (today charcoal). The founder can replace both later.
3. Legal pages, in French and English:
   - **Legal notice** ("mentions légales"): publisher, publication director, host (Vercel).
   - **Terms of sale** ("CGV"): subscription, trial, cancellation, refunds; for consumers, the
     14-day withdrawal right and the express waiver for a digital service started at once.
   - **Privacy policy**: data collected, purposes, retention, user rights, and the sub-processors
     listed in `references/data-region.md` (Supabase, Vercel, PostHog, Dash0, Resend or the SMTP
     provider, Autumn, Stripe, Google).
   - **Cookies**: the same choices as the banner, reachable from the footer at any time.
4. A cookie consent banner. "Refuse" and "Accept" are equally prominent (CNIL rule), plus
   "Customize". PostHog must not start, or set cookies, before consent.
5. Legal identity in two states, kept in `startup.config.json` under `legal`:
   - **Before the company exists** (the founder's usual case; Autumn is still in test mode, so
     nobody pays real money): the publisher shown is the founder as an individual, with a contact
     email and the host.
   - **After the company exists**: the founder gives company name, legal form, address, SIREN or
     RCS, VAT number and publication director. Claude writes them into `legal`; the pages pick
     them up with no other change.
   - **Gate**: step 6 refuses to switch Stripe to live mode while the company fields are empty.
     In France, charging real customers needs at least a registered activity (micro-entreprise),
     and Stripe live KYC asks for the seller's identity anyway.
6. A new skill step that produces all of the above for a new startup, from `idea`, `name` and
   `pricing` already in `startup.config.json`, without questions to the founder beyond the
   founder's name and contact email (needed for the pre-company legal notice).

## Non-goals

- The richer storefront (benefits, "how it works", FAQ, testimonials, blog). The founder can add
  them later; the boilerplate generates only the minimal page.
- Account deletion and data export (GDPR articles 17 and 20). They stay "needs action" in the
  `data-region.md` checklist.
- Turning the idea into product features (roadmap item 6, skipped).
- A custom domain (roadmap item 4, set aside).
- A logo designed by an image model, or any new SaaS for branding.
- Legal advice. The generated texts are templates the founder should have reviewed; the step says
  so.

## Anti-goals (a failure even if it works)

- A product name, pitch or legal identity hard-coded in the boilerplate's own UI. The boilerplate
  stays brand-neutral (`CLAUDE.md`); every startup-specific word comes from per-startup data.
- PostHog loading before consent when consent is required, or a banner where refusing is harder
  than accepting.
- Legal pages that claim a company that does not exist, or an empty legal notice.
- Copy generated in one language only, or `en.json` and `fr.json` out of shape.

## Constraints

- All rules in `CLAUDE.md`: layers, no server actions, route handlers only, `next-intl` for every
  user-facing string (with `en.json` as the type source and `fr.json` mirroring it), valibot at
  boundaries, no `process.env` outside `shared/env.ts` and the instrumentation files, no code
  comments except a short "why".
- UI uses the **shadcn** setup that is already there (`components.json`, style `base-nova` on
  Base UI, Tailwind v4, `lucide` icons) and the primitives in `src/components/ui/`. Missing
  primitives are added with `pnpm dlx shadcn add`, never written by hand. Styling follows
  `DESIGN.md` (light mode, layered off-whites, one accent color).
- Default locale is French, fallback English; locale comes from the `LOCALE` cookie (no
  `[locale]` in URLs).
- The boilerplate itself must still build and pass `pnpm validate` with neutral default content
  (no startup configured).
- No new infrastructure or SaaS.

## Decided

- Landing layout: version B (minimal), as described in goal 1.
- Logo: one `lucide` icon plus the startup name, as an SVG. Accent: one color from the idea.
- Legal pages: the four listed, French and English, with the two legal-identity states and the
  step 6 gate.
- Cookie banner: Refuse / Accept / Customize, Refuse as prominent as Accept, PostHog only after
  consent.
- shadcn components only.

## Settled after review — founder's answers

- **Accepting the terms of sale at checkout (founder chose option a).** The paywall shows a
  required checkbox: the customer accepts the terms of sale and, to use the service at once,
  expressly waives the 14-day withdrawal right. The subscribe button stays disabled until it is
  ticked. The acceptance is recorded before the checkout starts: user, organization, terms
  version, time. This needs a small table in the `billing` domain (today it owns none), a
  generated migration, and a route handler that records then hands over to Autumn. The terms
  version changes whenever the generated terms change.
- **Founders are established in France (Claude's recommendation, not contradicted).** So every
  startup gets the same French-law set, whatever `dataRegion` says: the legal pages, the cookie
  banner, PostHog gated on consent, and the GDPR baseline (GDPR applies to a French company even
  when its data sits in the US). `gdpr`/`dataRegion` keep deciding only the service regions;
  `data-region.md` is updated to say so.

## Settled after review (Claude's calls, marked as such)

- **`startup.config.json` is committed** in each startup repository (it is not gitignored, and
  step 1c pushes it). The app may read it at build time; with no file (the boilerplate itself) it
  falls back to neutral defaults. *(fact checked in the repo)*
- **The price shown comes from `autumn.config.ts`** (the `pro` plan's `price`), the code that
  bills, so there is one source of truth for the amount and interval. The currency is a new
  `pricing.currency` field in `startup.config.json` (default `EUR`), written by step 1b. The
  button shows the trial and the price after it ("14 days free, then 19 €/month"). *(Claude's
  call)*
- **Tax mention** follows the legal state: before the company, and for a micro-entrepreneur under
  the VAT franchise, "TVA non applicable, art. 293 B du CGI"; for a VAT-registered company, prices
  are shown tax included ("TTC"). `legal.vatNumber` present means VAT-registered. *(Claude's
  call)*
- **Pre-company terms of sale** are shown in full with the founder as the seller; nobody pays real
  money while Autumn is in test mode. *(Claude's call)*
- **The step 6 gate** requires, for live mode: legal name, legal form, address, SIREN, publication
  director, contact email. RCS and VAT number stay optional, so a micro-entrepreneur passes. The
  check is a small script that step 6f runs and that validates `legal` with valibot. *(Claude's
  call)*
- **Consent scope**: before consent, no `posthog.init` and no `posthog.identify`. "Refuse" turns
  PostHog off entirely (no cookieless mode). `captureServerEvent` has no caller today; it gets the
  same rule (send only with consent) if a caller is added. *(Claude's call)*
- **The accent applies to the whole app**, storefront and dashboard, by remapping the existing
  accent tokens; `DESIGN.md` describes the accent as per-startup. *(Claude's call)*
- **Signed-in visitors on `/`** keep today's redirects (dashboard, onboarding, or pending
  invitation). *(answered by the spec)*

## Left to the builder

- Route paths for the legal pages, and how the footer links reach them.
- How per-startup data (name, logo icon, accent, headline, legal identity, pricing shown on the
  button) flows from `startup.config.json` into the app: a generated typed module, i18n messages,
  env values, or a mix. It must be validated at the boundary and must leave the boilerplate
  neutral by default.
- Where generated copy lives (i18n message files are the expected home).
- How the accent color maps onto the existing CSS tokens, and how a contrast check is done.
- The new skill step's file name and position (after 1b is the natural place: it needs `idea` and
  `pricing`), and the step 6 gate wording.
- Tests: what to unit-test (consent gating of PostHog, legal-identity states, the step 6 gate
  check) and what to check by running the app.
