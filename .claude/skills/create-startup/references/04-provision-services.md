# Step 4 — Provision & configure services

Fill every remaining `.env` value. For each service: do it via MCP where possible, fall back to a
tight guided paste-back otherwise. After each service, write its values into `.env` and tell the
user what you set. Re-read `src/shared/env.ts` if unsure about a name, format, or whether a var is
required.

**First**, surface the accounts the user needs (Step "Prerequisites" in SKILL.md) so they can
create any missing ones before the guided parts.

Order matters a little: do **Supabase** first (it yields `DATABASE_URL`, needed for migrations),
then the manual keys, then Autumn last (it depends on the billing code being present).

---

## 4a. Supabase — DB + storage (MCP: `supabase`)

Fills: `DATABASE_URL`, `DATABASE_SSL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_STORAGE_BUCKET`.

Do all of this yourself over the MCP. **Exactly one value cannot be automated** —
`SUPABASE_SECRET_KEY` — because the MCP deliberately exposes no tool for service-role/secret keys
(that key bypasses Row Level Security, so Supabase withholds it from agents on purpose). Ask for
that one; obtain everything else without involving the user.

### 1. Pick the organization

`list_organizations` → if there's more than one, ask which to use. Otherwise take the only one.

### 2. Get cost approval before creating anything

Creating a project can be **billable**, which is why the MCP has a cost-confirmation flow. Do not
skip it:

1. `get_cost` for a new project in that organization.
2. **Show the amount to the user and get an explicit yes.** Creating a paid resource on someone's
   account without asking is not yours to decide.
3. `confirm_cost` → keep the returned confirmation id; `create_project` requires it.

### 3. Create the project

`create_project` with:

