---
name: create-startup
description: >-
  Bootstrap a new startup / SaaS project from this boilerplate end-to-end. Use this skill
  whenever the user wants to start, scaffold, initialize, or set up a new startup from this
  repo — name their company, wire up the service integrations (Supabase, Autumn, PostHog,
  Resend, Vercel, OpenAI), and get to a running skeleton fast. Trigger on phrases like "set
  up my startup", "initialize the boilerplate", "create a new startup", "let's start the
  project", or "connect the services", even when the skill is not named explicitly.
---

# Create Startup

Take a fresh clone of this boilerplate and turn it into a ready-to-build startup: named,
with every external service connected, and (in later steps) fully scaffolded.

This skill is built **incrementally**. The steps below are executed in order. Steps marked
`(planned)` are not implemented yet — do not attempt them; stop after the last implemented
step and tell the user what comes next.

## The stack this boilerplate targets

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript, Node.js runtime |
| Package manager | pnpm |
| Auth | Better Auth |
| Database + Storage | Supabase (Postgres + Storage buckets) + Drizzle ORM |
| Payments / billing | Autumn |
| Product analytics | PostHog |
| Tracing + logs | PostHog via OpenTelemetry |
| Transactional email | Resend |
| AI | OpenAI via the AI SDK |
| Hosting | Vercel |

## Flow overview

1. **Name the startup** — capture the name and derive identifiers. *(implemented)*
2. **Connect the service connectors** — add every MCP so services can be configured for the
   user without them touching each dashboard. *(implemented)*
3. Scaffold the Next.js app + tooling. *(planned)*
4. Provision & configure each service (create the Supabase project, Autumn product, PostHog
   project, Resend domain, Vercel project, wire env vars). *(planned)*
5. Generate code integrations (Better Auth, Drizzle schema, PostHog + OTel, Resend, AI SDK). *(planned)*

---

## Step 1 — Name the startup

The name threads through everything later (package name, Supabase/Vercel project names, env
prefixes, email `from` address), so capture it first and persist it.

1. Ask the user for the startup name if they haven't already given it. Keep it a plain
   conversational question — names are free-form.
2. Derive identifiers from the name and confirm them with the user before saving:
   - `name` — the display name exactly as given (e.g. `Acme Analytics`)
   - `slug` — lowercase, hyphenated, safe for package names and project refs
     (e.g. `acme-analytics`)
   - `domain` — ask for it if they have one, otherwise leave empty for now
3. Persist to `startup.config.json` at the repo root so later steps (and later sessions) can
   read it. Create it with exactly this shape:

   ```json
   {
     "name": "Acme Analytics",
     "slug": "acme-analytics",
     "domain": "",
     "createdStep": "naming"
   }
   ```

   If the file already exists, read it and confirm/update rather than overwriting silently.

Once saved, tell the user the name is locked in and move to Step 2.

---

## Step 2 — Connect the service connectors

Goal: the user should never have to open each service's dashboard and copy API keys by hand.
Instead, connect each service's MCP server so it can be configured directly from here. Most
are remote HTTP servers with a browser OAuth login — the user signs in once per service and
grants access.

### 2a. What gets connected (and what doesn't)

**Management connectors** — these let this session create and configure resources on the
user's account (projects, products, domains, deployments):

| Service | MCP name | Add command |
| --- | --- | --- |
| Supabase | `supabase` | `claude mcp add --scope project --transport http supabase https://mcp.supabase.com/mcp` |
| Autumn | `autumn` | `claude mcp add --scope project --transport http autumn https://mcp.useautumn.com/mcp` |
| PostHog | `posthog` | `claude mcp add --scope project --transport http posthog https://mcp.posthog.com/mcp` |
| Resend | `resend` | `claude mcp add --scope project --transport http resend https://mcp.resend.com/mcp` |
| Vercel | `vercel` | `claude mcp add --scope project --transport http vercel https://mcp.vercel.com` |

**Docs / dev-tools connectors** — no account configuration, but they make building far more
accurate (live app state, up-to-date API docs):

| Service | MCP name | How to add |
| --- | --- | --- |
| OpenAI docs | `openaiDeveloperDocs` | `claude mcp add --scope project --transport http openaiDeveloperDocs https://developers.openai.com/mcp` |
| Next.js devtools | `next-devtools` | stdio server (see 2c) — added to `.mcp.json`, activates once `pnpm dev` runs |

**Not an MCP connector: Better Auth.** Better Auth's "MCP plugin" turns *your* app into an
OAuth provider for external MCP clients — it is not a server that configures Better Auth for
you. There is nothing to connect here; Better Auth is wired up in code during the later
scaffolding steps. Mention this to the user so they aren't left wondering why it's missing.

`--scope project` writes these to a `.mcp.json` at the repo root, so they ship with the
boilerplate — anyone who clones it inherits the same connectors and only needs to
authenticate.

### 2b. Add the connectors

Run each `claude mcp add` command from the table above from the repo root. They are
idempotent-ish, but if one reports the server already exists, that's fine — skip it.

After adding them, `.mcp.json` should contain the five management servers plus the OpenAI
docs server. Add the Next.js devtools server as described in 2c.

### 2c. Add the Next.js devtools server

This one is a local stdio server (not remote), and it only connects to a *running* Next.js 16+
dev server, so it stays dormant until the app is scaffolded and `pnpm dev` is running. Add it
to `.mcp.json` now so it's ready:

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

### 2d. Authenticate each connector

The management connectors (and OpenAI docs) use browser-based OAuth. Walk the user through
authenticating them:

1. Tell the user to run `/mcp` in Claude Code.
2. For each server listed (`supabase`, `autumn`, `posthog`, `resend`, `vercel`,
   `openaiDeveloperDocs`), have them select it and choose **Authenticate**, completing the
   sign-in flow in the browser. Each grants this session the same access as their own account
   on that service, so they should only approve what they recognize.
3. Note the important caveat for **OAuth in Claude Code**: it must be run from a regular
   terminal, not inside some IDE embeddings. If a server won't authenticate, retry from a
   plain terminal session.

### 2e. Verify

- Run `claude mcp list` and confirm every server shows as connected.
- Confirm `.mcp.json` at the repo root contains all seven entries (five management + OpenAI
  docs + next-devtools).
- Report the status back to the user as a short checklist (connected / needs auth / skipped),
  then hand off: the next step (scaffolding the app) is not built yet.

---

## After Step 2

Stop here and tell the user Step 2 is complete and Steps 3–5 are still to be built. Do not
improvise the scaffolding or provisioning — those will be added to this skill incrementally.
