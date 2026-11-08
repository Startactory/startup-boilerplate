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

## How to collect the values the user must provide

A few credentials cannot be fetched over MCP — they are issued to the user's own accounts. For
those, run a **guided, one-at-a-time loop**. Never hand over a list of five things to go fetch: a
wall of instructions is exactly how someone ends up pasting a placeholder or the wrong key, and
that failure then surfaces much later as an unexplained build error.

For each credential, in order, do this and nothing more:

1. **Say what you need and why**, in one sentence — "I need your Google OAuth client ID so users
   can sign in."
2. **Give the exact path to get it** — the clicks, not just the site name. Include anything that
   must be configured while they're in there (a redirect URI, a billing card, a verified domain).
3. **Give the command to set it**, so the secret never passes through the chat:

   ```bash
   printf "Paste GOOGLE_CLIENT_ID: "; read -rs V; echo
   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_ID
   unset V
   ```

4. **Wait.** Do not continue to the next credential, and do not batch them. One at a time.
5. **Confirm what landed.** The script validates the value against `src/shared/env.ts` — prefixes,
   lengths, URL and email shapes — plus vendor-format warnings, then prints a masked confirmation.
   If it rejects the value, fix *that* one before moving on.

Use the script rather than telling the user to edit `.env` by hand: it keeps secrets out of the
transcript, out of shell history and out of `ps`, and it catches a wrong or placeholder paste
immediately. It refuses anything that still looks like `[YOUR-PASSWORD]` or `<...>`.

Tell the user where they are — "that's 3 of 5" — so the remaining work is visible.

---

## 4a. Supabase — database (MCP: `supabase`)

Fills: `DATABASE_URL`, `DATABASE_SSL`. Supabase only hosts Postgres here; the boilerplate uses no
Supabase Storage or API keys.

Using the Supabase MCP:

1. Create a project named after the `slug` (or reuse one the user picks). Pick a region near the
   user and a strong DB password.
2. Retrieve and write:
   - `DATABASE_URL` = the Postgres connection string. Use the connection **pooler** URI for the
     serverless app runtime; you can use the direct connection for migrations. Include the password.
   - `DATABASE_SSL=require` (hosted Postgres needs SSL).

Verify: `DATABASE_URL` holds the real password (no `[YOUR-PASSWORD]` placeholder) and uses the pooler host.

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
5. Copy the client ID and secret. Ask for them **one at a time**:

   ```bash
   printf "Paste GOOGLE_CLIENT_ID: "; read -rs V; echo
   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_ID
   unset V

   printf "Paste GOOGLE_CLIENT_SECRET: "; read -rs V; echo
   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_SECRET
   unset V
   ```

   The client ID normally ends `.apps.googleusercontent.com` and the secret starts `GOCSPX-`; the
   script warns if they look swapped.

(Microsoft OAuth is optional and left as a TODO — the code enables it automatically if
`MICROSOFT_CLIENT_ID/SECRET` are set; redirect URI `/auth/callback/microsoft`.)

---

## 4c. PostHog — analytics (MCP: `posthog`, chosen optional)

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

## 4d. Email — Resend or SMTP (MCP: `resend`, or manual SMTP)

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

## 4e. Autumn — payments (MCP: `autumn`) — do this last

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
   (The products/plans live in `autumn.config.ts`; Step 1b already set the `pro` price and trial.
   If the user wants to change the pricing, go back to `references/01b-set-pricing.md`.)
4. You'll push to **production** and swap in the production key + live Stripe in Step 6.

---

## Done with Step 4

Re-read `.env` against `src/shared/env.ts`: every **required** var populated, formats correct,
optional ones either set or left as an explicit `# TODO` line. Then move to Step 5 to verify.