- `name` — the `slug` from Step 1
- `region` — nearest the user's users (ask if unsure)
- `db_pass` — **generate a strong password yourself** (e.g. 32 random base64url chars). You supply
  it, so you know it, which is what lets you build `DATABASE_URL` in step 6 without ever asking.
  Record it somewhere the user can retrieve it (tell them it's their DB password) — Supabase will
  not show it again.
- `confirm_cost_id` — from step 2

Then poll `get_project` until `status` is `ACTIVE_HEALTHY`. Provisioning takes a minute or two;
every later call fails confusingly if you race it.

### 4. Read back the values you can

- `get_project_url` → `SUPABASE_URL` (`https://<ref>.supabase.co`)
- `get_publishable_keys` → `SUPABASE_PUBLISHABLE_KEY`, which must start `sb_publishable_`. If only
  a legacy JWT `anon` key comes back, the project still has legacy keys — enable the new API key
  format in the dashboard, because `env.ts` validates the `sb_publishable_` prefix and will reject
  the legacy key.
- `get_project` → note the `region` and `ref`; you need both for the connection string.

### 5. Ask for the one value you cannot get

Ask the user for `SUPABASE_SECRET_KEY` from **Dashboard → Project Settings → API Keys**. It must
start `sb_secret_` (the new format — *not* the legacy `service_role` JWT). Explain why you're
asking rather than making it look like an oversight.

### 6. Build `DATABASE_URL` — session pooler

```
postgresql://postgres.<ref>:<url-encoded db_pass>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

- User is **`postgres.<ref>`**, not `postgres`.
- Port **5432** (session mode). Not `6543` — transaction mode breaks `drizzle-kit migrate`.
- Never the direct host `db.<ref>.supabase.co`: it is IPv6-only and unreachable from IPv4-only CI.
- **URL-encode the password** (`@`→`%40`, `#`→`%23`, `/`→`%2F`, …).
- Set `DATABASE_SSL=require`.

The `aws-0-` prefix is not guaranteed — some projects use `aws-1-`. **Verify by connecting rather
than assuming**, and if it fails with `ENOTFOUND`, read the exact host from Dashboard → Connect →
Session pooler:

```bash
node --env-file=.env -e "const p=require('postgres');const s=p(process.env.DATABASE_URL,{ssl:'require',max:1});s\`select 1\`.then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error('FAIL',e.code,e.message);process.exit(1)})"
```

### 7. Create the `files` bucket

There is **no create-bucket tool** (the MCP's storage group is disabled by default and only exposes
`list_storage_buckets` / `get_storage_config`), so create it with `execute_sql`:

```sql
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;
```

It must be **private** (`public = false`) — the app serves objects through signed URLs. Confirm with
`list_storage_buckets`, then set `SUPABASE_STORAGE_BUCKET=files` (validated against the `BUCKETS`
picklist in the code — don't rename it). Leave `SUPABASE_STORAGE_HOST` empty unless serving through
a custom domain/CDN.

### 8. Write and verify

Write the values into `.env` (`scripts/init-env.mjs --apply --supabase-ref <ref>` fills
`SUPABASE_URL` for you). Then confirm: the connection test above prints `OK`, both keys carry the
right prefixes, and the bucket exists and is private.

---

## 4b. Google OAuth — required sign-in (manual, guided)

Fills: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. There is no MCP; email/password is disabled, so
without this **no one can sign in**. Walk the user through it:

1. https://console.cloud.google.com → create a project (name it after the startup).
2. **APIs & Services → OAuth consent screen** → External → fill app name (startup name), support
   email, developer email. Add scopes `.../auth/userinfo.email` and `.../auth/userinfo.profile`
   (the code requests these). While in "Testing", add the user's Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs** — Better Auth mounts at `/auth` (not `/api/auth`), so add:
   - `http://localhost:3000/auth/callback/google` (local)
   - the production one is added in Step 6: `https://<prod-domain>/auth/callback/google`
5. Copy the client ID and secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

(Microsoft OAuth is optional and left as a TODO — the code enables it automatically if
`MICROSOFT_CLIENT_ID/SECRET` are set; redirect URI `/auth/callback/microsoft`.)

---

## 4c. OpenAI — required (manual; the OpenAI MCP is docs-only)

Fills: `OPENAI_API_KEY`. Keep `CHAT_MODEL`/`CHEAP_MODEL` at their pinned defaults
(`gpt-5.4-mini` / `gpt-5.4-nano` — the picklists are enforced in `core/chat/types.ts`).

1. https://platform.openai.com → **API keys → Create new secret key** → `OPENAI_API_KEY`.
2. Ensure the account has billing/credits, or chat and RAG calls will 401/429.
3. Leave `LLM_DAILY_BUDGET_USD_PER_USER` at the default (`2`) unless the user wants a different cap.

`BRAVE_SEARCH_API_KEY` (web-search chat tool) is optional — leave as a TODO unless requested.

---

## 4d. ZeroEntropy — required RAG (manual)

Fills: `ZEROENTROPY_API_KEY`, `ZEROENTROPY_API_URL`. ZeroEntropy is locked in this stack (RAG over
uploaded files). There is a repo doc — **follow `docs/zeroentropy-deployment.md`** for the exact,
current provisioning steps rather than improvising.

1. Create a ZeroEntropy account/organization and mint an API key → `ZEROENTROPY_API_KEY`.
2. `ZEROENTROPY_API_URL` defaults to the EU endpoint (`https://eu-api.zeroentropy.dev/v1`); switch
   to the US endpoint only if that's where the account/data lives.

---

## 4e. PostHog — analytics (MCP: `posthog`, chosen optional)

Fills: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

1. Create (or pick) a PostHog project. The fastest path is the wizard: `pnpm dlx @posthog/wizard mcp add`
   already ran in Step 2; you can also get the project's **Project API key** (`phc_…`) from the MCP
   or Project Settings.
2. `NEXT_PUBLIC_POSTHOG_KEY` = the `phc_…` key.
3. `NEXT_PUBLIC_POSTHOG_HOST` = `https://eu.i.posthog.com` (EU) or `https://us.i.posthog.com` (US) —
   match the region of the account you logged into.

Leaving the key empty makes analytics a clean no-op, so this is safe to skip if the user changes
their mind — but they opted in.

---

## 4f. Email — Resend or SMTP (MCP: `resend`, or manual SMTP)

`env.ts` requires the vars of the **selected** provider only. Choose based on whether the user has
a verified domain (`startup.config.json.domain`):

**If they have a domain → Resend** (better for production deliverability):

1. Set `EMAIL_PROVIDER=resend`.
2. Via the Resend MCP: add the domain, get the DNS records (SPF/DKIM), have the user add them at
   their registrar, then verify the domain.
3. Create an API key → `RESEND_API_KEY`. Set `RESEND_FROM_EMAIL` to an address on the verified
   domain (e.g. `noreply@<domain>`).

**If no domain yet → SMTP (Gmail app password)** — works without a domain, fine to start:

1. Set `EMAIL_PROVIDER=smtp`.
2. Guide: enable 2-Step Verification on the Google account → https://myaccount.google.com/apppasswords
   → create a 16-char app password.
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail address>`,
   `SMTP_PASS=<app password>`, `SMTP_FROM_EMAIL=<same gmail address>` (Gmail rewrites otherwise),
   and optionally `SMTP_FROM_NAME` (the startup name). Note the ~500 emails/day Gmail cap — migrate
   to Resend before scaling invites.

---

## 4g. Autumn — payments (MCP: `autumn`) — do this last

Fills: `AUTUMN_SECRET_KEY`. Depends on the **billing integration being present in the code**
(`autumn.config.ts`, the `/api/autumn/[...all]` handler, `AutumnProvider`, and the `AUTUMN_SECRET_KEY`
entry in `env.ts`). If those aren't there yet, do the billing integration first, then return here.

1. In the Autumn dashboard, **connect Stripe** (Autumn manages Stripe webhooks for you — you do not
   add Stripe keys to this app). Use Stripe **test mode** for now; switch to live in Step 6.
2. Get the **sandbox** `AUTUMN_SECRET_KEY` (starts `am_sk_test_…`) → write to `.env`.
3. Push the product/pricing config to Autumn's sandbox:
   ```bash
   pnpm dlx atmn push
   ```
   (The products/plans live in `autumn.config.ts`. Use the Autumn MCP to inspect/adjust them if the
   user wants different tiers.)
4. You'll push to **production** and swap in the production key + live Stripe in Step 6.

---

## Done with Step 4

Re-read `.env` against `src/shared/env.ts`: every **required** var populated, formats correct,
optional ones either set or left as an explicit `# TODO` line. Then move to Step 5 to verify.
