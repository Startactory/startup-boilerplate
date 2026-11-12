# Single-Prompt Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `create-startup` skill into a two-phase run: every question and founder-only action up front (phase 1), then an unattended, `/goal`-driven run to a smoke-tested production deploy on a free `*.vercel.app` URL (phase 2).

**Architecture:** New Node ESM scripts under `scripts/` (config schema, preflight, Supabase project, Vercel project, run ledger, smoke test), each a pure function with injected IO plus a thin CLI, tested in `test/scripts/` with fakes. One small app change (`/api/version` returns the commit). The skill docs are reorganized into a phase 1 file, a phase 2 file and an "after the run" file, and the reference steps lose every founder question.

**Tech Stack:** Node ESM `.mjs` scripts, valibot 1.x, `postgres`, vitest, Vercel CLI, GitHub CLI, 1Password CLI through `scripts/vault/op.mjs`, Next.js 16 route handler.

**Spec:** `docs/superpowers/specs/2026-11-12-single-prompt-design.md`

## Global Constraints

- A secret never appears in a command-line argument, in printed output or in an error message. Scripts read secrets through `createOp()` / `readMasterKeys()` and print names only.
- No new npm dependency. Use what `package.json` already has (valibot, postgres, vitest).
- Every script follows the existing pattern: exported function with injected `fetch` / `op` / command runner, a `main()` guarded by `process.argv[1]` check, `OK  …` lines on success, a one-line message and `process.exit(1)` on failure.
- Every script that creates something is idempotent: it reuses what exists and reports `created` or `reused`.
- Tests live in `test/scripts/<name>.test.ts`, never call the network, 1Password or a real CLI.
- Code, comments, docs and commit messages in English. No code comments beyond one short `// why` line where non-obvious.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `--no-verify`.
- Region pairs: `eu` → Supabase `eu-west-3`, Vercel `cdg1`; `us` → Supabase `us-east-1`, Vercel `iad1`.
- Pass markers, exact strings: `PREFLIGHT OK`, `PREFLIGHT FAILED`, `SMOKE TEST PASSED`, `SMOKE TEST FAILED`, `BROWSER CHECK PASSED`, `STEP <id> DONE`, `BLOCKED_ON_FOUNDER: <action>`.
- Done gate for every task: `pnpm validate` green.

## Review Focus

1. A re-run after a partial failure: every creating script finds and reuses what the first run made (Supabase project named `<slug>`, Vercel project `<slug>`, its `*.vercel.app` domain) and never creates a second one.
2. `<slug>.vercel.app` is already taken by someone else: the Vercel script falls back to `<slug>-<4 random lowercase alphanumerics>.vercel.app` and records the name it got.
3. A Supabase project that never reaches `ACTIVE_HEALTHY`: the script stops after its timeout with a message naming the project ref and status, and a re-run reuses that project instead of creating another.
4. A returning founder whose Dash0 trial ended (the Dash0 API answers 401, 402 or 403): the preflight prints `MISSING  dash0` with the fix and ends `PREFLIGHT FAILED`, before anything is created.
5. The smoke test against a URL still serving an older deployment, or a database check that fails: it prints the expected and actual commit, and no error path ever prints the `DATABASE_URL`.

---

### Task 1: Run config schema

**Files:**
- Create: `scripts/startup-config.mjs`
- Modify: `scripts/sync-startup-profile.mjs` (import `Company` and `Legal` from the new module instead of defining them)
- Test: `test/scripts/startup-config.test.ts`

