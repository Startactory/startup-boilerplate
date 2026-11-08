# Step 1 — Name the startup

The name threads through everything later (package name, Supabase/Vercel project names, the
Autumn account, OAuth app name, email `from`), so capture it first and persist it.

1. Ask the user for the startup name if they haven't given it. Keep it a plain conversational
   question — names are free-form.
2. Derive identifiers and confirm them before saving:
   - `name` — display name exactly as given (e.g. `Acme Analytics`)
   - `slug` — lowercase, hyphenated, safe for package names and project refs (e.g. `acme-analytics`)
   - `domain` — ask if they have one; leave empty if not (it decides the email provider in Step 4
     and the production URL in Step 6)
3. Ask whether the startup handles European personal data, in one plain question:

   > Is the company based in the EU, the EEA or the UK, or will it have users there?

   GDPR applies when the company is established there **or** offers its service to people there
   (GDPR art. 3) — not because of where servers sit. A founder based in France is in scope even
   if every customer is abroad. Record the answer as two fields:
   - yes → `"gdpr": true`, `"dataRegion": "eu"`
   - no → `"gdpr": false`, `"dataRegion": "us"`

   `dataRegion` picks the region of every service (see `references/data-region.md`); `gdpr`
   switches on the compliance work. Ask once — later steps read these fields and never ask again.
   If the answer is unclear, default to yes: an EU setup is safe for non-EU users, the reverse is
   not.
4. Persist to `startup.config.json` at the repo root so later steps and later sessions can read it:

   ```json
   {
     "name": "Acme Analytics",
     "slug": "acme-analytics",
     "domain": "",
     "gdpr": true,
     "dataRegion": "eu",
     "createdStep": "naming"
   }
   ```

   If the file already exists, read it and confirm/update rather than overwriting silently.
5. Update the `name` field in `package.json` to the slug (it currently reads `startup-boilerplate`).

Once saved, tell the user the name and the data region are locked in and move to Step 2.
