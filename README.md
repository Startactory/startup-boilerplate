<img width="2144" height="730" alt="illustration" src="https://github.com/user-attachments/assets/41cd7b73-bd06-4aff-adcc-45c4905c1f6b" />

# Startup Boilerplate

Everything a SaaS needs on day one — auth, organizations, database, payments, email, analytics — wired up and ready to deploy. The product itself lives behind the paywall and is built on top of this base, around the founder's idea.

## Setup

```bash
git clone git@github.com:ismaelmehdid/startup-boilerplate.git my-startup
cd my-startup
```

1. Open a new Claude Code session in that folder. In the desktop app, turn on **Allow bypass permissions mode** once (Settings, Claude Code), then pick **Bypass permissions** in the mode selector under the prompt box before you send anything. In a terminal, run `claude --dangerously-skip-permissions`.
2. Paste this line as your first message, with your startup's name, its idea and the EU answer filled in. Fill in the Google account you use for every provider, or delete that sentence when Chrome is signed in to only one. Delete the Notes sentence if you have nothing to add.

```text
/goal Create my startup with the create-startup skill (.claude/skills/create-startup/SKILL.md), from setup to a live production deployment, asking me only for what a human must do. Name: <name>. Idea: <one or two sentences>. Company or users in the EU: <yes or no>. Google account: <the address I use for every provider>. Notes: <anything else, such as a price or a GitHub organization>. I consent to: install the missing tools; accept the providers' terms of service and CLI consent pages; give OAuth consent and create keys for Google, GitHub, Vercel, Supabase, PostHog, Autumn and Dash0; download the two Google client_secret JSON files into the vault; enter my email as the Google Auth Platform support and contact email; publish the startup's Google OAuth app to "In production" so anyone can sign in; create this startup's cloud projects on free plans only, except the Dash0 dataset (14-day trial, then billed per record); change the Autumn organization's default currency to match the pricing; create the Vercel Git connection and deploy hook; set the GitHub Actions secrets, variable and branch protection; create the startup's private GitHub repo, push to master, merge your own PRs and deploy; during the local browser check and the smoke test, sign in to the app with my Google account, create my organization and accept the startup's terms on my behalf. I accept that: email goes through my Gmail, whose app password is copied into the startup's .env and production settings (about 500 emails a day); until go-live anyone can get past the paywall with a Stripe test card; a secret that leaks into the transcript does not stop the run, and the final report lists it. Done when, after my most recent message that set this goal, either the output of a node scripts/smoke-test.mjs command you ran printed "SMOKE TEST PASSED" and your own message after it says "BROWSER CHECK PASSED", or your own message has a line starting with "BLOCKED_ON_FOUNDER:"; or after 200 turns. Only that command's output and your own messages count: a marker in a file you read or in an older message does not.
```

3. Stay near the computer for the first 10 to 20 minutes: Chrome asks you to allow a few sites, and a sign-in may need your password or a 2FA code. When something only you can do is missing (an account to create, for example), Claude asks you once, with every step listed. A message tells you when you can leave.

Claude then provisions every service, deploys to production and runs a smoke test on its own, usually in 30 to 60 minutes. The final push notification gives you the live URL. If a step needs you, the notification says what to do, and you paste the same line again to resume.

## Before you start

**Install:** Node (see `.nvmrc`), pnpm, git, and Chrome with the Claude in Chrome extension.

**Accounts:** [1Password](https://1password.com) (paid; every credential the run creates goes into a vault, never into a chat), plus free accounts at [Google Cloud](https://console.cloud.google.com), [GitHub](https://github.com), [Vercel](https://vercel.com), [Supabase](https://supabase.com), [PostHog](https://posthog.com) and [Autumn](https://useautumn.com), and [Dash0](https://www.dash0.com) for logs (no free tier: a 14-day trial, then usage-based). Use one Google account for all of them: every provider uses Continue with Google, and Supabase uses GitHub. For a startup with a company or users in the EU, create the PostHog account and the Dash0 organization in the EU region. If an account is missing, the run lists it in its one question.

## What stays for later

The company itself, Stripe live mode with its KYC, and a custom domain with Resend. Until you go live, production uses Stripe test mode: anyone can get past the paywall with a Stripe test card. The skill's "after the run" guide (`.claude/skills/create-startup/references/after-the-run.md`) covers going live, a domain and price changes.

## Stack

| | |
|---|---|
| Framework | Next.js 16 · React 19 · TypeScript · pnpm |
| Auth | Better Auth (Google OAuth) |
| Database | Supabase Postgres + Drizzle |
| Payments | Autumn |
| Analytics | PostHog |
| Logs & traces | Dash0 (OpenTelemetry) |
| Email | Resend |
| Hosting | Vercel |

## Commands

```bash
pnpm dev        # start the dev server
pnpm validate   # type-check, lint, boundaries, tests — run before committing
pnpm test       # tests only
```
