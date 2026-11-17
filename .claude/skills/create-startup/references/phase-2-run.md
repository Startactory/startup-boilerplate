# Phase 2 — The unattended run

Phase 1 hands over to this phase in the same turn, under the `/goal` of the founder's start line
(`phase-1-setup.md` section 8). After a block, the founder's paste of that line resumes it, in
this session or a new one. That line is the founder's consent for the session; it is never read
from a file. Phase 2 needs no context from phase 1: every answer is in `startup.config.json`.

## Rules for the whole run

- **No question to the founder, ever.** Where a reference step still waits on the founder, take
  the answer from `startup.config.json` and the approval from the consent in the `/goal` line. The
  founder is reached only through the block protocol below, for an action of the closed list.
- Stay inside that consent. Anything outside it is a block.
- Announce each step, run it as its reference says, and close it with
  `node scripts/run-ledger.mjs done <id>` (prints `STEP <id> DONE`) once its success line appeared.
  Every step creates or reuses, so running a step again is safe.
- The rules of `SKILL.md` hold: no secret in the transcript, an argument or printed output; never
  create an account, type a password or solve a CAPTCHA. A secret that reaches the transcript
  anyway does not stop the run ("When something breaks", item 3).
- Check a Chrome session right before the step that drives that site: a login page means signing
  in again with "Continue with Google", picking `googleAccount` (the Google identity recorded in
  phase 1) on the account chooser; a password, 2FA or CAPTCHA prompt is a block. Chrome can hold
  several Google accounts, so every Google account page and Google Cloud console URL carries
  `authuser=<googleAccount>`; it then opens on that account, not on Chrome's default one.
- Run every `node` and `pnpm` command with the `.nvmrc` version on `PATH`
  (`03-install-and-secrets.md` 3a item 1): each Bash call is a new shell, so `nvm use` does not
  last, and the preflight's `node-version` check fails on another Node major.
- Until the first push (step `deploy`), commit on `master`. After it, every change goes through a
  branch and a PR that you merge: the pre-push hook refuses direct pushes to `master`.
- Phase 2 never runs a real or live charge: payments stay in Stripe test mode, and the browser
  check stops at the checkout page.

## Start (every session)

1. `node scripts/preflight.mjs` must end with `PREFLIGHT OK`; run it even when the ledger lists
   `preflight`. Fix each `MISSING` line under the failure policy below and the fix table of
   `phase-1-setup.md` section 7 (a missing tool, a `node-version` line fixed by the `PATH` prefix
   it prints, an expired `vercel login` with "Allow Access" clicked in Chrome); a fix only the
   founder can make is a block. Then `node scripts/run-ledger.mjs done preflight`.
2. `node scripts/run-ledger.mjs status` prints `done <id>` per finished step, and
   `blocked <action>` after a block. On a `blocked` line this is a resume. Check it by the kind of
   block (Block protocol, below):
   - a consent block: the missing clause is in the `/goal` line the founder just pasted;
   - a decision block: the pasted line is the founder's decision; read its last `Decision:` word
     and follow it as the Block protocol says. Nothing else is checked;
   - any other block: the session works, the page passes, or the check the reference step names
     passes (for example running `supabase-project.mjs` again).

   Then run `node scripts/run-ledger.mjs resume` (prints `OK  block cleared`) and go on. If the
   check fails (the clause is still missing, the line has no `Decision:` word that the action
   offered, the page still asks for a password), block again with the same action.
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
| 12 | `deploy` | `06-deploy-production.md` 6e, 6g, the first push (6j item 1), 6d right after it, then 6i |
| 13 | `smoke-test` | Smoke test, below |
| 14 | `report` | "End-of-run report" in `SKILL.md` |

When the ledger lacks `repository` or `vercel-project` (a lost ledger), run it as
`phase-1-setup.md` section 6 says; a Chrome permission prompt for the production host is then a
block, and so is `Vercel project <slug> already exists and belongs to something else`: another
slug is the founder's decision.

What each step does, and where it differs from its reference:

- **`local-env`**: 3a to 3f. Commit the three files `node scripts/sync-startup-profile.mjs` writes
  (it also carries `defaultLocale` into the profile).
