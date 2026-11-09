# Credential Vault and Zero Copy-Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every secret of every startup lives in 1Password and reaches its destination by script, so the founder pastes no key per startup and no secret value reaches the Claude transcript.

**Architecture:** A small `op` wrapper (`scripts/vault/op.mjs`) is the only code that talks to 1Password. Shared modules hold the env validation rules and dotenv parse/render. CLIs (`vault-put`, `vault-sync`, the rewired `set-env-var`, `init-env`, `push-env-to-vercel`) and one provisioning script per provider write to the vault first, then regenerate `.env` (real local values) or `.env.prod` (`op://` references). The `create-startup` skill is rewritten around these scripts plus a new one-time founder setup step.

**Tech Stack:** Node 25 (`.nvmrc`) ESM scripts (`.mjs`), 1Password CLI `op` 2.x with the desktop app integration, Vitest 4, Claude in Chrome for dashboards with no API.

**Spec:** `docs/superpowers/specs/2026-11-09-credential-vault-design.md` (approved 2026-11-09). Read it before any task.

**Branch:** `feat/credential-vault`, created from `docs/credential-vault-design`.

## Global Constraints

- English for identifiers, comments, docs, commits, logs (user-facing copy is not touched by this plan).
- A secret value is never printed, not even masked: scripts print field names, lengths and statuses only. The old `mask()` output of `set-env-var.mjs` (first and last 4 characters) goes away.
- A secret value never appears in argv. It reaches `op`, `vercel` and `gh` on stdin only. `op://` references may appear in argv.
- Vault names: `startup-<slug>` per startup, `startup-founder` for the founder. Items: `local`, `production` (plus `ci`, see Task 13) in a startup vault; `master-keys` in the founder vault. Field label = the env variable name, exactly. Field type: concealed.
- `.env.prod` holds an `op://startup-<slug>/production/<KEY>` reference on every secret line and plain values on the others. `.env` holds real values, local-only, except the stated SMTP exception.
- Clean break: no support for plain secret values in `.env.prod`, no migration command (spec decision 5).
- macOS only: `pbpaste` / `pbcopy`, the macOS Keychain, Homebrew.
- Scripts reach 1Password through the service account `startup-factory` (spec decision 6), never the desktop-app integration, which refuses processes launched by the Claude app. Its token lives in the macOS Keychain (service `startup-factory-op`, account = the macOS user name). It is read with `security find-generic-password -a <user> -s startup-factory-op -w` and passed to `op` only as the child's `OP_SERVICE_ACCOUNT_TOKEN`. It is never printed, never in argv, never in a file.
- Every region comes from `startup.config.json` `dataRegion` (`eu` / `us`), never chosen per service.
- 1Password is the one new SaaS; it is added to the `CLAUDE.md` infra list (Task 17).
- Scripts stay in `scripts/`. Tests go in `test/scripts/*.test.ts` and import the `.mjs` module, as `test/domain-boundaries.test.ts` does. Each CLI keeps its logic in exported functions and runs only behind an entry guard (`process.argv[1]?.endsWith('<file>.mjs')`, as in `scripts/check-domain-boundaries.mjs`), so tests can import it.
- Code that calls `op`, `fetch`, `pbpaste` or `spawnSync` takes it as an injected dependency, so tests use fakes and never touch a real vault or provider.
- Claude never creates accounts, types passwords or solves CAPTCHAs, and asks the founder's go-ahead before an OAuth consent or before creating a key in a dashboard. On a page that shows a secret, Claude uses narrow `find` queries only, never `get_page_text`, `read_page` or `screenshot`.
- No `--no-verify`. Conventional commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Done gate for the branch: `pnpm validate` green.

## Review Focus

1. **Service account token missing from the Keychain, rejected, or rate-limited mid-run.** Expect a non-zero exit with a message that says which (and points at step 0 for a missing or rejected token), never the token, and no env file rewritten. Pinned in Task 19 (`explains a missing Keychain token`, `classifies a rejected token`, `classifies the hourly limit`) and Task 4 (`leaves the env file untouched when the vault read fails`).
2. **Values with `=`, `,`, spaces, `%` or `#`** (OTLP headers, encoded database URLs) survive vault, then `.env`, then `parseEnv`, unchanged. Pinned in Task 2 (`round-trips awkward values`).
3. **Wrong or stale clipboard** (the client ID copied instead of the secret, or an empty clipboard). Expect a validation error, and the clipboard cleared in every case. Pinned in Task 5 (`clears the clipboard when validation fails`).
4. **Provider script re-run, or a remote key that exists while its vault field is missing** (keys are shown once). Expect no duplicate resource, and a rotated key when the vault lost it. Pinned in Tasks 9–13 (`is idempotent on re-run`, `rotates a key the vault does not hold`).
5. **A reference in `.env.prod` points at a field the vault does not have.** Expect the push to fail before any `vercel env` call, so Vercel is never half-updated. Pinned in Task 7 (`pushes nothing when a reference cannot be resolved`).

---

### Task 0: Spike — 1Password service account (founder present)

