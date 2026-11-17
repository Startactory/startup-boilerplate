# Step 5 — Verify locally

**Phase 2, step `verify-local`.** The app must run and pass the repo's done-gate before you deploy.
`CLAUDE.md` defines the gate as `pnpm validate`. Claude does every check here, the browser part
included; the founder is not involved.

## 5a. Apply the database schema

Migrations are generated and committed under `drizzle/`. Apply them to the **local** Postgres from
Step 3:

```bash
pnpm drizzle:migrate
```

If it can't connect, check that the local Postgres is running and that `.env` has
`DATABASE_URL=…localhost:5432/<slug>` with `DATABASE_SSL=allow`. `drizzle.config.ts` reads the same
env, so a good `.env` is enough. The production database is migrated by CI in Step 6, never from
here.

## 5b. Boot and check in the browser

1. `pnpm dev` (Next 16 + Turbopack) in the background. There is no `next-devtools` MCP in a run:
   read the dev server's output to diagnose anything that fails.
2. Load the Chrome tools in one ToolSearch call and read the `chrome-browser` skill, then use Claude
   in Chrome on `http://localhost:3000`.
3. First, signed out, check the storefront from Step 1d: open `/` and `/legal/notice` in both
   languages. Chrome keeps `localhost` cookies across startups, so an earlier startup run on this
   machine leaves `LOCALE` and `cookie_consent`, which hide the default language and the cookie
   banner. Before the first look, on `http://localhost:3000`, delete those two cookies with
   `javascript_tool` (`document.cookie = 'LOCALE=; Max-Age=0; path=/'`, the same for
   `cookie_consent`), then reload: the page must open in `defaultLocale`. In `pnpm dev`, the first
   language switch compiles `/api/locale` for 10 to 20 seconds: wait for the page to come back in
   the other language before reading it. The headline and sentence read well, the button shows the
   right price and trial, the accent and logo render, the legal notice names the founder and the
   contact email, and the cookie banner appears (refuse it: nothing in this check needs
   analytics). If anything is wrong,
   fix the copy or the config, re-run `node scripts/sync-startup-profile.mjs`, commit the change on
   `master`, and look again.
4. Sign in with **Google** as `googleAccount` (email/password is disabled — Google is the only
   provider unless Microsoft was configured). The start line's consent covers signing in to the app
   with the founder's account, Google's consent screen included.
5. Create the organization on the onboarding page (it asks only for a name; use the startup's
   name, or reuse it on a re-run) and reach the paywall: the terms checkbox and the upgrade
   button show, with no Autumn error in the browser console or the dev server's output. Stop there;
   the dashboard behind the paywall is an empty page by design, and no checkout runs here.
6. Stop `pnpm dev`.

## 5c. Pass the gate

```bash
pnpm validate
```

This runs `type-check && check (biome) && lint && check:boundaries && test`. It must be green
before deploying. If the domain-boundaries checker complains, fix the ownership/edges in
`scripts/boundaries/manifest.mjs` rather than working around it — see `CLAUDE.md`.

Then `node scripts/run-ledger.mjs done verify-local`.
