# Step 1 — Name the startup

**Phase 1.** The name threads through everything later (package name, Supabase/Vercel project
names, the Autumn account, OAuth app name, email `from`), so it is settled first and persisted.
The phase 1 interview (`phase-1-setup.md` section 2) takes the name from the founder's first
message, or from their answer to the briefing's question when the message lacks it, and shows
what this file derives for review in its one message. This file holds the derivation rules and
the JSON they write; it asks nothing.

1. `name`: the display name exactly as given (e.g. `Acme Analytics`).
2. Derive the identifiers:
   - `slug`: lowercase, hyphenated, safe for package names and project refs (e.g.
     `acme-analytics`). 3 to 26 characters matching `^[a-z0-9]+(-[a-z0-9]+)*$`, which fits the
     vault, Dash0 and GitHub rules, and `<githubOwner>/<slug>` must not already be a GitHub
     repository (`gh repo view "<githubOwner>/<slug>"`) unless `startup.config.json`
     `repository` already is `<githubOwner>/<slug>` (an interrupted phase 1: the repository is
     this startup's). No Vercel project may hold the name unless it is this startup's:
     `node scripts/providers/vercel-project.mjs --check-name <slug> --repository <githubOwner>/<slug>`
     must print `OK  Vercel name <slug> is free` or `OK  Vercel project <slug> is this startup's`
     (the reuse rule of `vercel-project.mjs`: Git-linked to that repository, or never linked nor
     deployed). It needs `vercel whoami` to work; otherwise `phase-1-setup.md` checklist item 9
     runs it after `vercel login`. Never read the project with `vercel api /v9/projects/<slug>`:
     its JSON can hold deploy hook URLs, which are secrets. When the slug is taken by anything
     else, on GitHub or Vercel, propose another slug.
   - `githubOwner`: the GitHub account that owns the repository. Default: the personal account
     (`gh api user -q .login`); the interview asks only when `gh org list` shows organizations.
   - `googleAccount` (required, an email address): the founder's Google identity among the
     Google accounts Chrome is signed in to; the interview asks which one when there are several
     (`00-founder-setup.md` item 3). The preflight's `config` check refuses a config without it.
   - `domain`: always `""` in a run. A custom domain comes after the run (`after-the-run.md`).
3. Derive the data region. GDPR applies when the company is established in the EU, the EEA or the
   UK **or** offers its service to people there (GDPR art. 3), not because of where servers sit.
   The founders are established in France, so the default is:
   - `"gdpr": true`, `"dataRegion": "eu"`;
   - `"gdpr": false`, `"dataRegion": "us"` only when the founder's interview answer says so.

   `dataRegion` picks the region of every service (see `references/data-region.md`); `gdpr`
   switches on the compliance work. Later steps read these fields and never ask again. When in
   doubt, keep `eu`: an EU setup is safe for non-EU users, the reverse is not.
4. Derive the site's default language, `defaultLocale`: the language a visitor sees before
   choosing one (no `LOCALE` cookie yet). `"fr"` by default; propose `"en"` when the founder chose
   `us` or writes in English. The founder's answer wins. The key is optional and a config without
   it means `fr`, but the interview always writes it. Step 3a's
   `node scripts/sync-startup-profile.mjs` copies it into the startup profile, and the app uses it
   as its default locale.
5. Persist to `startup.config.json` at the repo root so later steps and later sessions can read it
   (the full shape, with `idea`, `pricing`, `brand` and `legal`, is in `phase-1-setup.md`
   section 2):

   ```json
   {
     "name": "Acme Analytics",
     "slug": "acme-analytics",
     "domain": "",
     "gdpr": true,
     "dataRegion": "eu",
     "defaultLocale": "fr",
     "githubOwner": "ada-lovelace",
     "googleAccount": "ada@example.com"
   }
   ```

   If the file already exists (an interrupted phase 1), the interview proposes its values; update
   it with the founder's answer rather than overwriting it blindly.
6. Update the `name` field in `package.json` to the slug (it currently reads `startup-boilerplate`).