Gate for everything else. No production code. Amended 2026-11-09: the desktop-app integration was ruled out live (see the spec's constraints), so this spike checks the service account instead.

**Files:**
- Create: `docs/superpowers/notes/2026-11-09-op-spike.md`

- [ ] **Step 1: Create the service account and store its token (founder, in macOS Terminal.app).** `op` is installed (2.42.0) and `op vault list` works in Terminal.app.
  - The founder runs: `{ printf 'add-generic-password -U -a %s -s startup-factory-op -w ' "$USER"; op service-account create startup-factory --can-create-vaults --raw; } | security -i`. The token goes from `op` into the Keychain through `security -i`'s stdin, never on screen and never in argv.
  - If `security -i` rejects the line, the fallback is `security add-generic-password -U -a "$USER" -s startup-factory-op -w "$(op service-account create startup-factory --can-create-vaults --raw)"`. That puts the token in `security`'s argv for a moment on the founder's own machine, a one-time stated exception. Then revoke and recreate if the first attempt left a service account without a stored token.
- [ ] **Step 2: Check the token from Claude's shell.** Run `OP_SERVICE_ACCOUNT_TOKEN="$(security find-generic-password -a "$USER" -s startup-factory-op -w)" op vault list`. Expected: a list with no built-in vaults (service accounts cannot see them), and no desktop-app error. Record whether the Keychain showed a prompt.
- [ ] **Step 3: Probe a self-created vault.** With the token in the environment as in Step 2, run `op vault create startup-vault-spike`. Then pipe this JSON into `op item create --vault startup-vault-spike -` (docs: `-` reads the template from stdin): `{"title":"spike","category":"SECURE_NOTE","fields":[{"id":"SPIKE_FIELD","label":"SPIKE_FIELD","type":"CONCEALED","value":"spike-value"}]}`. The value is a dummy, so it may sit in argv for this probe only. If the service account cannot write items in a vault it created, stop: the spec's single-vault fallback (`startup-factory`) applies, and the plan's vault names change before Task 19.
  - Check with `op item get spike --vault startup-vault-spike --fields SPIKE_FIELD --reveal`. It must print `spike-value`.
  - Take the output of `op item get spike --vault startup-vault-spike --format json`, change the value to `spike-value-2`, and pipe it into `op item edit spike --vault startup-vault-spike`. Piped edits need CLI 2.23 or later.
  - Check again. Also check that the default `notesPlain` field survived. That tells whether a piped edit replaces the whole item or merges fields.
  - Check that the JSON from `op item get --format json` holds the concealed value both with and without `--reveal`.
- [ ] **Step 4: Probe reads** (token in the environment as in Step 2). Write `/private/tmp/op-spike.env` holding `A=op://startup-vault-spike/spike/SPIKE_FIELD` and `B=plain`. `op inject -i /private/tmp/op-spike.env` must print both lines with `A` resolved. `op run --env-file=/private/tmp/op-spike.env -- printenv A` must print `<concealed by 1Password>`.
- [ ] **Step 5: Record exit codes and stderr** for: a rejected token (`OP_SERVICE_ACCOUNT_TOKEN=ops_invalid op vault list`), a missing item (`op item get nope --vault startup-vault-spike`) and a missing vault. The documented hourly-limit error is `[ERROR] (429) Too Many Requests: You've reached the maximum number of this type of requests this service account is allowed to make...`; do not provoke it.
- [ ] **Step 6: Write the notes file.** Record the Keychain behavior, the exact create and edit invocations that worked, whether a piped edit replaces or merges, and the stderr strings from Step 5. These strings drive `classifyOpFailure` in Task 19.
- [ ] **Step 7: Clean up.** Ask the founder, then run `op vault delete startup-vault-spike` with the token (irreversible; a service account can delete only vaults it created) and `rm /private/tmp/op-spike.env`. Keep the service account and its Keychain entry.
- [ ] **Step 8: Gate.** Continue to Task 19 only if Steps 2–4 passed. If the token cannot be read from Claude's shell, or `op` still needs the desktop app with the token set, stop and report to the founder.
- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/notes/2026-11-09-op-spike.md
git commit -m "docs(notes): record 1Password CLI spike results"
```

---

### Task 1: Shared env validation rules

Move the rules out of `set-env-var.mjs` so `vault-put` and the provider scripts share them, and mark which keys are secret.

**Files:**
- Create: `scripts/env/rules.mjs`
- Modify: `scripts/set-env-var.mjs:38-203` (rules and checks move out; the CLI imports them)
- Test: `test/scripts/env-rules.test.ts`

**Interfaces:**
- Produces:
  - `validateEnvValue(key: string, value: string, options: { environment: 'local' | 'production' }): { errors: string[]; warnings: string[] }`
  - `isSecretKey(key: string): boolean`
  - `SECRET_KEYS: ReadonlySet<string>`

`SECRET_KEYS`:
- app keys: `BETTER_AUTH_SECRET`, `EARLY_ACCESS_PEPPER`, `ENCRYPTION_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `RESEND_API_KEY`, `SMTP_PASS`, `AUTUMN_SECRET_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `OTEL_EXPORTER_OTLP_HEADERS`, `VERCEL_DEPLOY_HOOK_URL`;
- master keys: `RESEND_FULL_ACCESS_API_KEY`, `SUPABASE_ACCESS_TOKEN`, plus `POSTHOG_PERSONAL_API_KEY_EU`, `POSTHOG_PERSONAL_API_KEY_US`, `DASH0_AUTH_TOKEN_EU` and `DASH0_AUTH_TOKEN_US`. PostHog accounts and Dash0 organizations are per region, see Task 9.

New master-key rules:
- `warnPrefix`: `RESEND_FULL_ACCESS_API_KEY: 're_'`, `SUPABASE_ACCESS_TOKEN: 'sbp_'`, `POSTHOG_PERSONAL_API_KEY_EU` / `_US: 'phx_'`, `DASH0_AUTH_TOKEN_EU` / `_US: 'auth_'`;
- `url: true`: `DASH0_API_URL_EU` / `_US`;
- `url: true, otlpEndpoint: true`: `DASH0_OTLP_ENDPOINT_EU` / `_US`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { isSecretKey, validateEnvValue } from '../../scripts/env/rules.mjs';

describe('validateEnvValue', () => {
  it('rejects a Supabase database in the local environment', () => {
    const r = validateEnvValue('DATABASE_URL', 'postgresql://postgres.ref:pw@aws-0-eu-west-3.pooler.supabase.com:5432/postgres', { environment: 'local' });
    expect(r.errors).toContain('.env is the local environment and must use local Postgres — the Supabase database belongs in .env.prod');
  });
  it('warns when production points at localhost', () => {
    const r = validateEnvValue('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/acme', { environment: 'production' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain('localhost');
  });
  it('rejects placeholders', () => {
    expect(validateEnvValue('SMTP_PASS', '[YOUR-PASSWORD]', { environment: 'local' }).errors).toContain('value is still a placeholder');
  });
  it('rejects an OTLP endpoint with a trailing slash', () => {
    expect(validateEnvValue('OTEL_EXPORTER_OTLP_ENDPOINT', 'https://ingress.eu-west-1.aws.dash0.com/', { environment: 'production' }).errors.length).toBe(1);
  });
  it('warns on a master key with the wrong prefix', () => {
    expect(validateEnvValue('POSTHOG_PERSONAL_API_KEY_EU', 'phc_abc', { environment: 'production' }).warnings.length).toBe(1);
  });
});

describe('isSecretKey', () => {
  it('treats public and plain values as non-secret', () => {
    expect(isSecretKey('NEXT_PUBLIC_POSTHOG_KEY')).toBe(false);
    expect(isSecretKey('EMAIL_PROVIDER')).toBe(false);
  });
  it('treats credentials as secret', () => {
    expect(isSecretKey('OTEL_EXPORTER_OTLP_HEADERS')).toBe(true);
    expect(isSecretKey('DATABASE_URL')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/env-rules.test.ts`. Expected: FAIL, cannot resolve `scripts/env/rules.mjs`.
- [ ] **Step 3: Implement `scripts/env/rules.mjs`.** Move `RULES`, `checkOtlpEndpoint`, `checkOtlpHeaders`, `checkDatabaseUrl`, `parseHeaderPairs` and `decodeOrRaw` from `set-env-var.mjs` without changing their messages. `IS_LOCAL_FILE` becomes `options.environment === 'local'`. `ENV_PATH` in the localhost warning becomes `the production environment`. `set-env-var.mjs` imports `validateEnvValue` and keeps working as before.
- [ ] **Step 4: Run tests.** Run `pnpm vitest run test/scripts/env-rules.test.ts`. Expected: PASS. Also run `printf %s "postgresql://postgres:postgres@localhost:5432/x" | node scripts/set-env-var.mjs --file /private/tmp/none.env DATABASE_URL`. Expected: the validation passes, then it exits 1 with `/private/tmp/none.env not found — run scripts/init-env.mjs first`.
- [ ] **Step 5: Commit** `refactor(scripts): share env validation rules and mark secret keys`.

---

### Task 2: Dotenv parse and render

**Files:**
- Create: `scripts/env/dotenv.mjs`
- Test: `test/scripts/dotenv.test.ts`

**Interfaces:**
- Produces:
  - `parseEnv(text: string): Map<string, string>`: the same rules as `parseEnvFile` in `push-env-to-vercel.mjs:46-64` (skips comments and empty values, strips matching quotes).
  - `renderEnv({ template, values }: { template: string; values: Map<string, string> }): string`: keeps every template line. A `KEY=` line whose key is in `values` becomes `KEY=<formatted value>`. Keys absent from the template are appended after the line `# Not in .env.template`. Wrap a value in double quotes when it contains whitespace or `#`. Throw `Error('<KEY> contains a newline or a double quote, which an env file cannot hold')` for those characters.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseEnv, renderEnv } from '../../scripts/env/dotenv.mjs';

const template = '# App\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nDATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"\nSMTP_PASS=\n';