**Interfaces:**
- Produces: `Company`, `Legal` (valibot schemas, same shape as today's in `sync-startup-profile.mjs`); `RunConfig` (valibot schema); `validateRunConfig(config: unknown): { ok: true } | { ok: false, issues: string[] }`, each issue formatted `"<dotted.path>: <message>"`; `SLUG_PATTERN_RUN = /^[a-z0-9]+(-[a-z0-9]+)*$/` with length 3..26.

`RunConfig` requires: `name` (non-empty), `slug` (pattern, 3..26 chars), `domain` (exactly `""`), `gdpr` (boolean), `dataRegion` (`eu` | `us`), `idea` (non-empty), `githubOwner` (non-empty), `pricing` { `source` (`founder` | `derived`), `customer` (`individual` | `team` | `business`), `amount` (number > 0), `interval` (`month` | `year`), `currency` (3 capital letters and in `Intl.supportedValuesOf('currency')`), `trialDays` (integer ≥ 0), `cardRequired` (boolean), `rationale` (string), `deferred` (optional array) }, `brand` { `icon` (non-empty), `accent` (`#rrggbb`) }, `legal` (the `Legal` schema with `founderName` non-empty, `contactEmail` an email, `company` null). Optional: `repository` (`<owner>/<name>`), `productionUrl` (`https://<host>.vercel.app`, no path), `createdStep`. Unknown keys are allowed.

- [ ] **Step 1: Write the failing tests** in `test/scripts/startup-config.test.ts`: a complete valid config (use the shapes from `01b-set-pricing.md` and `01d-storefront.md`, plus `githubOwner: 'ada'`) returns `{ ok: true }`; deleting `idea` gives an issue starting `idea:`; `domain: 'acme.com'` gives an issue starting `domain:`; `pricing.currency: 'ZZZ'` gives an issue starting `pricing.currency:`; `slug: 'ab'` gives an issue starting `slug:`; `legal.company: { … }` gives an issue starting `legal.company:`; `productionUrl: 'https://acme.vercel.app/x'` gives an issue starting `productionUrl:`; two problems at once give two issues.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/startup-config.test.ts` — expected FAIL (module not found).
- [ ] **Step 3: Implement** `scripts/startup-config.mjs` with `v.safeParse(RunConfig, config, { abortEarly: false })`, mapping every issue's path keys joined by `.`. Move `Company` and `Legal` here and import them in `sync-startup-profile.mjs` (behavior unchanged).
- [ ] **Step 4: Run** the new test and `pnpm vitest run test/scripts/sync-startup-profile.test.ts` — expected PASS, sync tests unchanged and green.
- [ ] **Step 5: Commit** `feat(scripts): add the single-prompt run config schema`.

---

### Task 2: Supabase project through the Management API

**Files:**
- Create: `scripts/providers/supabase-project.mjs`
- Test: `test/scripts/supabase-project.test.ts`

**Interfaces:**
- Consumes: `requestJson` from `scripts/providers/http.mjs`; `readMasterKeys` (field `SUPABASE_ACCESS_TOKEN`); `readStartupConfig`.
- Produces:
  - `SUPABASE_REGION = { eu: 'eu-west-3', us: 'us-east-1' }`
  - `FACTORY_ORGANIZATION = 'startup-factory'`
  - `findFactoryOrganization({ fetch, token }): Promise<{ id: string, plan: string }>` — throws `Supabase organization "startup-factory" not found — run step 0` when absent.
  - `listActiveProjects({ fetch, token, organizationId }): Promise<Array<{ ref: string, name: string, status: string }>>` — projects of that organization whose status is not `INACTIVE` / `PAUSED`.
  - `ensureSupabaseProject({ fetch, token, slug, dataRegion, wait, timeoutMs = 600_000, pollMs = 10_000 }): Promise<{ ref: string, outcome: 'created' | 'reused' }>`
- CLI: `node scripts/providers/supabase-project.mjs` prints `OK  Supabase project <ref> <outcome> in <region>`.

Rules: reuse the organization's project named `<slug>` (any status except removed; wait for it if it is coming up). Otherwise refuse when the organization plan is not `free` (`Supabase organization startup-factory is on a paid plan — the run creates free projects only`) or when it already has 2 active projects (`Supabase Free plan allows 2 active projects and startup-factory has 2 — pause one or upgrade (founder action)`). Create with `POST /v1/projects` (`name: slug`, `organization_id`, `region`, a random `db_pass` from `randomBytes(24).toString('base64url')` that is never stored or printed — `supabase-database.mjs` resets it later). Poll `GET /v1/projects/{ref}` until `ACTIVE_HEALTHY`; on timeout throw `Supabase project <ref> still <status> after 10 minutes — re-run to keep waiting`. Check the exact field names (`organization_id`, plan field) against https://api.supabase.com/api/v1 before writing the code, and say in the report what you found.

- [ ] **Step 1: Write the failing tests** with a fake `fetch` keyed by method + URL: creates in `eu-west-3` when no project exists and returns `{ outcome: 'created' }`; reuses an existing project named after the slug without a POST; a project `COMING_UP` then `ACTIVE_HEALTHY` is waited for (fake `wait` called); timeout throws the message above with the ref; paid plan throws without POST; 2 active projects throws without POST; the POST body never appears in a thrown message (assert the generated `db_pass` is absent from every error string).
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/supabase-project.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `scripts/providers/supabase-project.mjs`.
- [ ] **Step 4: Run** the test — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): create the Supabase project through the Management API`.

---

### Task 3: Vercel project and production URL

**Files:**
- Create: `scripts/providers/vercel-project.mjs`
- Test: `test/scripts/vercel-project.test.ts`

**Interfaces:**
- Consumes: `readStartupConfig`; config `slug`, `repository`, `dataRegion`.
- Produces:
  - `VERCEL_REGION = { eu: 'cdg1', us: 'iad1' }`
  - `ensureVercelProject({ runVercel, slug, repository, randomSuffix }): Promise<{ productionUrl: string, outcome: 'created' | 'reused' }>` where `runVercel(args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>`.
  - `writeProductionUrl({ path = 'startup.config.json', fs, productionUrl })` — rewrites the config with `productionUrl` set, 2-space JSON plus trailing newline, other keys untouched.
- CLI: `node scripts/providers/vercel-project.mjs` prints `OK  Vercel project <slug> <outcome>, production URL <url>`.

Approach: `vercel project add <slug>` (an "already exists" answer means reuse), `vercel link --yes --project <slug>`, `vercel git connect` with the repo URL from `repository`, then give the project a free `*.vercel.app` domain with `vercel domains add <name>.vercel.app <slug>`: try `<slug>`, and when Vercel answers that the domain is taken, try `<slug>-<randomSuffix()>` (4 lowercase alphanumerics) up to 3 times. When the project already has a `*.vercel.app` domain (read it from `vercel domains ls` / `vercel project inspect <slug>` output), reuse it. Run `vercel <command> --help` for each command first and match the real flags and messages of the installed CLI; report what you found. Also set `"regions": [VERCEL_REGION[dataRegion]]` in `vercel.json`, keeping its `git` block.

- [ ] **Step 1: Write the failing tests** with a fake `runVercel` that records calls: a fresh project gets `<slug>.vercel.app` and `outcome: 'created'`; a taken `<slug>.vercel.app` falls back to `<slug>-abcd.vercel.app` (fake `randomSuffix` returns `abcd`); an existing project with a `*.vercel.app` domain is reused with no `domains add` call; three taken names throw `no free *.vercel.app name for <slug> after 3 tries`; `writeProductionUrl` keeps every other key and adds `productionUrl`; `vercel.json` gets `"regions": ["cdg1"]` for `eu` and keeps `git.deploymentEnabled`.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/vercel-project.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `scripts/providers/vercel-project.mjs`.
- [ ] **Step 4: Run** the test — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): create the Vercel project and its free production URL`.

---

### Task 4: Production uses the Autumn sandbox key until go-live

**Files:**
- Modify: `scripts/vault-import-autumn-keys.mjs`, `scripts/providers/autumn-login.mjs`
- Test: `test/scripts/vault-import-autumn-keys.test.ts`, `test/scripts/autumn-login.test.ts`

**Interfaces:**
- Produces: `importAutumnKeys({ …existing, productionKey = 'sandbox' })` where `productionKey` is `'sandbox' | 'live'`; returns `{ local: boolean, production: 'sandbox' | 'live' | false }`. `loginToAutumn` passes it through; the CLIs accept `--live` (default sandbox).

With `'sandbox'`, the production vault item gets the sandbox key as `AUTUMN_SECRET_KEY` (any `AUTUMN_PROD_SECRET_KEY` in `.env` is ignored). With `'live'`, today's behavior: the production item gets `AUTUMN_PROD_SECRET_KEY`, and it must start with `am_sk_live_` (`AUTUMN_PROD_SECRET_KEY is not a live key`). The CLI line becomes `OK  Autumn sandbox key stored in <vault>/local, production uses the <sandbox|live> key`.

- [ ] **Step 1: Update the tests**: default mode writes the sandbox value to the production item; `--live` mode writes the live key; live mode with a non-live production key throws; live mode with no production key throws `no live Autumn key in .env — connect Stripe live in Autumn, then run atmn login again`; existing guard (sandbox variable holding a live key) still throws.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/vault-import-autumn-keys.test.ts test/scripts/autumn-login.test.ts` — expected FAIL on the new cases.
- [ ] **Step 3: Implement** the option in both files.
- [ ] **Step 4: Run** the tests — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): keep production on the Autumn sandbox until go-live`.

---

### Task 5: Smoke test

**Files:**
- Modify: `src/shared/env.ts` (add optional `VERCEL_GIT_COMMIT_SHA`), `src/app/api/version/route.ts` (return `commitSha`)
- Create: `scripts/smoke-test.mjs`
- Test: `test/scripts/smoke-test.test.ts`, and the existing route test if one covers `/api/version` (else add `src/app/api/version/route.test.ts`)

**Interfaces:**
- Produces: `GET /api/version` → `{ deploymentId: string | null, commitSha: string | null }`.
- Produces: `runSmokeTest({ url, fetch, expectedCommit, expectedName, googleClientId, countAppliedMigrations, expectedMigrations }): Promise<Array<{ name: string, ok: boolean, detail: string }>>`, where `countAppliedMigrations(): Promise<number>`.
- CLI: `node scripts/smoke-test.mjs --url <productionUrl>` (defaults to config `productionUrl`). It reads `expectedCommit` from `git rev-parse HEAD`, `expectedName` from config `name`, `googleClientId` and `DATABASE_URL` from the vault item `startup-<slug>/production` through `createOp()`, `expectedMigrations` from the entry count of `drizzle/meta/_journal.json`, and counts rows of `drizzle.__drizzle_migrations` with `postgres(url, { ssl: 'require', max: 1 })`. Prints `OK  <name>` or `FAIL  <name>: <detail>` per check, then `SMOKE TEST PASSED` or `SMOKE TEST FAILED` (exit 1).

Checks, in order, with these names: `landing` (`/` → 200 and the HTML contains `expectedName`), `legal/notice`, `legal/terms`, `legal/privacy`, `legal/cookies` (each 200), `version` (`commitSha === expectedCommit`, detail `expected <a>, got <b>`), `google-sign-in` (`POST <url>/auth/sign-in/social` with JSON `{ provider: 'google', callbackURL: '/dashboard' }` and header `Origin: <url>`; the returned `url` has host `accounts.google.com`, `client_id === googleClientId`, `redirect_uri === <url>/auth/callback/google`), `migrations` (`countAppliedMigrations() === expectedMigrations`). A check that throws becomes `ok: false` with the error's message; the database check's message is replaced by `database query failed (<error code>)` so the URL can never leak.

- [ ] **Step 1: Write the failing tests** with a fake `fetch`: all checks pass on a healthy fake; an older commit fails `version` with `expected aaa, got bbb`; a wrong `redirect_uri` fails `google-sign-in`; a legal page 404 fails only that check; `countAppliedMigrations` throwing an error whose message contains `postgresql://user:secret@host` yields a detail without `secret` or `postgresql://`. Route test: `GET` returns `commitSha` from `VERCEL_GIT_COMMIT_SHA`, or `null` when unset.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/smoke-test.test.ts` and the route test — expected FAIL.
- [ ] **Step 3: Implement** the env field, the route change and `scripts/smoke-test.mjs`.
- [ ] **Step 4: Run** the tests — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): add the production smoke test`.

---

### Task 6: Run ledger, git ignore and caveman settings

**Files:**
- Create: `scripts/run-ledger.mjs`, `.claude/settings.json`
- Modify: `.gitignore` (add `startup.run.json`)
- Test: `test/scripts/run-ledger.test.ts`

**Interfaces:**
- Produces: `LEDGER_PATH = 'startup.run.json'`; `readLedger({ fs }): { done: Array<{ step: string, at: string }>, blocked: { action: string, at: string } | null }` (empty ledger when the file is missing); `markDone({ fs, step, now })`; `markBlocked({ fs, action, now })`; `clearBlocked({ fs })`.
- CLI: `node scripts/run-ledger.mjs done <step>` prints `STEP <step> DONE` (marking twice keeps one entry); `node scripts/run-ledger.mjs blocked "<action>"` prints `BLOCKED_ON_FOUNDER: <action>`; `node scripts/run-ledger.mjs status` prints one `done <step>` line per step and `blocked <action>` if set; `node scripts/run-ledger.mjs resume` clears the block.

`.claude/settings.json`, exactly:

```json
{
  "extraKnownMarketplaces": {
    "caveman": { "source": { "source": "github", "repo": "JuliusBrussee/caveman" } }
  },
  "enabledPlugins": { "caveman@caveman": true }
}
```

- [ ] **Step 1: Write the failing tests** with an in-memory `fs`: missing file reads as empty; `markDone` twice for the same step keeps one entry; `markBlocked` then `clearBlocked` leaves `blocked: null`; the file is 2-space JSON with a trailing newline.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/run-ledger.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** the script, the settings file and the `.gitignore` line. Check that `pnpm check` accepts `.claude/settings.json` (format it with biome if needed).
- [ ] **Step 4: Run** the test and `pnpm check` — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): add the run ledger and enable caveman for founder sessions`.