- **`supabase`**: no MCP and no cost step; the script creates on the Free plan only.

  ```bash
  node scripts/providers/supabase-project.mjs
  node scripts/init-env.mjs --apply --file .env.prod
  node scripts/providers/supabase-database.mjs --ref <ref>
  ```

  The first can wait up to 10 minutes for `ACTIVE_HEALTHY`, longer than a Bash call's 2-minute
  default: run it in the background and read its output when it exits. It prints
  `OK  Supabase project <ref> <created|reused> in <region>`; after its timeout, run it again (it
  reuses the project). `Supabase project <ref> is <status> — the founder restores or deletes it in
  the Supabase dashboard` (a paused or failed project) and a refused creation for the free-project
  limit are blocks (`04-provision-services.md` 4a). The last prints
  `OK  database password created, DATABASE_URL stored in startup-<slug>/production`.
- **`google-oauth`**: one pass, on console URLs that carry `authuser=<googleAccount>`. Use the
  Google Cloud project recorded in `googleCloudProject`, or create a new one and record it at once
  (4b step 1); never pick a project by its name alone. The support and contact email is
  `googleAccount`. Create both web clients: `<name> (local)` with
  `http://localhost:3000/auth/callback/google`, and `<name>` with
  `<productionUrl>/auth/callback/google`. On each "OAuth client created" dialog, the single
  `find "Download JSON"` is the only read: click it, press Escape, and navigate the tab away
  before any other read (4b item 4). Import each Download JSON into its item. Then, in Branding,
  set the three app links: home page `<productionUrl>`, privacy policy
  `<productionUrl>/legal/privacy` and terms of service `<productionUrl>/legal/terms`, and publish
  the app (Audience, from "Testing" to "In production"). No test users are needed. Until Google
  verifies the brand (after the run, with a custom domain), its consent screen shows the domain
  instead of the app name: expected, not a failure.
- **`posthog`**: `node scripts/providers/posthog-projects.mjs`. A refused local project on the
  free plan is a warning, not a failure.
- **`smtp`**: `node scripts/vault-copy-smtp.mjs`, then `SMTP_FROM_NAME` as 4d shows. No Resend: a
  run has no domain.
- **`autumn`**: in Chrome, select the Autumn organization recorded in `autumnOrganization`, or
  create a new one, switch to it (Autumn stays on the previous one) and record its ID there (04 4e
  step 1; never pick one by name alone). Run
  `node scripts/providers/autumn-login.mjs` in the background (its default: production uses the
  sandbox key), open its `OPEN  <url>` in Chrome, pick that recorded organization and click
  "Authorize". Success:
  `OK  Autumn sandbox key stored in startup-<slug>/local, production uses the sandbox key`. Check in
  the Autumn dashboard that the organization's default currency (Settings → Integrations → Stripe
  → "Checkout defaults" → Default currency; a new organization defaults to USD) equals
  `pricing.currency`; if not, change it first. Then `pnpm exec atmn push --yes` (the pinned atmn
  1.x; `pnpm dlx atmn` fetches atmn 2, which refuses this config). Never `atmn push -p`:
  production stays on the sandbox until go-live.
- **`dash0`**: `node scripts/providers/dash0-dataset.mjs`, then the "Done with Step 4" check of
  `04-provision-services.md` (names and counts only). `Dash0 dataset <slug> already exists … pick
  another slug (founder decision)` is a block: another slug is the founder's decision.