describe('renderEnv', () => {
  it('fills template keys and keeps comments and defaults', () => {
    const out = renderEnv({ template, values: new Map([['SMTP_PASS', 'abcd efgh']]) });
    expect(out).toContain('# App');
    expect(out).toContain('NEXT_PUBLIC_APP_URL=http://localhost:3000');
    expect(out).toContain('SMTP_PASS="abcd efgh"');
  });
  it('appends keys the template lacks', () => {
    expect(renderEnv({ template, values: new Map([['EXTRA', 'x']]) })).toMatch(/# Not in \.env\.template\nEXTRA=x/);
  });
  it('round-trips awkward values', () => {
    const values = new Map([
      ['OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Bearer auth_abc,Dash0-Dataset=acme'],
      ['DATABASE_URL', 'postgresql://postgres.ref:p%40ss@aws-0-eu-west-3.pooler.supabase.com:5432/postgres'],
      ['SMTP_FROM_NAME', 'Acme #1'],
    ]);
    const parsed = parseEnv(renderEnv({ template, values }));
    for (const [k, v] of values) expect(parsed.get(k)).toBe(v);
  });
  it('refuses a value with a newline', () => {
    expect(() => renderEnv({ template, values: new Map([['SMTP_PASS', 'a\nb']]) })).toThrow('SMTP_PASS contains a newline');
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/dotenv.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement `scripts/env/dotenv.mjs`.** Move `parseEnvFile` there as `parseEnv(text)`. The caller reads the file.
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): add dotenv parse and render helpers`.

---

### Task 3: `op` wrapper and vault names

**Files:**
- Create: `scripts/vault/names.mjs`, `scripts/vault/op.mjs`
- Test: `test/scripts/vault-names.test.ts`, `test/scripts/vault-op.test.ts`

**Interfaces:**
- Produces from `names.mjs`:
  - `FOUNDER_VAULT = 'startup-founder'`, `MASTER_KEYS_ITEM = 'master-keys'`, `CI_ITEM = 'ci'`
  - `ITEM_FOR_ENVIRONMENT = { local: 'local', production: 'production' }`, `ENV_FILE_FOR_ENVIRONMENT = { local: '.env', production: '.env.prod' }`
  - `startupVault(slug: string): string`: returns `startup-${slug}`. Throws when the slug does not match `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
  - `secretReference({ vault, item, field }): string`: returns `op://${vault}/${item}/${field}`.
  - `readStartupConfig(path = 'startup.config.json'): { name: string; slug: string; domain: string; dataRegion: 'eu' | 'us' }`: throws `startup.config.json is missing slug or dataRegion — run step 1 first` when either field is absent.
  - `environmentForFile(path: string): 'local' | 'production'`: basename `.env` gives `local` and `.env.prod` gives `production`. Any other basename throws.
  - `masterKeyName(base: string, dataRegion: 'eu' | 'us'): string`: returns `${base}_${dataRegion.toUpperCase()}`.
- Produces from `op.mjs`:
  - `createOp({ run }: { run?: OpRunner }): Op`, where `OpRunner = (args: string[], options?: { input?: string }) => { status: number; stdout: string; stderr: string }`. The default runner is `spawnSync('op', args, { input, encoding: 'utf8' })`.
  - `Op.ensureVault(name: string): 'existing' | 'created'`
  - `Op.readFields({ vault, item }): Map<string, string> | null`: one `op item get <item> --vault <vault> --format json --reveal` call. Maps each field's `label` to its `value` and skips fields with no value, such as `notesPlain`. Returns `null` when the item is missing.
  - `Op.writeFields({ vault, item, fields }: { vault: string; item: string; fields: Map<string, string> }): 'created' | 'updated'`: one `op item get`, then one write, with the JSON on stdin and never in argv.
    - Item missing: `op item create --vault <vault> -` with `{ title: item, category: 'SECURE_NOTE', fields: [{ id: KEY, label: KEY, type: 'CONCEALED', value }] }`.
    - Item present: take the full JSON from the get, replace or append the given fields, and pipe the whole item to `op item edit <item> --vault <vault>`. Sending the full item is safe whether a piped edit merges or replaces (Task 0 records which).
  - `Op.inject(path: string): string`: `op inject -i <path>`.
  - `Op.read(reference: string): string`: `op read <reference>`.
  - `class OpError extends Error`, built with `new OpError(kind: 'locked' | 'missing' | 'failed', message?: string)` and exposing `kind`. Also `classifyOpFailure(stderr: string): 'locked' | 'missing' | 'failed'`. The message for `locked` is `1Password is locked — approve the prompt and re-run`.

- [ ] **Step 1: Write the failing tests.**
  - `vault-names.test.ts`:
    - `startupVault('acme-analytics') === 'startup-acme-analytics'`;
    - `startupVault('Acme')` throws;
    - `secretReference({ vault: 'startup-acme', item: 'production', field: 'DATABASE_URL' }) === 'op://startup-acme/production/DATABASE_URL'`;
    - `environmentForFile('/x/.env.prod') === 'production'`;
    - `environmentForFile('.env.staging')` throws.
  - `vault-op.test.ts` uses a fake runner that records calls and returns scripted results:

```ts
it('never puts a value in argv', () => {
  const calls: string[][] = [];
  const op = createOp({ run: (args, o) => { calls.push(args); return { status: args[0] === 'item' && args[1] === 'get' ? 1 : 0, stdout: '{}', stderr: args[1] === 'get' ? '[ERROR] "local" isn\'t an item in the "startup-acme" vault' : '' }; } });
  op.writeFields({ vault: 'startup-acme', item: 'local', fields: new Map([['SMTP_PASS', 's3cr3t-value']]) });
  expect(calls.flat().some((a) => a.includes('s3cr3t-value'))).toBe(false);
});
it('sends concealed fields labelled by key on stdin', () => { /* capture options.input of the create call; JSON.parse it; expect fields[0] toMatchObject { label: 'SMTP_PASS', type: 'CONCEALED', value: 's3cr3t-value' } */ });
it('returns null for a missing item', () => { /* runner status 1 + missing-item stderr from the Task 0 notes */ });
it('classifies a dismissed prompt as locked', () => { /* stderr string for a dismissed prompt from the Task 0 notes; expect OpError with kind 'locked' */ });
```

- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vault-names.test.ts test/scripts/vault-op.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both modules.** Use the stderr strings and the create and edit invocations recorded in `docs/superpowers/notes/2026-11-09-op-spike.md`. `writeFields` merges in memory: `readFields` first, then one write.
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): add 1Password CLI wrapper and vault naming`.

---

### Task 4: `vault-sync` (env files from the vault)

**Files:**
- Create: `scripts/vault-sync.mjs`
- Test: `test/scripts/vault-sync.test.ts`

**Interfaces:**
- Consumes: `renderEnv` (Task 2), `isSecretKey` (Task 1), `Op.readFields`, `secretReference`, `ITEM_FOR_ENVIRONMENT`, `ENV_FILE_FOR_ENVIRONMENT` (Task 3).
- Produces:
  - `buildEnvValues({ fields, environment, vault }): Map<string, string>`: for `local`, the real values. For `production`, a secret key maps to `secretReference({ vault, item: 'production', field: key })` and any other key to its value.
  - `syncEnvFile({ op, vault, environment, templatePath = '.env.template', outPath = ENV_FILE_FOR_ENVIRONMENT[environment], fs }): { path: string; keys: number }`: throws `no 1Password item <vault>/<item> — run node scripts/init-env.mjs --apply<' --file .env.prod' for production> first` when the item is missing.
  - CLI: `node scripts/vault-sync.mjs --env local|production`. It prints `<path> regenerated from <vault>/<item> (<n> keys)`.

- [ ] **Step 1: Write the failing tests:**
  - `writes references for production secrets`: fields `DATABASE_URL`, `EMAIL_PROVIDER=resend`; the output map has `DATABASE_URL => 'op://startup-acme/production/DATABASE_URL'` and `EMAIL_PROVIDER => 'resend'`.
  - `writes real values for local`.
  - `leaves the env file untouched when the vault read fails`: `readFields` throws an `OpError('locked')`; the fake `fs.writeFileSync` is never called.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vault-sync.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Render in memory, then write the file in one `writeFileSync` call. Never write before the read succeeds.
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): regenerate env files from 1Password`.

---

### Task 5: `vault-put` (stdin and clipboard channels)

**Files:**
- Create: `scripts/vault-put.mjs`
- Test: `test/scripts/vault-put.test.ts`

**Interfaces:**
- Consumes: `validateEnvValue` (Task 1); `createOp`, `startupVault`, `readStartupConfig`, `FOUNDER_VAULT` (Task 3); `syncEnvFile` (Task 4), called only when the item is `local` or `production`.
- Produces:
  - `putValue({ op, vault, item, field, value }): { warnings: string[] }`: validates with `environment` = `'local'` when `item === 'local'`, else `'production'`. Throws `ValidationError` (with `errors: string[]`) and writes nothing on errors.
  - `readClipboardOnce({ run }): string`: runs `pbpaste`, then always runs `pbcopy` with empty stdin, in a `finally`.
  - CLI: `node scripts/vault-put.mjs [--vault <name>] [--from-clipboard] <item> <FIELD>`. The default vault is `startupVault(readStartupConfig().slug)`. On success it prints `OK  <FIELD> stored in <vault>/<item> (<n> chars)`. For `local` and `production` it then regenerates the matching env file.

- [ ] **Step 1: Write the failing tests:**
  - `stores a valid value and returns warnings`: fake `op.writeFields` called once with `Map{GOOGLE_CLIENT_ID => 'x'}`; one `warnings` entry about `.apps.googleusercontent.com`.
  - `writes nothing on a validation error`: `SMTP_PASS='short'` throws `ValidationError`; `writeFields` is never called.
  - `clears the clipboard when validation fails`: the fake runner returns `''` for `pbpaste`; `readClipboardOnce` followed by `putValue` throws; the runner received `['pbcopy']` with `input: ''`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vault-put.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `scripts/vault-put.mjs`.** On `OpError`, the CLI prints its message and exits 1. On `ValidationError`, it prints each error as `ERROR    <FIELD>: <message>`, then `Nothing was written.`, and exits 1.
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): add vault-put for stdin and clipboard secrets`.

---

### Task 6: Rewire `set-env-var` and `init-env` to the vault

**Files:**
- Modify: `scripts/set-env-var.mjs` (whole file: same CLI, new storage)
- Modify: `scripts/init-env.mjs` (planning becomes a pure function; apply writes to the vault)
- Test: `test/scripts/init-env.test.ts`

**Interfaces:**
- Consumes: `putValue` (Task 5), `syncEnvFile` (Task 4), `environmentForFile`, `startupVault`, `readStartupConfig`, `createOp`, `ITEM_FOR_ENVIRONMENT` (Task 3).
- Produces:
  - `set-env-var.mjs` keeps `[--file <envFile>] <KEY>` with the value on stdin. It becomes `putValue` into `startupVault(slug)` / `ITEM_FOR_ENVIRONMENT[environmentForFile(file)]`, then `syncEnvFile`. Its output matches `vault-put`.
  - `planInitialValues({ existing, appUrl, config }: { existing: Map<string, string>; appUrl: string; config: { slug: string; dataRegion: 'eu' | 'us' } }): Array<{ key: string; next: string | null; note: string }>`: the same rules as today's `init-env.mjs:109-125` (`SECRETS`, `CONSTANTS`, `DERIVED`, `isUnset`).
  - `init-env.mjs --apply [--file .env|.env.prod] [--app-url <url>]`: runs `ensureVault`, then one `writeFields` with every `next !== null`, then `syncEnvFile`. A dry run prints the plan and touches nothing. A missing `startup.config.json` slug is now an error, because the vault name needs it.

- [ ] **Step 1: Write the failing tests:**
  - `generates secrets only when unset`: given `existing` with `BETTER_AUTH_SECRET` set, its entry has `next === null`, and `EARLY_ACCESS_PEPPER` has a 64-character hex `next`.
  - `derives the PostHog host from dataRegion`: `us` gives `https://us.i.posthog.com`.
  - `an explicit app URL replaces a stale one`: `existing` holds `NEXT_PUBLIC_APP_URL=http://localhost:3000` and `appUrl` is `https://acme.com`, so `next` is `https://acme.com`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/init-env.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both rewires.** `init-env.mjs` stops copying `.env.template`, because `syncEnvFile` renders from it.
- [ ] **Step 4: Run tests.** Run `pnpm vitest run test/scripts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): store set-env-var and init-env values in 1Password`.

---

### Task 7: `push-env-to-vercel` resolves references

**Files:**
- Modify: `scripts/push-env-to-vercel.mjs` (wrap the top-level flow in `main()` behind an entry guard, and use `parseEnv` from Task 2)
- Test: `test/scripts/push-env-to-vercel.test.ts`

**Interfaces:**
- Consumes: `parseEnv` (Task 2), `createOp` / `Op.inject` (Task 3).
- Produces:
  - `resolveEnvValues({ path, op, fs }): Map<string, string>`: when the file contains `op://`, it parses `op.inject(path)`, else the raw file. It throws `Unresolved 1Password references: <KEYS>` when any resolved value still starts with `op://`.
  - `pushEnv({ values, target, run }): { ok: number; failed: number }`: the current rm/add loop, with `run` injected.
  - `main({ argv, op, run, fs }): number`: the whole CLI flow, returning the exit code. The entry guard calls it with the real dependencies.

- [ ] **Step 1: Write the failing tests:**
  - `resolves references through op inject`: the fake `op.inject` returns `DATABASE_URL=postgresql://real`; the result has the real value.
  - `refuses an unresolved reference`: the inject output still holds `GOOGLE_CLIENT_SECRET=op://startup-acme/production/GOOGLE_CLIENT_SECRET`, so it throws with that key.
  - `pushes nothing when a reference cannot be resolved`: `op.inject` throws `new OpError('missing')`; `main` returns 1 and the fake `run` received zero `vercel env` calls.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/push-env-to-vercel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Resolve and check every value before the first `vercel env` call.
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): resolve 1Password references before pushing to Vercel`.

---

### Task 8: Google client file import (download channel)

**Files:**
- Create: `scripts/vault-import-google-client.mjs`
- Test: `test/scripts/vault-import-google-client.test.ts`

**Interfaces:**
- Consumes: `putValue` (Task 5), `syncEnvFile` (Task 4).
- Produces:
  - `readGoogleClientFile(text: string): { clientId: string; clientSecret: string }`: reads `web.client_id` and `web.client_secret`. Throws `not a Google OAuth web client file` otherwise.
  - CLI: `node scripts/vault-import-google-client.mjs --env local|production <path>`. It stores `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, regenerates the env file, and deletes the file **only after** the vault write succeeds. On failure it keeps the file and prints its path: Google shows a new client secret only once.

- [ ] **Step 1: Write the failing tests:**
  - `reads a web client file`.
  - `rejects an installed-app file` (`{ installed: {...} }`).
  - `keeps the file when the vault write fails` (fake `op` throws; fake `fs.rmSync` is not called).
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vault-import-google-client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): import Google OAuth client files into 1Password`.

---

### Task 9: Provider plumbing and the Supabase database password

API facts were checked against the official docs on 2026-11-09. Everything marked "live-verify" is checked again in Task 18.

**Files:**
- Create: `scripts/providers/http.mjs`, `scripts/providers/master-keys.mjs`, `scripts/providers/supabase-database.mjs`
- Test: `test/scripts/providers-http.test.ts`, `test/scripts/supabase-database.test.ts`

**Interfaces:**
- Consumes: `createOp`, `startupVault`, `readStartupConfig`, `FOUNDER_VAULT`, `MASTER_KEYS_ITEM` (Task 3); `validateEnvValue` (Task 1); `syncEnvFile` (Task 4).
- Produces:
  - `requestJson({ fetch, method, url, token, body }): Promise<{ status: number; json: any }>`:
    - sends `Authorization: Bearer <token>` and `User-Agent: startup-boilerplate-scripts` (Resend requires a User-Agent);
    - treats 404 as a normal result;
    - throws `ProviderError({ provider, status, message })` on any other non-2xx. The message comes from the response, never from the request.
  - `readMasterKeys({ op, fields }: { op: Op; fields: string[] }): Map<string, string>`: throws `missing in startup-founder/master-keys: <FIELDS> — run step 0, item 6` when a field is absent.
  - `provisionSupabaseDatabase({ op, fetch, connect, ref, slug, rotate }): Promise<'created' | 'reused'>`
  - CLI: `node scripts/providers/supabase-database.mjs --ref <ref> [--rotate]`
- PostHog accounts and Dash0 organizations are per region, so their master keys carry the region suffix from `masterKeyName` (Task 3).

Supabase facts:
- host `https://api.supabase.com`, token `SUPABASE_ACCESS_TOKEN` from the master keys;
- `PATCH /v1/projects/{ref}/database/password` with `{ password }`;
- `GET /v1/projects/{ref}/config/database/pooler` returns an array of `{ db_host, db_port, db_user, pool_mode, … }`. The docs say the host cannot be derived from the region, so the `aws-0-`/`aws-1-` guess goes away.