---

### Task 7: Preflight

**Files:**
- Create: `scripts/preflight.mjs`
- Test: `test/scripts/preflight.test.ts`

**Interfaces:**
- Consumes: `validateRunConfig` (Task 1); `findFactoryOrganization`, `listActiveProjects` (Task 2); `readServiceAccountToken` from `scripts/vault/service-account.mjs`; `masterKeyName` from `scripts/vault/names.mjs`.
- Produces: `runPreflight({ config, commandExists, run, op, fetch }): Promise<Array<{ name: string, ok: boolean, fix: string }>>` where `commandExists(name): boolean` and `run(command: string, args: string[]): Promise<{ code: number, stdout: string, stderr: string }>`.
- CLI: `node scripts/preflight.mjs` prints `OK  <name>` or `MISSING  <name>: <fix>` per check, then `PREFLIGHT OK` or `PREFLIGHT FAILED` (exit 1).

Checks and names, in this order (later checks still run when an earlier one fails, except those that need a missing input):
- `config` — `validateRunConfig`; the fix lists the issues.
- `tool:node`, `tool:pnpm`, `tool:op`, `tool:gh`, `tool:vercel` (also `vercel deploy-hooks --help` exits 0, fix `npm i -g vercel@latest`), `tool:database` (`psql` or `docker`).
- `vault` — the service account token reads and `op` can list the founder vault.
- `master-keys` — the founder's master-keys item has every field name in `SUPABASE_ACCESS_TOKEN`, `POSTHOG_PERSONAL_API_KEY_<R>`, `DASH0_AUTH_TOKEN_<R>`, `DASH0_API_URL_<R>`, `DASH0_OTLP_ENDPOINT_<R>`, `SMTP_USER`, `SMTP_PASS` (with `<R>` from `masterKeyName` and `dataRegion`); the fix names the missing fields only.
- `gh-session` — `gh auth status` exits 0; when `gh config get git_protocol` is `https`, its output must mention `workflow` (fix `gh auth refresh -s workflow`).
- `vercel-session` — `vercel whoami` exits 0 (fix `vercel login`).
- `supabase-quota` — the organization exists, is on the free plan, and has fewer than 2 active projects other than one named `<slug>`.
- `github-repo` — `gh repo view <githubOwner>/<slug>` not found, or found and equal to config `repository`.
- `dash0` — `GET <DASH0_API_URL_<R>>/api/datasets/<slug>` (the call `scripts/providers/dash0-dataset.mjs` already makes) with `DASH0_AUTH_TOKEN_<R>` answers 2xx or 404; 401/402/403 gives fix `Dash0 trial ended or token revoked — the founder renews the Dash0 subscription`.