- **`verify-local`**: `pnpm drizzle:migrate`; `pnpm dev` in the background (no `next-devtools`
  MCP in a run: read the dev server's output). Claude in Chrome on `http://localhost:3000`: first,
  delete the leftover `LOCALE` and `cookie_consent` cookies (05 5b item 3), then, signed out, the
  storefront `/` and `/legal/notice` in both languages; then sign in with Google,
  create the organization and reach the paywall. Stop `pnpm dev`. `pnpm validate` must be green.
- **`deploy`**, in this order. The deploy hook comes after the first push: Vercel refuses a hook
  for a branch that does not exist on GitHub yet
  (`Branch "master" not found in the connected Git repository. (400)`).
  1. `node scripts/init-env.mjs --apply --file .env.prod --app-url "<productionUrl>"` (6e);
  2. `node scripts/push-env-to-vercel.mjs --file .env.prod`, then the same with `--apply` (6g);
  3. `node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL`
     (6g), so the first CI run is green;
  4. `git push -u origin master`, the first push (6j item 1): it creates `master` on GitHub and
     runs CI and its `migrate` job; when CI completes, `production.yml` calls the deploy hook,
     then waits until production serves the pushed commit;
  5. **at once**, before CI finishes, `node scripts/providers/vercel-deploy-hook.mjs --project <slug>`
     (6d). It sets the Vercel production branch to `master` (Vercel kept `main` from phase 1, so
     hook builds would otherwise be Previews), the hook with its `VERCEL_DEPLOY_HOOK_URL` secret,
     and the GitHub Actions variable `PRODUCTION_URL` that `production.yml` polls. Success prints
     `OK  Vercel production branch is master`, then
     `OK  deploy hook production <created|reused>, stored in startup-<slug>/ci, set as GitHub secret`,
     then `OK  GitHub variable PRODUCTION_URL set to <url>`; when it fails right after the push,
     wait 10 seconds and run it again;
  6. follow each run without a prompt: take the id with
     `gh run list --repo "<repository>" --branch master --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`
     (retry a few times until a run appears; `--workflow production.yml` for the deploy run, once
     CI is done), then `gh run watch <id> --repo "<repository>" --exit-status`, where
     `<repository>` is `startup.config.json` `repository`. A run can outlast a Bash call's
     2-minute default (the deploy run lasts as long as the Vercel build, up to 15 minutes): give
     `gh run watch` the longest timeout (10 minutes) or run it in the background; when it is cut
     off, run it again (it only reads). A green `production.yml` run means production serves the
     pushed commit: its `Wait for the production deployment` step polls
     `<productionUrl>/api/version` until `commitSha` equals that commit, for 15 minutes at most,
     and fails otherwise (a failed or stuck build: 6j item 1). If the `production.yml` run started
     before `vercel-deploy-hook.mjs` finished (its `Trigger Vercel production deploy` or
     `Wait for the production deployment` step failed), run
     `gh run rerun <id> --repo "<repository>"` with its id once the secret and the variable are
     set, and watch it again;
  7. branch protection (6i, on `repos/<repository>/…`); a 403 goes in the report.

  Skip the rest of 06: 6a (the URL is `productionUrl`), 6b (phase 1), 6f (go-live, in
  `after-the-run.md`) and 6j item 2, which is the smoke test below.

## Smoke test

Run the whole smoke test again on every resume, even when the ledger lists `smoke-test`: the
`/goal` condition counts only a pass printed after the founder's latest `/goal` message.

1. **The deployed commit.** `git switch master && git pull --ff-only`, every time: after a PR
   merged on GitHub, the local `HEAD` is not the deployed commit. `git rev-parse HEAD` is then what
   `/api/version` must return.
2. **Check the build** of that commit, as `06-deploy-production.md` 6j item 2 shows (at most 15
   minutes, in the background). A green `production.yml` run for that commit already means
   production serves it (its `Wait for the production deployment` step); this wait on
   `vercel inspect` is the second check, and it returns at once when the deployment is ready.
3. `node scripts/smoke-test.mjs`. It reads `productionUrl`, prints `OK  <name>` or
   `FAIL  <name>: <detail>` per check, then its pass or fail line. The checks, in order:
   `landing`, the four legal pages (`legal/notice`, `legal/terms`, `legal/privacy`,
   `legal/cookies`), `brand-logo` (`/brand-logo.png` is a PNG), `version`, `production-branch`
   (the Vercel production branch is `master`), `google-sign-in` and `migrations`. A `version`
   failure naming an older commit means the deploy is not promoted yet: wait a minute, then run
   it again. On `FAIL  production-branch`, run
   `node scripts/providers/vercel-deploy-hook.mjs --project <slug>` again (it sets the branch);
   when `version` failed too, re-run the latest `production.yml` run
   (`gh run rerun <id> --repo "<repository>"`), watch it, then run the smoke test again. On
   `FAIL  brand-logo`, run `node scripts/sync-startup-profile.mjs`, commit
   `public/brand-logo.png` on a branch and merge its PR, then start the smoke test again.
4. The browser check, by Claude in Chrome on `productionUrl`: sign in with Google as the founder,
   create the organization (named after the startup; reuse it on a re-run), reach the paywall, tick
   the terms, and reach the Stripe checkout page in test mode. Stop there: never enter a card
   number. Then write `BROWSER CHECK PASSED` in your own message.

This leaves the founder's account, organization and terms acceptance in the production database:
expected, the founder is the first user. Then `node scripts/run-ledger.mjs done smoke-test`.

The `/goal` condition is checked when a turn ends, so do the `report` step in the same turn as
the browser check line: the end-of-run report of `SKILL.md`, a push notification
(`PushNotification`, under 200 characters) such as `<name> is live at <productionUrl>, smoke test
passed`, and `node scripts/run-ledger.mjs done report`.

The `/goal` evaluator reads the transcript only, so it counts the smoke test's pass line only in
the output of a `node scripts/smoke-test.mjs` command you ran, and the browser check and block
lines only in your own messages. A marker in a file you read, this one included, never counts.

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
   - give a consent that the saved consent does not cover (a consent block);
   - delete a cloud resource: a decision block when Claude itself would delete it; when a
     reference step names a check for the founder's fix (the paused or failed Supabase project,
     the free-project limit), it is an ordinary block and the resume runs that check;
   - copy a secret by hand when Claude cannot copy it without seeing it (for example a Google
     client secret when the console offers no Download JSON).