Behavior:
1. Read `startup-<slug>/production`. If it holds `DATABASE_URL`, `--rotate` is absent and `connect(url)` succeeds, return `'reused'`.
2. Otherwise generate 32 base64url characters with `crypto.randomBytes(24).toString('base64url')`, then PATCH the password.
3. Take the pooler entry whose `pool_mode` is `session`. If there is none, take `db_host` from the first entry. Port is 5432 and the user is `postgres.<ref>` either way.
4. Build `postgresql://postgres.<ref>:<password>@<db_host>:5432/postgres` and validate it with `environment: 'production'`.
5. In one `writeFields` call, write `DATABASE_URL` and `DATABASE_SSL=require` to the production item.
6. `connect(url)` must succeed (`select 1`). Otherwise throw `database password set but connection failed: <code>`.
7. Run `syncEnvFile` for production.

`connect` defaults to the `postgres` package with `{ ssl: 'require', max: 1 }`.

- [ ] **Step 1: Write the failing tests:**
  - `throws ProviderError with the response message on 401` (`requestJson`);
  - `lists every missing master key`;
  - `is idempotent on re-run`: the vault holds a URL and `connect` resolves, so fetch is called zero times and the result is `'reused'`;
  - `uses the session pooler host from the API`: the fake pooler response has `db_host: 'aws-1-eu-west-3.pooler.supabase.com'`, `pool_mode: 'session'`. The written `DATABASE_URL` contains `postgres.abc:` and `@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`, and the PATCH body password has 32 characters.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/providers-http.test.ts test/scripts/supabase-database.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): set the Supabase database password by API into 1Password`.

---

### Task 10: Dash0 dataset and ingest token

**Files:**
- Create: `scripts/providers/dash0-dataset.mjs`
- Test: `test/scripts/dash0-dataset.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `readMasterKeys`, `masterKeyName` (Task 9); `syncEnvFile` (Task 4).
- Produces: `provisionDash0({ op, fetch, slug, dataRegion }): Promise<{ dataset: 'created' | 'reused'; token: 'created' | 'reused' | 'rotated' }>`; CLI `node scripts/providers/dash0-dataset.mjs`.