- [ ] **Step 1: Write the failing tests** with fakes: everything healthy returns all `ok`; a config issue fails `config` only; missing `docker` and `psql` fails `tool:database`; a missing `SMTP_PASS` field fails `master-keys` naming only `SMTP_PASS` (no value anywhere in the result); `vercel whoami` exit 1 fails `vercel-session`; 2 active Supabase projects fail `supabase-quota` while 1 active plus the startup's own project passes; Dash0 403 fails `dash0` with the fix above; https protocol without `workflow` fails `gh-session`.
- [ ] **Step 2: Run** `pnpm vitest run test/scripts/preflight.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `scripts/preflight.mjs`.
- [ ] **Step 4: Run** the test — expected PASS.
- [ ] **Step 5: Commit** `feat(scripts): add the single-prompt preflight`.

---

### Task 8: Skill flow — phase 1, phase 2, after the run

**Files:**
- Modify: `.claude/skills/create-startup/SKILL.md`
- Create: `.claude/skills/create-startup/references/phase-1-setup.md`, `references/phase-2-run.md`, `references/after-the-run.md`

**Interfaces:**
- Consumes: every CLI from Tasks 2–7, with their exact output lines; the spec sections "Phase 1 in detail", "Phase 2 in detail", "Caveman mode".
- Produces: the phase 2 step ids that Task 9's reference files and the ledger use: `preflight`, `repository`, `vercel-project`, `local-env`, `supabase`, `google-oauth`, `posthog`, `smtp`, `autumn`, `dash0`, `verify-local`, `deploy`, `smoke-test`, `report`.

Content, following the spec:
- `SKILL.md`: "The flow" becomes the two phases. Phase 1 → `phase-1-setup.md`. Phase 2 → `phase-2-run.md`, which runs the reference steps in the new order. "After the run" → `after-the-run.md`. Keep the stack table, the two hard rules and the secret channels. Remove step 2 (connectors) from the flow. The end-of-run checklist adds: production on the Autumn sandbox (anyone can pass the paywall with a Stripe test card until go-live), the old keys left for cleanup, how to remove caveman (`.claude/settings.json`).
- `phase-1-setup.md`: briefing text (time, accounts, keep the laptop awake and plugged in, push notifications reach the phone when Remote Control is on, phase 2 runs in bypass permissions mode and what guards remain, what stays for later); the interview (asked vs derived, one review message, then writing `startup.config.json`, `autumn.config.ts` and the landing copy as steps 1, 1b, 1d do, with `githubOwner` and `domain: ""`); the founder-only checklist in the spec's order, each item check-first; the consent list; `node scripts/preflight.mjs` until `PREFLIGHT OK`; the `/goal` line template with the consent clauses and the stop conditions verbatim from the spec, under 4,000 characters; the instruction to switch to bypass mode and paste the line.
- `phase-2-run.md`: no question to the founder, ever; start with `node scripts/preflight.mjs` and `node scripts/run-ledger.mjs status`, skip steps marked done; the step order and ids above, each mapped to its reference section and closed with `node scripts/run-ledger.mjs done <id>`; the failure policy (self-solve order, the closed founder list verbatim from the spec, no deletion, lost key replaced and listed); the block protocol (`node scripts/run-ledger.mjs blocked "<action>"`, push notification under 200 characters, then print `BLOCKED_ON_FOUNDER: <action>. When done, paste: <the /goal line>`); on resume `node scripts/run-ledger.mjs resume`; the smoke test (`node scripts/smoke-test.mjs` then the browser check exactly as the spec says, ending with `BROWSER CHECK PASSED`, never entering a card); the final report and a push notification with the URL.
- `after-the-run.md`: go-live (company details and `check-legal-identity.mjs`, today's 6f content moved here; the startup's Stripe account, KYC, live connection in Autumn, `autumn-login.mjs --live`, push the env again, redeploy); custom domain with Resend (today's domain branches); changing the price of an existing startup (today's 01b note on `termsVersion`); optional MCPs for later interactive work (today's step 2 content, shortened).

- [ ] **Step 1: Write** the three new files and the `SKILL.md` changes.
- [ ] **Step 2: Check** with `grep -n "ask\|confirm\|go-ahead" .claude/skills/create-startup/references/phase-2-run.md` that every hit is about the founder-only list or the block protocol, and that the `/goal` template in `phase-1-setup.md` is under 4,000 characters with placeholders filled by the longest realistic values (`wc -c` on a filled copy).
- [ ] **Step 3: Run** `pnpm check` — expected PASS.
- [ ] **Step 4: Commit** `docs(skill): two-phase single-prompt flow`.

---

### Task 9: Reference steps without founder questions

**Files:**
- Modify: `.claude/skills/create-startup/references/00-founder-setup.md`, `01-name-startup.md`, `01b-set-pricing.md`, `01c-create-repository.md`, `01d-storefront.md`, `03-install-and-secrets.md`, `04-provision-services.md`, `05-verify-locally.md`, `06-deploy-production.md`, `data-region.md`
- Delete: `.claude/skills/create-startup/references/02-connect-connectors.md` (its useful part moved to `after-the-run.md` in Task 8)

**Interfaces:**
- Consumes: the step ids of Task 8; the CLIs of Tasks 2–7; the inventory at `.superpowers/sdd/2026-11-12-single-prompt/step7-inventory.md` (copied there by the controller) listing every question (Q1–Q28), human action (H1–H37) and go-ahead (G1–G25) with file:line.

Edits:
- Every question and go-ahead in these files either moves to `phase-1-setup.md` (already written in Task 8) or is replaced by "read `<key>` from `startup.config.json`" / "covered by the phase 1 consent". Each file's opening says whether it runs in phase 1 or phase 2.
- `00`: drop `gcloud` (install and `gcloud auth login`); Stripe account no longer needed before go-live; Resend master key only for a custom domain.
- `01`, `01b`, `01d`: their questions now come from the phase 1 interview; the file keeps the derivation rules and the JSON they write (add `githubOwner`, `domain` always `""` in a run).
- `01c`: create the private repo and set `origin` **without pushing**; the first push moves to the deploy step.
- `04`: 4a creates the project with `node scripts/providers/supabase-project.mjs`, then `supabase-database.mjs --ref <ref>` (no Supabase MCP, no cost question); 4b creates both Google clients in one pass with the production redirect URI from config `productionUrl`, then publishes the app ("In production"), giving the landing as home page and `/legal/privacy` as privacy policy if asked; 4d uses SMTP (no domain); 4e runs `autumn-login.mjs` in its default sandbox mode, clicks Authorize under the phase 1 consent, and checks in the Autumn dashboard that the organization's default currency equals `pricing.currency` (if not, change the organization default in the dashboard before pushing prices).
- `05`: the localhost browser check is done by Claude in Chrome (sign in, onboarding, paywall), not by the founder.
- `06`: the Vercel project step becomes `node scripts/providers/vercel-project.mjs`, run in phase 2 right after the repository (step id `vercel-project`); set the `DATABASE_URL` and deploy-hook GitHub secrets and push `.env.prod`, then the first push of `master`; 6f (legal gate) and the Stripe live connection move to `after-the-run.md`; `atmn push -p` is not run while production uses the sandbox; 6h (second Google pass) is removed; the smoke test is `node scripts/smoke-test.mjs` plus the browser check of `phase-2-run.md`.
- `data-region.md`: the region pairs are fixed: `eu` → `eu-west-3` + `cdg1`, `us` → `us-east-1` + `iad1`.

- [ ] **Step 1: Edit** every file above and delete `02-connect-connectors.md`; fix every link to it.
- [ ] **Step 2: Check** with `grep -rn "02-connect-connectors\|gcloud\|Ask the founder\|ask the user\|go-ahead" .claude/skills/create-startup/` that every remaining hit is in `phase-1-setup.md`, `after-the-run.md` or the founder-only list; and walk the inventory's Q, H and G rows: each one is either in phase 1, covered by the consent, removed, or in `after-the-run.md`. Write the walk as a table in the task report.
- [ ] **Step 3: Run** `pnpm validate` — expected PASS.
- [ ] **Step 4: Commit** `docs(skill): remove founder questions from the run steps`.
