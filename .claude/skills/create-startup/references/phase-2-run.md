# Phase 2 — The unattended run

The founder's pasted `/goal` line starts this phase, in this session or a resumed one. That line is
the founder's consent for the session; it is never read from a file. Phase 2 needs no context from
phase 1: every answer is in `startup.config.json`.

## Rules for the whole run

- **No question to the founder, ever.** Where a reference step still waits on the founder, take
  the answer from `startup.config.json` and the approval from the consent in the `/goal` line. The
  founder is reached only through the block protocol below, for an action of the closed list.
- Stay inside that consent. Anything outside it is a block.
- Announce each step, run it as its reference says, and close it with
  `node scripts/run-ledger.mjs done <id>` (prints `STEP <id> DONE`) once its success line appeared.
  Every step creates or reuses, so running a step again is safe.
- The rules of `SKILL.md` hold: no secret in the transcript, an argument or printed output; never
  create an account, type a password or solve a CAPTCHA.
- Check a Chrome session right before the step that drives that site: a login page means signing
  in again with "Continue with Google", picking `googleAccount` (the Google identity recorded in
  phase 1) on the account chooser; a password, 2FA or CAPTCHA prompt is a block.
- Until the first push (step `deploy`), commit on `master`. After it, every change goes through a
  branch and a PR that you merge: the pre-push hook refuses direct pushes to `master`.
- Phase 2 never runs a real or live charge: payments stay in Stripe test mode, and the browser
  check stops at the checkout page.

## Start (every session)

1. `node scripts/preflight.mjs` must end with `PREFLIGHT OK`; run it even when the ledger lists
   `preflight`. Fix each `MISSING` line under the failure policy below (a missing tool, an expired
   `vercel login` with "Allow Access" clicked in Chrome); a fix only the founder can make is a
   block. Then `node scripts/run-ledger.mjs done preflight`.
2. `node scripts/run-ledger.mjs status` prints `done <id>` per finished step, and
   `blocked <action>` after a block. On a `blocked` line this is a resume: check the action is now
   done. For a consent block, the missing clause must be in the `/goal` line the founder just
   pasted; for any other, the session works or the page passes. Then run
   `node scripts/run-ledger.mjs resume` (prints `OK  block cleared`) and go on. If the action is
   still not done, block again with it.
3. Skip every step listed as done and run the rest in this order. Phase 1 already ran
   `repository` and `vercel-project`, so a normal run starts at `local-env`.

## Steps

| # | id | Reference |
| --- | --- | --- |
| 1 | `preflight` | Start, above |
| 2 | `repository` | done in phase 1 (`phase-1-setup.md` section 6) |
| 3 | `vercel-project` | done in phase 1 (`phase-1-setup.md` section 6) |
| 4 | `local-env` | `03-install-and-secrets.md` |
| 5 | `supabase` | `04-provision-services.md` 4a |
| 6 | `google-oauth` | `04-provision-services.md` 4b |
| 7 | `posthog` | `04-provision-services.md` 4c |
| 8 | `smtp` | `04-provision-services.md` 4d, SMTP |
| 9 | `autumn` | `04-provision-services.md` 4e |
| 10 | `dash0` | `04-provision-services.md` 4f |
| 11 | `verify-local` | `05-verify-locally.md` |
| 12 | `deploy` | `06-deploy-production.md` 6d, 6e, 6g, 6i and 6j item 1 |
| 13 | `smoke-test` | Smoke test, below |
| 14 | `report` | "End-of-run report" in `SKILL.md` |

When the ledger lacks `repository` or `vercel-project` (a lost ledger), run it as
`phase-1-setup.md` section 6 says; a Chrome permission prompt for the production host is then a
block.

What each step does, and where it differs from its reference:

- **`local-env`**: 3a to 3f. Commit the two files `node scripts/sync-startup-profile.mjs` writes.
- **`supabase`**: no MCP and no cost step; the script creates on the Free plan only.

  ```bash
  node scripts/providers/supabase-project.mjs
  node scripts/init-env.mjs --apply --file .env.prod
  node scripts/providers/supabase-database.mjs --ref <ref>
  ```

  The first prints `OK  Supabase project <ref> <created|reused> in <region>` (it waits for
  `ACTIVE_HEALTHY`; after its timeout, run it again: it reuses the project). The last prints
  `OK  database password created, DATABASE_URL stored in startup-<slug>/production`.
- **`google-oauth`**: one pass. The support and contact email is `googleAccount`. Create both web
  clients: `<name> (local)` with `http://localhost:3000/auth/callback/google`, and `<name>` with
  `<productionUrl>/auth/callback/google`. Import each Download JSON into its item. Then publish the
  app (Audience, from "Testing" to "In production"); when Google requires a home page and a privacy
  policy, give `<productionUrl>` and `<productionUrl>/legal/privacy`. No test users are needed.
- **`posthog`**: `node scripts/providers/posthog-projects.mjs`. A refused local project on the
  free plan is a warning, not a failure.
- **`smtp`**: `node scripts/vault-copy-smtp.mjs`, then `SMTP_FROM_NAME` as 4d shows. No Resend: a
  run has no domain.