Master keys, with `<R>` = `EU` or `US`:
- `DASH0_AUTH_TOKEN_<R>`: an admin-level token with action `*` and no dataset restriction, which managing tokens requires;
- `DASH0_API_URL_<R>`, e.g. `https://api.eu-west-1.aws.dash0.com`;
- `DASH0_OTLP_ENDPOINT_<R>`, e.g. `https://ingress.eu-west-1.aws.dash0.com`.

Dash0 facts:
- the dataset slug must match `^[a-zA-Z0-9_-]{3,26}$`. Otherwise throw `slug "<slug>" is not a valid Dash0 dataset id (3-26 letters, digits, - or _)`.
- `PUT /api/datasets/{slug}` creates when missing. Body: `{ apiVersion: 'dash0.com/v1alpha1', kind: 'Dash0Dataset', metadata: { name: slug, labels: { 'dash0.com/id': slug } }, spec: {} }`.
- Token origin is `<slug>-ingest`. `PUT /api/auth-tokens/<origin>` creates when missing and returns `spec.token` only on creation. Body: `{ kind: 'Dash0AuthToken', metadata: { name: '<slug> ingest', labels: { 'dash0.com/origin': origin } }, spec: { actions: ['ingest:*'], scope: { datasets: { restriction: 'restricted', slugs: [slug] } } } }` (field combination: live-verify).

Behavior:
1. PUT the dataset.
2. If the production item holds `OTEL_EXPORTER_OTLP_HEADERS`, the token is `'reused'`.
3. Otherwise `GET /api/auth-tokens/<origin>`. If it exists, `DELETE` it first; the token is `'rotated'`.
4. PUT the token.
5. Write `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>,Dash0-Dataset=<slug>` and `OTEL_SERVICE_NAME=<slug>` to production only. `local` is never touched.
6. Run `syncEnvFile` for production.

- [ ] **Step 1: Write the failing tests:**
  - `writes the endpoint and headers to production only`;
  - `is idempotent on re-run`: headers already in the vault, so there is no token request;
  - `rotates a key the vault does not hold`: the GET returns 200, the vault has no headers, so the request order is DELETE, then PUT;
  - `rejects a slug Dash0 cannot use` (`a-very-long-startup-name-over-26`).
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/dash0-dataset.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): provision the Dash0 dataset and ingest token into 1Password`.

---

### Task 11: PostHog projects

**Files:**
- Create: `scripts/providers/posthog-projects.mjs`
- Test: `test/scripts/posthog-projects.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `readMasterKeys`, `masterKeyName` (Task 9); `syncEnvFile` (Task 4).
- Produces: `provisionPostHog({ op, fetch, slug, name, dataRegion }): Promise<{ local: 'created' | 'reused' | 'skipped'; production: 'created' | 'reused' }>`; CLI `node scripts/providers/posthog-projects.mjs`.

Facts:
- management host `https://eu.posthog.com` / `https://us.posthog.com` by `dataRegion`;
- master key `POSTHOG_PERSONAL_API_KEY_<R>` with scopes `organization:read`, `project:read` and `project:write`;
- `GET /api/organizations/@current/` gives the org `id`;
- `GET /api/organizations/{id}/projects/` gives `results[]`, with `{ id, name, api_token }` (pagination shape: live-verify);
- `POST /api/organizations/{id}/projects/` with `{ name }` returns `api_token` (`phc_…`).

Behavior:
1. For each environment, find a project named `<name> (local)` or `<name>`. Reuse its `api_token`, else create it.
2. Write `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` (`https://eu.i.posthog.com` / `https://us.i.posthog.com`) to each item.
3. If creating the local project fails with a 4xx that names a plan or project limit, the local result is `'skipped'`. The local key stays empty, so analytics are a no-op locally, and the script prints `WARNING  PostHog plan refused a second project — local analytics disabled`.
4. Run `syncEnvFile` for both environments.

