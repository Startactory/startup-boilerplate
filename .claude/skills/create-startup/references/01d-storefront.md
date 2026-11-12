# Step 1d — Build the storefront

Give the startup a public landing page at `/`, French-law legal pages, and a cookie banner, all
generated from `idea`, `name` and `pricing` already in `startup.config.json`. Ask the founder only
for their **full name** and a **contact email**: the legal notice needs them before any company
exists.

The boilerplate stays brand-neutral. Everything startup-specific lives in `startup.config.json`
and the `Storefront` i18n messages, never in components.

## Tell the founder up front

- The legal texts (legal notice, terms of sale, privacy policy, cookies) are **templates**. Have
  them reviewed before selling for real.
- Going live with consumer sales (Step 6f) needs a **named consumer mediator** (French consumer
  code) and a **legal review of the generated templates**. The mediator cannot be named before the
  company exists, so this is expected to wait: until then Autumn stays in test mode and nobody pays
  real money.
- Founders are established in France, so this French-law set applies to every startup, whatever
  `dataRegion` says (see `references/data-region.md`).

## What the boilerplate already provides

- Landing at `/` for signed-out visitors (`src/app/(public)/page.tsx`): header with logo, name and
  "Sign in", a headline, one sentence, one button, a footer. Signed-in visitors keep today's
  redirects (dashboard, onboarding, pending invitation).
- Under the button, one line is composed from the `Storefront` messages: the price (`priceMonthly`
  or `priceYearly`), the VAT mention (`vat.franchise`, or `vat.included` for a VAT-registered
  company) and, when there is a trial, `trial`, joined with " · ". The amount, interval and trial
  come from `autumn.config.ts` (`pro.price`, `pro.freeTrial`); the currency comes from
  `pricing.currency`.
- Legal pages `/legal/notice`, `/legal/terms`, `/legal/privacy`, `/legal/cookies`, in French and
  English, with a cookie banner (Refuse and Accept equally prominent, plus Customize). PostHog does
  not start, or identify anyone, before consent (`src/lib/analytics.ts`,
  `src/instrumentation-client.ts`).
- At checkout the paywall requires ticking the terms of sale and the waiver of the 14-day
  withdrawal right. Each acceptance is stored (`terms_acceptance`, `POST /api/billing/accept-terms`)
  with `legal.termsVersion`.

## 1. Gather

Read `startup.config.json` for `name`, `idea` and `pricing`. If `legal.founderName` or
`legal.contactEmail` are not there yet, ask for them in one plain question, nothing else.

## 2. Derive the copy and the brand from the idea

- **Copy**, in French and in English: a headline (what the product does, for whom) and one
  supporting sentence. Write them into `Storefront.hero.headline` and `Storefront.hero.subheadline`
  in both `src/i18n/messages/en.json` and `src/i18n/messages/fr.json`. Keep the two files the same
  shape.
- **Icon**: one lucide icon name that fits the idea (PascalCase, for example `Receipt`). The
  sync script rejects a name that is not a `lucide-react` icon.
- **Accent**: one `#rrggbb` hex that fits the idea. The sync script derives the hover, soft and
  ring tokens and writes them to `src/app/brand.css`. Pick one with enough contrast against white
  for a button background.

Never put the startup name in a component or in a message other than through `name`.

## 3. Write the configuration

Add `brand` and `legal` to `startup.config.json` (keep the existing fields), and `currency` to
`pricing` if Step 1b did not write it:

```json
{
  "brand": { "icon": "Receipt", "accent": "#2f6f5e" },
  "legal": {
    "termsVersion": "2026-11-12",
    "founderName": "Ada Lovelace",
    "contactEmail": "ada@example.com",
    "company": null
  }
}
```

`termsVersion` is today's date (`YYYY-MM-DD`). `company` stays `null` until the company exists.

Do **not** run the sync yet: `scripts/sync-startup-profile.mjs` imports `lucide-react` and
`valibot`, which exist only after `pnpm install`. Step 3a runs it right after the install. It
writes `src/shared/startup-profile/profile.json` and `src/app/brand.css` and ends with
`OK  startup profile synced (<name>)`; a `FAIL` line names the invalid field (`brand.icon`,
`brand.accent`, `pricing.currency`, `legal.*`). Do not edit those two generated files by hand.

## 4. Browser check (later)

The pages cannot be looked at yet: the app does not boot until Step 5 (`pnpm dev` is forbidden
before then). Step 5b opens `/` and `/legal/notice` and checks them; if anything is wrong there,
fix the copy or the config, re-run the sync (`node scripts/sync-startup-profile.mjs`) and look
again.

## 5. When the company exists

Later, once the company is registered, ask for the company details and write them into
`legal.company`:

```json
"company": {
  "name": "Acme SAS",
  "form": "SAS",
  "address": "1 rue de Rivoli, 75001 Paris",
  "siren": "123456789",
  "publicationDirector": "Ada Lovelace",
  "mediator": "<name and contact details of the consumer mediator>",
  "rcs": "Paris B 123 456 789",
  "vatNumber": "FR12123456789"
}
```

`rcs`, `vatNumber` and `shareCapital` are optional (a micro-entrepreneur has none of them).
`vatNumber` present means the company is VAT-registered, so prices are shown tax included. Then:

1. Bump `legal.termsVersion` to today's date, because the terms changed.
2. Re-run `node scripts/sync-startup-profile.mjs`. The terms then name the mediator in the
   "Disputes and mediation" article; without a mediator they say it is given on request.

Step 6f runs `node scripts/check-legal-identity.mjs` and refuses to go live until it prints `OK`.
