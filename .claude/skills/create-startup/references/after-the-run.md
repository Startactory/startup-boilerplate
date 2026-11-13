# After the run — founder-driven paths

Phase 2 never reaches these. Each one is interactive and runs with the founder present: ask their
go-ahead before an OAuth consent, a key, a push to production or anything that costs money. Start
here directly when the founder asks for one of them on a startup that already ran ("set my
pricing", "go live", "add my domain", "take the boilerplate's fixes").

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
   AUTUMN_PROD_SECRET_KEY=op://startup-<slug>/production/AUTUMN_SECRET_KEY node scripts/with-vault.mjs run -- pnpm exec atmn push -p --yes
   ```

   `pnpm exec` runs the atmn 1.x that `package.json` pins; `pnpm dlx atmn` would fetch atmn 2,
   which refuses this config.

   Success ends with the products listed as pushed to production. If `atmn` still reads the
   sandbox key from `.env`, stop and report it rather than push to the wrong environment.
6. **Push the env again**: `node scripts/push-env-to-vercel.mjs --file .env.prod`, then the same
   with `--apply`.
7. **Redeploy**: commit the item 1 changes (`startup.config.json` and the synced profile) on a
   branch and merge its PR; CI migrates and deploys. With nothing to commit, redeploy the current
   production deployment from the Vercel dashboard. Then run the smoke test as
   `06-deploy-production.md` 6j item 2 says: `git switch master && git pull --ff-only`, wait for
   the build, then `node scripts/smoke-test.mjs`.
8. **Live checks**, with the founder present. The founder runs a real checkout on the live URL with
   their own card (a small live charge, or a Stripe test clock) to confirm Autumn end-to-end; you
   never enter a card. Then confirm that PostHog receives production events, and that the Dash0
   dataset shows production logs from service `<slug>` with traces linked. Serverless functions
   can freeze before a batch is sent: if requests show in Vercel's logs but not in Dash0, report
   it rather than assume it works.

## A custom domain, with Resend

The founder buys the domain (a purchase: theirs). Then, with the founder's go-ahead at each step:

1. Write it in `startup.config.json` `domain`. Keep `productionUrl`: the `*.vercel.app` URL keeps
   working.
2. **Vercel**: Project, Settings, Domains, add the domain, then the DNS records Vercel shows.
3. **App URL**: `node scripts/init-env.mjs --apply --file .env.prod --app-url "https://<domain>"`.
   Better Auth `trustedOrigins`, secure cookies, OAuth redirects and email links key off it; a
   wrong value gives sign-in loops.
4. **Google**: open the console on the founder's account
   (`https://console.cloud.google.com/auth/overview?project=<googleCloudProject>&authuser=<googleAccount>`);
   in the `<name>` client (not `(local)`), add `https://<domain>/auth/callback/google`. The client
   page can show the client secret: narrow `find` queries only. Then, in **Branding**, point the
   three app links to the domain (home page `https://<domain>`, privacy policy
   `https://<domain>/legal/privacy`, terms of service `https://<domain>/legal/terms`) and add
   `<domain>` to the authorized domains.
5. **Google brand verification.** Until Google verifies the brand, its consent screen shows the
   domain instead of the app name. Verification needs a domain the founder owns, so it waits for
   this section (a `*.vercel.app` domain cannot be verified):
   1. Verify `<domain>` in Google Search Console with the same Google account
      (`https://search.google.com/search-console?authuser=<googleAccount>`): add a Domain
      property and the TXT record it shows to the domain's DNS, like the records of item 2, then
      click "Verify".
   2. In the Google Auth Platform, **Verification Center**, submit the brand for verification.
      Google reviews it; once it is verified, the consent screen shows the app name.
6. **Resend**: create the `RESEND_FULL_ACCESS_API_KEY` master key as `00-founder-setup.md` item 6
   does; add the domain in Resend in the region `data-region.md` gives, add its DNS records, and
   wait for "verified". Then `node scripts/providers/resend-keys.mjs`, which prints
   `OK  Resend local <state>, production <state>, scoped to <domain>, stored in …` and switches
   `EMAIL_PROVIDER` to `resend` in both items: the Gmail app password is no longer used.
7. Push the env (item 6 of "Go live"), merge a PR to redeploy, then, as
   `06-deploy-production.md` 6j item 2 says, `git switch master && git pull --ff-only`, check
   the build, and `node scripts/smoke-test.mjs --url https://<domain>`.

## Changing the price of an existing startup

1. Follow `01b-set-pricing.md`: change the `pro` plan in `autumn.config.ts` and the `pricing`
   block in `startup.config.json`. The currency must stay the Autumn organization's default.
2. The terms of sale show the price, the trial and the currency. On any change to `price`,
   `trialDays` or `currency`, bump `legal.termsVersion` to today's date and run
   `node scripts/sync-startup-profile.mjs`, so customers accept the new terms.
3. `pnpm exec atmn push --yes` pushes the sandbox, which production uses until go-live. After
   go-live, also run the production push of "Go live" item 5.
4. Commit on a branch and merge its PR: CI deploys the new price and terms.

## Taking boilerplate fixes

The boilerplate stays the fetch-only remote `upstream` (`01c-create-repository.md` section 4) and
keeps getting fixes. Take them on a branch, and ask the founder's go-ahead before merging the PR:
the merge deploys to production. Run every `node` and `pnpm` command with the `.nvmrc` version on
`PATH` (`03-install-and-secrets.md` 3a item 1); upstream may change `.nvmrc`, so after the merge,
install the new version once if its directory is missing. Below, `<repository>` is
`startup.config.json` `repository` and `<YYYY-MM-DD>` today's date.

1. **The merge driver.** `git config merge.ours.driver` must print `true`; otherwise run
   `git config merge.ours.driver true` (one time per clone, `01c-create-repository.md` 4.4).
   Without it, the three generated files below conflict.
2. **Merge upstream on a branch**, from the deployed `master`:

   ```bash
   git switch master && git pull --ff-only
   git fetch upstream
   git switch -c chore/boilerplate-fixes-<YYYY-MM-DD>
   git merge upstream/master
   ```

3. **Resolve what still conflicts** (`git diff --name-only --diff-filter=U` lists it). The three
   generated files, `src/shared/startup-profile/profile.json`, `src/app/brand.css` and
   `public/brand-logo.png`, do not: `.gitattributes` marks them `merge=ours`, so the merge keeps
   the startup's copies and item 4 regenerates them. The likely conflicts:
   - `autumn.config.ts`: keep the startup's `pro` plan (its price and trial), and take upstream's
     other changes.
   - `src/i18n/messages/en.json` and `src/i18n/messages/fr.json`: keep the startup's
     `Storefront.hero` values (`headline`, `subheadline`), and take upstream's new and changed
     keys. Both files keep the same shape.
   - `package.json`: keep the startup's `name` (the slug), and take upstream's other changes.
   - tests and scripts (`*.test.ts`, `test/**`, `scripts/**`): take upstream's version,
     `git checkout --theirs -- <path>`.

   `git add` each resolved file, then `git commit --no-edit`.
4. **Regenerate the profile.** `pnpm install` (upstream may change the dependencies), then
   `node scripts/sync-startup-profile.mjs`: it regenerates the three generated files from
   `startup.config.json`, with any profile key upstream added, and ends with
   `OK  startup profile synced (<name>)`. On a `FAIL` line, add the field it names to
   `startup.config.json` and run it again. Commit the result (nothing to commit is fine):

   ```bash
   git add startup.config.json src/shared/startup-profile/profile.json src/app/brand.css public/brand-logo.png
   git commit -m "chore: sync the startup profile"
   ```

5. **`pnpm validate`** must be green.
6. **Open the PR and merge it** once its checks are green and the founder said go. Merge with a
   merge commit (`--merge`), never a squash or a rebase: the merge commit records upstream's
   history, so the next `git merge upstream/master` brings only the newer fixes.

   ```bash
   git push -u origin chore/boilerplate-fixes-<YYYY-MM-DD>
   gh pr create --repo "<repository>" --base master --fill
   gh pr checks <number> --repo "<repository>" --watch
   gh pr merge <number> --repo "<repository>" --merge --delete-branch
   ```

7. **Deploy and check.** CI applies any migration upstream added (`migrate`), then
   `production.yml` deploys; a green `production.yml` run means production serves the merge
   (`06-deploy-production.md` 6j item 1). Then run the smoke test as 6j item 2 says:
   `git switch master && git pull --ff-only`, check the build, `node scripts/smoke-test.mjs`.

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