- [ ] **Step 1: Write the failing tests:**
  - `creates two projects and writes each key to its own item`;
  - `is idempotent on re-run`: both names are listed, so there is no POST;
  - `skips the local project when the plan refuses it`: the POST for `(local)` returns 402 with `project limit`, the production key is still written, and `local` is `'skipped'`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/posthog-projects.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): provision PostHog projects into 1Password`.

---

### Task 12: Resend sending keys

**Files:**
- Create: `scripts/providers/resend-keys.mjs`
- Test: `test/scripts/resend-keys.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `readMasterKeys` (Task 9); `syncEnvFile` (Task 4).
- Produces: `provisionResend({ op, fetch, slug, domain }): Promise<{ local: 'created' | 'reused' | 'rotated'; production: 'created' | 'reused' | 'rotated' }>`; CLI `node scripts/providers/resend-keys.mjs`.

Facts:
- host `https://api.resend.com` for every region, with master key `RESEND_FULL_ACCESS_API_KEY`;
- `GET /domains` gives `data[]` with `{ id, name, status, region }`;
- `GET /api-keys` gives `data[]` with `{ id, name }` and no token;
- `POST /api-keys` with `{ name, permission: 'sending_access', domain_id }` returns `{ id, token }`. The token is shown once.
- `DELETE /api-keys/{id}` (live-verify).

Behavior:
1. With an empty `startup.config.json` `domain`, throw `no domain in startup.config.json — Resend needs one (roadmap item 4); use SMTP for now`.
2. With no Resend domain of that name, throw `domain <domain> is not in Resend — add and verify it first`.
3. Key names are `<slug>-local` and `<slug>-production`. A vault item that already holds `RESEND_API_KEY` is `'reused'`. Otherwise delete any remote key of that name (`'rotated'`), then create one.
4. Write `RESEND_API_KEY`, `EMAIL_PROVIDER=resend` and `RESEND_FROM_EMAIL=noreply@<domain>` to each item.
5. Run `syncEnvFile` for both environments.

- [ ] **Step 1: Write the failing tests:**
  - `scopes each key to the startup's domain` (POST body `domain_id` equals the listed id, and `permission` is `sending_access`);
  - `is idempotent on re-run`;
  - `rotates a key the vault does not hold`;
  - `stops when the domain is not in Resend`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/resend-keys.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): provision Resend sending keys into 1Password`.

---

### Task 13: Vercel deploy hook into the vault and GitHub

Vercel has no public REST endpoint for deploy hooks. The CLI has `vercel deploy-hooks` and reuses the `vercel login` session, so no Vercel token is needed.

**Files:**
- Create: `scripts/providers/vercel-deploy-hook.mjs`
- Test: `test/scripts/vercel-deploy-hook.test.ts`

**Interfaces:**
- Consumes: `createOp`, `startupVault`, `CI_ITEM` (Task 3).
- Produces: `provisionDeployHook({ op, run, vault, project }): 'created' | 'reused'`. The injected `run` is `spawnSync` for `vercel` and `gh`. CLI: `node scripts/providers/vercel-deploy-hook.mjs --project <vercel-project>`.

Behavior:
1. Run `vercel deploy-hooks list --project <project> --json` and look for a hook named `production` (JSON shape: live-verify). If it exists, reuse its `url`.
2. Otherwise run `vercel deploy-hooks create production --git-branch master --project <project>` and take the URL from stdout with `/https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/\S+/`.
3. Write `VERCEL_DEPLOY_HOOK_URL` to `startup-<slug>/ci`. That item is never rendered into an env file or pushed to Vercel.
4. Run `gh secret set VERCEL_DEPLOY_HOOK_URL` with the URL as `input`.
5. Print `OK  deploy hook production <created|reused>, stored in <vault>/ci, set as GitHub secret`.
6. A missing `deploy-hooks` command (older CLI) throws `update the Vercel CLI: pnpm add -g vercel@latest`.

- [ ] **Step 1: Write the failing tests:**
  - `creates the hook and pipes it to gh on stdin`: the URL is not in any argv, and the gh call has `input` equal to the URL;
  - `is idempotent on re-run`: the list returns `production`, so there is no `create` call;
  - `asks for a newer CLI when deploy-hooks is unknown`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vercel-deploy-hook.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): create the Vercel deploy hook into 1Password and GitHub`.

---

### Task 14: Autumn keys from `atmn login`

Facts, from `atmn` 2.0.219:
- `atmn login` runs a browser OAuth flow in which the founder picks the organization. It writes `AUTUMN_SECRET_KEY` (sandbox) and `AUTUMN_PROD_SECRET_KEY` (production) to `.env` and prints no key.
- `atmn push` needs `--yes` to apply, and `-p` targets production.
- The shell environment overrides `.env` (live-verify).

**Files:**
- Create: `scripts/vault-import-autumn-keys.mjs`
- Test: `test/scripts/vault-import-autumn-keys.test.ts`

**Interfaces:**
- Consumes: `parseEnv` (Task 2), `putValue` (Task 5), `syncEnvFile` (Task 4).
- Produces: `importAutumnKeys({ op, fs, vault }): { local: boolean; production: boolean }`; CLI `node scripts/vault-import-autumn-keys.mjs`.

Behavior:
1. Read `.env`.
2. Write `AUTUMN_SECRET_KEY` to `local`, and `AUTUMN_PROD_SECRET_KEY` to `production` as `AUTUMN_SECRET_KEY`.
3. Throw `AUTUMN_SECRET_KEY in .env is a live key — run atmn login again and pick the sandbox` when the local value starts with `am_sk_live_`.
4. Run `syncEnvFile` for both environments. Regenerating `.env` from the vault drops `AUTUMN_PROD_SECRET_KEY` from disk.
5. With neither key in `.env`, throw `no Autumn keys in .env — run pnpm dlx atmn login first`.

