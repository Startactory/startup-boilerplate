# After the run — founder-driven paths

Phase 2 never reaches these. Each one is interactive and runs with the founder present: ask their
go-ahead before an OAuth consent, a key, a push to production or anything that costs money. Start
here directly when the founder asks for one of them on a startup that already ran ("set my
pricing", "go live", "add my domain").

These paths change `startup.config.json` in ways the phase 2 preflight refuses (`legal.company`
set, a `domain`). That is expected: phase 2 is over.

## Go live (real payments)

It needs the company registered, a named consumer mediator (French consumer code) and a legal
review of the generated templates. Until then production stays on the Autumn sandbox.

1. **Legal gate.** `node scripts/check-legal-identity.mjs` prints `OK  legal identity complete`
   or `MISSING  <fields>`. On `MISSING`, ask the founder in one question for the company details:
   legal name, legal form, address, SIREN, publication director and the named consumer mediator
   (RCS, VAT number and share capital are optional). Write them into `legal.company` (shape in
   `01d-storefront.md` section 5), bump `legal.termsVersion` to today's date, run
   `node scripts/sync-startup-profile.mjs`, and run the gate again. A `vatNumber` switches the
   storefront to tax-included prices.
2. **The startup's own Stripe account.** The founder creates it under their Stripe login (Stripe
   dashboard, account name, **New account**; never reuse another startup's) and completes the KYC
   (business details, bank account). Payouts stay blocked until the KYC is done.
3. **Connect it in live mode** in the startup's Autumn organization (Claude in Chrome, with the
   founder's go-ahead).
4. **Production on the live key.** `node scripts/providers/autumn-login.mjs --live`, and approve
   its `OPEN` URL as `04-provision-services.md` 4e does. Success:
   `OK  Autumn sandbox key stored in startup-<slug>/local, production uses the live key`.
   `no live Autumn key in .env` means Stripe is not connected live yet: back to item 3.
5. **Push the plans to production.** `op run` resolves the reference for this one command, so the
   key is never printed:

   ```bash
   AUTUMN_PROD_SECRET_KEY=op://startup-<slug>/production/AUTUMN_SECRET_KEY node scripts/with-vault.mjs run -- pnpm dlx atmn push -p --yes
   ```

6. **Push the env again**: `node scripts/push-env-to-vercel.mjs --file .env.prod`, then the same
   with `--apply`.
7. **Redeploy**: commit the item 1 changes (`startup.config.json` and the synced profile) on a
   branch and merge its PR; CI migrates and deploys. With nothing to commit, redeploy the current
   production deployment from the Vercel dashboard. Then `node scripts/smoke-test.mjs`.

## A custom domain, with Resend

The founder buys the domain (a purchase: theirs). Then, with the founder's go-ahead at each step:

1. Write it in `startup.config.json` `domain`. Keep `productionUrl`: the `*.vercel.app` URL keeps
   working.
2. **Vercel**: Project, Settings, Domains, add the domain, then the DNS records Vercel shows.
3. **App URL**: `node scripts/init-env.mjs --apply --file .env.prod --app-url "https://<domain>"`.
   Better Auth `trustedOrigins`, secure cookies, OAuth redirects and email links key off it; a
   wrong value gives sign-in loops.
4. **Google**: in the `<name>` client (not `(local)`), add `https://<domain>/auth/callback/google`,
   and point the app's home page and privacy policy to the domain. The page can show the client
   secret: narrow `find` queries only.
5. **Resend**: create the `RESEND_FULL_ACCESS_API_KEY` master key as `00-founder-setup.md` item 6
   does; add the domain in Resend in the region `data-region.md` gives, add its DNS records, and
   wait for "verified". Then `node scripts/providers/resend-keys.mjs`, which prints
   `OK  Resend local <state>, production <state>, scoped to <domain>, stored in …` and switches
   `EMAIL_PROVIDER` to `resend` in both items: the Gmail app password is no longer used.
6. Push the env (item 6 of "Go live"), merge a PR to redeploy, then
   `node scripts/smoke-test.mjs --url https://<domain>`.

## Changing the price of an existing startup

1. Follow `01b-set-pricing.md`: change the `pro` plan in `autumn.config.ts` and the `pricing`
   block in `startup.config.json`. The currency must stay the Autumn organization's default.
2. The terms of sale show the price, the trial and the currency. On any change to `price`,
   `trialDays` or `currency`, bump `legal.termsVersion` to today's date and run
   `node scripts/sync-startup-profile.mjs`, so customers accept the new terms.
3. `pnpm dlx atmn push --yes` pushes the sandbox, which production uses until go-live. After
   go-live, also run the production push of "Go live" item 5.
4. Commit on a branch and merge its PR: CI deploys the new price and terms.

## Optional MCP connectors (later interactive work)

The run needs none. Add them only when the founder asks: they are persistent configuration.
`--scope project` writes `.mcp.json` (URLs, no secrets), which is committed:

| Service | Add command |
| --- | --- |
| Supabase | `claude mcp add --scope project --transport http supabase https://mcp.supabase.com/mcp` |
| Autumn | `claude mcp add --scope project --transport http autumn https://mcp.useautumn.com/mcp` |
| PostHog | `claude mcp add --scope project --transport http posthog https://mcp.posthog.com/mcp` |
| Resend | `claude mcp add --scope project --transport http resend https://mcp.resend.com/mcp` |
| Vercel | `claude mcp add --scope project --transport http vercel https://mcp.vercel.com` |

The Next.js devtools server is local stdio and connects only to a running `pnpm dev`: add
`"next-devtools": { "command": "pnpm", "args": ["dlx", "next-devtools-mcp@latest"] }` under
`mcpServers` in `.mcp.json`.

The founder authenticates each server with `/mcp` (select it, **Authenticate**, finish the browser
sign-in), from a regular terminal rather than an embedded IDE terminal. Each grants the same
access as their own account on that service, so they approve only what they recognize. Check with
`claude mcp list`. Better Auth's "MCP plugin" is not a connector: it turns the app into an OAuth
provider for MCP clients.