- **`autumn`**: create or reuse the Autumn organization named after the startup in Chrome. Run
  `node scripts/providers/autumn-login.mjs` in the background (its default: production uses the
  sandbox key), open its `OPEN  <url>` in Chrome, pick the startup's organization and click
  "Authorize". Success:
  `OK  Autumn sandbox key stored in startup-<slug>/local, production uses the sandbox key`. Check in
  the Autumn dashboard that the organization's default currency equals `pricing.currency`; if not,
  change the organization default first. Then `pnpm dlx atmn push --yes`. Never `atmn push -p`:
  production stays on the sandbox until go-live.
- **`dash0`**: `node scripts/providers/dash0-dataset.mjs`, then the "Done with Step 4" check of
  `04-provision-services.md` (names and counts only).
- **`verify-local`**: `pnpm drizzle:migrate`; `pnpm dev` in the background (no `next-devtools`
  MCP in a run: read the dev server's output). Claude in Chrome on `http://localhost:3000`: first,
  signed out, the storefront `/` and `/legal/notice` in both languages; then sign in with Google,
  create the organization and reach the paywall. Stop `pnpm dev`. `pnpm validate` must be green.
- **`deploy`**, in this order:
  1. `node scripts/providers/vercel-deploy-hook.mjs --project <slug>` (6d);
  2. `node scripts/init-env.mjs --apply --file .env.prod --app-url "<productionUrl>"` (6e);
  3. `node scripts/push-env-to-vercel.mjs --file .env.prod`, then the same with `--apply` (6g);
  4. `node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL`
     (6g), so the first CI run is green;
  5. `git push -u origin master`, the first push: it runs CI and its `migrate` job, then
     `production.yml` calls the deploy hook (6j item 1). Follow each run without a prompt: take the
     id with
     `gh run list --repo "<repository>" --branch master --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`
     (retry a few times until a run appears; `--workflow production.yml` for the deploy run, once
     CI is done), then `gh run watch <id> --repo "<repository>" --exit-status`, where
     `<repository>` is `startup.config.json` `repository`;
  6. branch protection (6i, on `repos/<repository>/…`); a 403 goes in the report.

  Skip the rest of 06: 6a (the URL is `productionUrl`), 6b (phase 1), 6f (go-live, in
  `after-the-run.md`) and 6j item 2, which is the smoke test below.

## Smoke test

1. On `master` at the pushed commit (`git rev-parse HEAD` is what `/api/version` must return), run
   `node scripts/smoke-test.mjs`. It reads `productionUrl`, prints `OK  <name>` or
   `FAIL  <name>: <detail>` per check (landing, the four legal pages, version, Google sign-in,
   migrations), then `SMOKE TEST PASSED` or `SMOKE TEST FAILED`. A `version` failure naming an
   older commit means the deploy is not promoted yet: wait for the chain, then run it again.
2. The browser check, by Claude in Chrome on `productionUrl`: sign in with Google as the founder,
   create the organization (named after the startup; reuse it on a re-run), reach the paywall, tick
   the terms, and reach the Stripe checkout page in test mode. Stop there: never enter a card
   number. Then print `BROWSER CHECK PASSED`.

This leaves the founder's account, organization and terms acceptance in the production database:
expected, the founder is the first user. Then `node scripts/run-ledger.mjs done smoke-test`.

The `/goal` condition is checked when a turn ends, so do the `report` step in the same turn as
`BROWSER CHECK PASSED`: the end-of-run report of `SKILL.md`, a push notification
(`PushNotification`, under 200 characters) such as `<name> is live at <productionUrl>, smoke test
passed`, and `node scripts/run-ledger.mjs done report`.

## When something breaks

1. **Solve it alone first**, in this order: the provider's API or CLI; Claude in Chrome (the
   founder's signed-in browser); computer use for native apps. Change approach, or wait and retry
   (the 1Password limit of 100 writes per hour, a provider's propagation delay).
2. **Call the founder only when a human is required.** Closed list:
   - create an account;
   - type a password;
   - enter a 2FA code;
   - solve a CAPTCHA;
   - pay or enter a card (including moving off a free plan);
   - complete a KYC;
   - give a consent that the saved consent does not cover;
   - delete a cloud resource;
   - a secret reached the transcript or printed output (the founder decides on revoking it);
   - copy a secret by hand when Claude cannot copy it without seeing it (for example a Google
     client secret when the console offers no Download JSON).
3. **No deletion.** A one-time key that was lost is replaced by a new key; the old one stays, and
   the final report lists it for cleanup (provider, key name).

## Block protocol

When an item of the closed list stops the run:

1. `node scripts/run-ledger.mjs blocked "<action>"` records it and prints
   `BLOCKED_ON_FOUNDER: <action>`.
2. Send a push notification (`PushNotification`) with the exact action, under 200 characters.
3. Print, as the last line of the turn:
   `BLOCKED_ON_FOUNDER: <action>. When done, paste: <the /goal line>`, with the `/goal` line the
   founder last pasted.
4. End the turn. That line comes after the founder's latest `/goal` message, so it meets the
   `/goal` condition and the loop stops instead of spinning. An older block line does not count.

`<action>` says exactly what to do and where, for example
`sign in to Autumn in Chrome and enter the 2FA code`. The founder's paste of the line resumes the
run (Start, step 2).

For a missing consent, `<action>` is `consent to <clause>`, and the line to paste is the founder's
last `/goal` line with `; <clause>` added at the end of its consent list, before `Done when`. It
must stay under 4,000 characters. Pasting that line is the founder's consent.