- [ ] **Step 1: Write the failing tests:**
  - `moves both keys to their items`;
  - `removes the production key from .env`: the regenerated `.env` text has no `AUTUMN_PROD_SECRET_KEY`;
  - `refuses a live key in the local item`.
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/vault-import-autumn-keys.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): move Autumn keys from atmn login into 1Password`.

---

### Task 15: Skill step 0 — founder setup

**Files:**
- Create: `.claude/skills/create-startup/references/00-founder-setup.md`
- Modify: `.claude/skills/create-startup/SKILL.md` ("How this skill works", "The flow", "Prerequisites")

Content of `00-founder-setup.md` follows spec §1 items 1–6, in this order, each as "check, then act only if the check fails":

1. **Tools.** Check each with `command -v`. Ask before each install:
   - `brew install --cask 1password-cli`;
   - `pnpm add -g vercel@latest`; the CLI must know `vercel deploy-hooks`;
   - `brew install supabase/tap/supabase`.
2. **Service account.** Check first: `node scripts/vault-put.mjs --check`. `--check` is a flag added in this task: it reads the token from the Keychain (Task 19), creates `startup-founder` if missing, prints `startup-founder: existing|created`, and writes no field. Only if it reports a missing or rejected token: the founder opens macOS Terminal.app (not a Claude terminal tab: the desktop-app integration refuses processes launched by the Claude app), checks `op vault list` works there, then runs the one-line create-and-store command from Task 0 Step 1. Claude gives the command; the token never passes through Claude. Then re-run `--check`. Say plainly that the service account needs a 1Password Business or Teams account, and that it can never see the founder's built-in vaults.
3. Identity: the founder's Google account.
4. Provider accounts: GitHub, Vercel, Supabase, PostHog, Autumn, Stripe, Resend, Dash0, Google Cloud, each in the region of the founder's usual `dataRegion`. Claude opens the page in Chrome, the founder clicks "Continue with Google" (GitHub for Supabase), and Claude reloads the dashboard to confirm the session.
5. CLI logins: `gh auth status`, `vercel whoami`, `supabase projects list`, `gcloud auth list`.
6. Master keys into `startup-founder/master-keys`, each through the clipboard channel after the founder's go-ahead:
   - `node scripts/vault-put.mjs --vault startup-founder --from-clipboard master-keys <FIELD>`;
   - give the exact dashboard path for each field. `<R>` is the founder's usual region (`EU` or `US`); another region's keys are added when the first startup in that region runs.

   | Field | Where | Permission |
   | --- | --- | --- |
   | `RESEND_FULL_ACCESS_API_KEY` | Resend → API Keys → Create | Full access |
   | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | (personal token) |
   | `POSTHOG_PERSONAL_API_KEY_<R>` | PostHog (region account) → Settings → Personal API keys | `organization:read`, `project:read`, `project:write` |
   | `DASH0_AUTH_TOKEN_<R>` | Dash0 (region org) → Settings → Auth Tokens | all actions, no dataset restriction (managing tokens requires it) |
   | `DASH0_API_URL_<R>`, `DASH0_OTLP_ENDPOINT_<R>` | Dash0 → Organization Settings → Endpoints | not secret |

   A Vercel token is not needed: Task 13 uses the `vercel login` session.
7. **SMTP.** When a startup will use SMTP, the founder saves `SMTP_USER` (the Gmail address) and `SMTP_PASS` (the app password) once, in `startup-founder/master-keys`.

`SKILL.md`:
- the flow gains `0. Founder setup → references/00-founder-setup.md (once per machine; idempotent)`;
- "How this skill works" replaces "guided paste-back" with the three channels and the never-read-a-secret-page rule;
- "Prerequisites" lists 1Password (paid, no free tier) and the one Google identity.

- [ ] **Step 1: Write `00-founder-setup.md` and the `SKILL.md` edits.**
- [ ] **Step 2: Add `--check` to `vault-put.mjs`, with test** `--check reports the founder vault without writing` (fake `op`: `ensureVault` called, `writeFields` not called).
- [ ] **Step 3: Run** `pnpm vitest run test/scripts/vault-put.test.ts`. Expected: PASS.
- [ ] **Step 4: Commit** `docs(skill): add the one-time founder setup step`.

---

### Task 16: Skill steps 3 and 4 — no paste

**Files:**
- Modify: `.claude/skills/create-startup/references/03-install-and-secrets.md` (two-environment table, 3c, 3d, 3e)
- Modify: `.claude/skills/create-startup/references/04-provision-services.md` (intro, "How to collect the values", 4a–4f, "Done with Step 4")

Rewrite each section to call the scripts above. Remove every `read -rs` paste prompt.

- **3c:**
  - `node scripts/init-env.mjs --apply` now also creates `startup-<slug>` and its `local` item;
  - the table gains a "Lives in" row: the vault is the source, and files are regenerated with `node scripts/vault-sync.mjs --env …`.
- **3e:** replace "there is no way to mint someone else's OAuth client or API key" with the per-key table of spec §4.
- **Collection section:** replace the paste loop with the three channels (spec §3), with the exact commands from Tasks 5 and 8.
- **4a:**
  - keep `list_organizations`, `get_cost`, the founder's yes, `confirm_cost` and `create_project`;
  - pass `db_pass` = a random throwaway, stating that Task 9's script replaces it at once;
  - poll until `ACTIVE_HEALTHY`;
  - then `node scripts/init-env.mjs --apply --file .env.prod` and `node scripts/providers/supabase-database.mjs --ref <ref>`;
  - the manual pooler URL, the `aws-0-`/`aws-1-` retry and the `node --env-file=.env.prod` connection check go away, because the script connects itself.
- **4b:**
  - Claude in Chrome creates the project, the consent screen and two clients: `<name> (local)` with `http://localhost:3000/auth/callback/google`, and `<name>` with `https://<prod-domain>/auth/callback/google` when the domain is known (else 6h adds it);
  - for each client: "Download JSON", then `vault-import-google-client.mjs`;
  - fallback: the dialog's Copy buttons, then `vault-put --from-clipboard`.
- **4c:** `node scripts/providers/posthog-projects.mjs` (Task 11).
- **4d:**
  - Resend with a domain: `node scripts/providers/resend-keys.mjs` (Task 12);
  - SMTP: `node scripts/vault-copy-smtp.mjs`, a tiny script added in this task. It copies `SMTP_USER` and `SMTP_PASS` from `startup-founder/master-keys` into both items, sets `SMTP_FROM_EMAIL` to `SMTP_USER` and `EMAIL_PROVIDER=smtp`, and runs both syncs. The skill says the SMTP exception out loud.
- **4e:**
  - Claude in Chrome creates the Autumn org named after the startup;
  - `pnpm dlx atmn login`; the founder approves the OAuth page and picks that org;
  - `node scripts/vault-import-autumn-keys.mjs` (Task 14);
  - `pnpm dlx atmn push --yes`;
  - test mode only: the Autumn sandbox's test Stripe account.
- **4f:** `node scripts/providers/dash0-dataset.mjs` (Task 10).

`vault-copy-smtp.mjs` gets the test `copies SMTP credentials into both items` (fake `op`: one `readFields` on master keys, then two `writeFields` calls).

- [ ] **Step 1: Write the `vault-copy-smtp` test.** Run `pnpm vitest run test/scripts/vault-copy-smtp.test.ts`. Expected: FAIL.
- [ ] **Step 2: Implement `scripts/vault-copy-smtp.mjs`.** Run the same command. Expected: PASS.
- [ ] **Step 3: Rewrite `03-install-and-secrets.md` and `04-provision-services.md`.**
- [ ] **Step 4: Check no paste is left.** Run `grep -n "read -rs\|Paste " .claude/skills/create-startup/references/0[34]-*.md`. Expected: no output.
- [ ] **Step 5: Commit** `docs(skill): provision step 3 and 4 secrets through 1Password`.

---

### Task 17: Skill step 6, repo docs and env template

**Files:**
- Modify: `.claude/skills/create-startup/references/06-deploy-production.md` (6d, 6e, 6f, 6g, 6h, 6j step 2, 6k)
- Modify: `CLAUDE.md` (infra constraints list; "New env vars go in" line)
- Modify: `README.md` (prerequisites, lines 27–29)
- Modify: `.env.template` (header comment; the line-105 comment about `set-env-var.mjs`)
- Modify: `docs/observability.md:33`

Edits:

- **6d:** `node scripts/providers/vercel-deploy-hook.mjs` (Task 13).
- **6e:**
  - keep `init-env.mjs --apply --file .env.prod --app-url …`;
  - delete the copy loop;
  - state that each environment got its own Google, PostHog and Resend values in step 4.
- **6f:**
  - Claude in Chrome creates the startup's Stripe account under the founder's Stripe login, after a go-ahead;
  - Claude connects it to the startup's Autumn org in live mode;
  - the founder completes KYC;
  - run `AUTUMN_PROD_SECRET_KEY=op://startup-<slug>/production/AUTUMN_SECRET_KEY op run -- pnpm dlx atmn push -p --yes`. `op run` resolves the reference in the environment, which overrides `.env` (live-verify in Task 18);
  - the 6f paste prompt goes away.
- **6g:**
  - the inventory's "Where the value comes from" column points at the vault items;
  - `gh secret set DATABASE_URL` becomes `op read op://startup-<slug>/production/DATABASE_URL | gh secret set DATABASE_URL`.