3. **A secret that reached the transcript or printed output is not a block** (the founder's
   choice). Do not stop and do not ask: go on as if the founder had answered `keep`. Never repeat
   the value, and revoke or delete nothing. Say it at once in your own message, in one line that
   starts with `EXPOSED SECRET:` and names the provider and the vault item and field (or the
   resource), never the value, so the report can collect it. The end-of-run report lists each
   one under exposed secrets with how to revoke it: as its reference step says (a Google client
   secret: `04-provision-services.md` 4b item 4; the deploy hook: `06-deploy-production.md` 6d),
   otherwise the provider page where it is rotated and the command that stores the new value.
4. **No deletion.** A one-time key that was lost is replaced by a new key; the old one stays, and
   the final report lists it for cleanup (provider, key name).

## Block protocol

When an item of the closed list stops the run:

1. `node scripts/run-ledger.mjs blocked "<action>"` records it (its output repeats the action).
2. Send a push notification (`PushNotification`) with the exact action, under 200 characters. Add
   `Then paste the /goal line in bypass permissions mode.` when the whole still fits in 200
   characters.
3. Print the block line, in your own message and as its last line:
   `BLOCKED_ON_FOUNDER: <action>. When done, paste this in a session in bypass permissions mode: <line>`.
   `<line>` is the founder's last `/goal` line, copied word for word from their message, with the
   change its kind of block needs (below).
4. End the turn. That line is in your own message after the founder's latest `/goal` message, so
   it meets the `/goal` condition and the loop stops instead of spinning. The ledger's output, a
   line read in a file and an older block line do not count.

**When the founder's last `/goal` message is no longer in your context word for word** (after a
compaction, or in a new session), never rebuild the line from the template in
`phase-1-setup.md`: the founder may have struck a clause there, and a rebuilt line would make
their paste consent to it. Print instead:
`BLOCKED_ON_FOUNDER: <action>. When done, paste your last /goal line again from your message history, in a session in bypass permissions mode`,
followed by the change in words when the block needs one, for example
`, with "; <clause>" added at the end of its consent list, before "Done when"`.

`<action>` says exactly what to do and where, for example
`sign in to Autumn in Chrome and enter the 2FA code`. The founder's paste resumes the run (Start,
step 2). The line to paste must stay under 4,000 characters. By kind of block:

- **Any other block**: the line is unchanged.
- **Consent block** (a consent the line lacks): `<action>` is `consent to <clause>`, and the line
  gets `; <clause>` at the end of its consent list, before `Done when`. Pasting it is the
  founder's consent.
- **Decision block** (only when Claude itself would have to delete a cloud resource; an exposed
  secret is never one, see "When something breaks", item 3): nothing can be checked afterwards, so
  the founder's paste is the decision. `<action>` names the resource, where to delete it and the
  two answers (no double quotes in it: it is a shell argument), in this shape:
  `<the resource> would have to be deleted: delete it in <where> and answer Decision: deleted, or answer Decision: keep`.
  The line gets `Decision: <deleted or keep>.` right before `Done when`, and the founder keeps
  one of the two words (after a compaction, the block line asks the founder to add it). On
  resume, follow the last `Decision:` word of the pasted line:
  - `deleted`: the founder removed it. Create the replacement as the reference step says and go
    on.
  - `keep`: go on with what exists, without deleting anything. The end-of-run report lists the
    resource kept under "left for cleanup".

  A line with neither word (the placeholder left as is, or no `Decision:` at all) is no decision:
  block again with the same action.