- **6h:** Claude in Chrome adds the production redirect URI to the `<name>` client, only when 4b could not.
- **6j step 2:** `op run --env-file=.env.prod -- pnpm tsx scripts/hash-early-access-code.ts <code>`.
- **6k:** every secret lives in 1Password vault `startup-<slug>`; `.env.prod` holds references only.
- **`CLAUDE.md`:**
  - add `1Password` to the infra list;
  - "New env vars go in" also lists `scripts/env/rules.mjs` (rules and `SECRET_KEYS`) next to `shared/env.ts`, `.env.template`, `scripts/set-env-var.mjs` and `scripts/push-env-to-vercel.mjs`.
- **`README.md`:**
  - prerequisites add 1Password (paid) and "one Google account; every provider uses Continue with Google, Supabase uses GitHub";
  - point at step 0.
- **`.env.template`:** the header says files are generated from 1Password by `scripts/vault-sync.mjs`, with values set through `scripts/vault-put.mjs` or `scripts/set-env-var.mjs`.
- **`docs/observability.md:33`:** the Dash0 variables live in `startup-<slug>/production`, are written by `scripts/providers/dash0-dataset.mjs`, and appear as references in `.env.prod`.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Check no paste is left.** Run `grep -rn "read -rs\|Paste \|cut -d= -f2- | gh" .claude/skills README.md`. Expected: no output.
- [ ] **Step 3: Run** `pnpm validate`. Expected: every stage passes.
- [ ] **Step 4: Commit** `docs: route step 6 and repo docs through the 1Password vault`.

---

### Task 18: Live verification with the founder

Each provider script has been tested against fakes only. This task runs them against real accounts on a throwaway slug.

- [ ] **Step 1: Prepare.** Back up `startup.config.json` with `cp startup.config.json /private/tmp/startup.config.json.bak`. Set the slug to `vault-trial` and `dataRegion` to the founder's region.
- [ ] **Step 2: Run the local chain.** Run `node scripts/init-env.mjs --apply`, then `node scripts/vault-sync.mjs --env local`. Expected: `.env` regenerated, the vault `startup-vault-trial` exists, and `pnpm vitest run` still passes.
- [ ] **Step 3: Run each provider script once, then a second time.**
  - PostHog, Dash0 and the Vercel hook, against a scratch Vercel project created by the founder.
  - Autumn: `atmn login` on a scratch org, then the import, then the `op run … atmn push -p` invocation as a dry run without `--yes`. Expected: it previews against production.
  - Google, with Claude in Chrome on a scratch Cloud project. Create one OAuth web client and check three things: the creation dialog offers "Download JSON" and a Copy button, `find "Download JSON"` returns no secret text, and the downloaded file imports with Task 8. This is spec "Left to the builder" 3.
  - Supabase only if the founder approves the cost of a scratch project.
  - Resend only if a verified domain exists.
  - Expected: the second run prints `reused` for every resource.
- [ ] **Step 4: Check the production chain.** Run `node scripts/vault-sync.mjs --env production`, then `grep -c "op://" .env.prod`. Expected: one reference per secret key present. Then run `node scripts/push-env-to-vercel.mjs --file .env.prod` (dry run). Expected: the key list prints and no value is printed.
- [ ] **Step 5: Clean up, with the founder's confirmation for each deletion** (each is irreversible):
  - the scratch resources at each provider;
  - `op vault delete startup-vault-trial`;
  - restore `startup.config.json`.
- [ ] **Step 6: Record each provider's result** in `docs/superpowers/notes/2026-11-09-op-spike.md`, under "Live run". Fix any script that failed (with its test) before claiming done.
- [ ] **Step 7: Commit** `docs(notes): record live provider verification`.

---

### Task 19: `op` wrapper uses the service account

Added 2026-11-09 with spec decision 6. Runs right after Task 0, before Task 15. Every script already builds its `Op` through `createOp()`, so the token is wired in one place.

**Files:**
- Create: `scripts/vault/service-account.mjs`, `scripts/with-vault.mjs`
- Modify: `scripts/vault/op.mjs` (default runner env, failure kinds), the tests that construct `OpError('locked')`
- Modify: `.claude/skills/create-startup/references/06-deploy-production.md` (the four direct `op` commands in 6f, 6g and 6j)
- Test: `test/scripts/service-account.test.ts`, `test/scripts/vault-op.test.ts`, `test/scripts/with-vault.test.ts`

**Interfaces:**
- Consumes: `createOp`, `OpError`, `classifyOpFailure`, `FAILURE_PATTERNS` (Task 3).
- Produces:
  - `KEYCHAIN_SERVICE = 'startup-factory-op'`.
  - `readServiceAccountToken({ run, user }: { run?: Runner; user?: string }): string`: runs `security find-generic-password -a <user> -s startup-factory-op -w`, where `user` defaults to `os.userInfo().username`, and returns stdout without its trailing newline. A non-zero status throws `no 1Password service account token in the Keychain (startup-factory-op) — run step 0, item 2`, which never includes stdout or stderr.
  - `createOp({ run, readToken })`: when `run` is not injected, the default runner reads the token once, on the first `op` call, through `readToken` (default `readServiceAccountToken`). It passes `env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token }` to `spawnSync`. An injected `run` keeps today's signature, so every existing test stays valid.
  - `OpError` kinds become `unauthorized | missing | rate-limited | failed`, replacing `locked`. `unauthorized` covers a rejected token and the desktop-app strings, with the message `1Password rejected the service account token — run step 0, item 2`. `rate-limited` matches `(429)` or `Too Many Requests`, with the message `1Password rate limit reached for the service account — retry in an hour`. The exact strings come from the Task 0 notes and live in `FAILURE_PATTERNS`.
  - CLI `node scripts/with-vault.mjs <command> [args...]`: runs the command with stdio inherited and `OP_SERVICE_ACCOUNT_TOKEN` set from the Keychain, and exits with its status. It is used in docs as, for example, `node scripts/with-vault.mjs op read op://startup-<slug>/production/DATABASE_URL | gh secret set DATABASE_URL`. Export `runWithVault({ command, args, run, readToken }): number`.

- [ ] **Step 1: Write the failing tests:**
  - `reads the token from the Keychain without a trailing newline`;
  - `explains a missing Keychain token` (status 44, a message without stdout or stderr);
  - `passes the token to op only through the environment` (fake `spawnSync` captures `options.env.OP_SERVICE_ACCOUNT_TOKEN` and asserts argv never contains it);
  - `reads the token once for several op calls`;
  - `classifies a rejected token`;
  - `classifies the hourly limit`;
  - `runs the command with the token in its environment and returns its status` (`with-vault`).
- [ ] **Step 2: Run to verify failure.** Run `pnpm vitest run test/scripts/service-account.test.ts test/scripts/vault-op.test.ts test/scripts/with-vault.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Rename `locked` to `unauthorized` across `op.mjs` and the tests that use it (`grep -rn "'locked'" scripts test`). Rewrite the four `op` commands in `06-deploy-production.md` to go through `node scripts/with-vault.mjs`: 6f becomes `AUTUMN_PROD_SECRET_KEY=op://… node scripts/with-vault.mjs op run -- pnpm dlx atmn push -p --yes`, 6g wraps the `op read`, and 6j wraps `op run --env-file=.env.prod -- …`.
- [ ] **Step 4: Run** `pnpm test`, then `grep -n "^op \|[^-]op read\|[^-]op run" .claude/skills/create-startup/references/*.md | grep -v with-vault`. Expected: PASS, and no output from the grep.
- [ ] **Step 5: Commit** `feat(scripts): reach 1Password through the service account token`.
