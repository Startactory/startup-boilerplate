# Data region — one answer, every service

Step 1 records `dataRegion` (`eu` or `us`) and `gdpr` (`true` or `false`) in
`startup.config.json`. Every later step reads them from there. Never ask the founder again, and
never pick a region per service by taste: a single US service is enough to move EU personal data
out of the EU.

## Region per service

| Service | `eu` | `us` | Where it is set |
| --- | --- | --- | --- |
| Supabase (Postgres) | `eu-west-3` (Paris) or `eu-central-1` (Frankfurt) | `us-east-1` | project creation (4a) — cannot change later |
| Vercel Functions | `cdg1` (Paris) or `fra1` (Frankfurt) | `iad1` (default) | `"regions"` in `vercel.json` (Step 6) — keep it next to the database |
| PostHog | `https://eu.i.posthog.com` | `https://us.i.posthog.com` | `NEXT_PUBLIC_POSTHOG_HOST` — `scripts/init-env.mjs` derives it from `dataRegion` |
| Dash0 | an organization created in `eu-west-1` | an organization created in a US region | the organization's endpoint (4f) |
| Resend | domain region `eu-west-1` | domain region `us-east-1` | when the domain is added (4d) |

PostHog and Dash0 fix the region per **account / organization**, not per project. An EU startup
needs the founder's EU PostHog account and EU Dash0 organization. A founder who runs both EU and
US startups keeps one parent account per region for each of these two services.

Autumn and Stripe have no region choice. They process billing data in the US under their own
data processing terms; list them as sub-processors (below).

## French-law set (every startup)

Founders are established in France, so the French-law set applies to **every** startup, whatever
`dataRegion` says: GDPR applies to a French company even when its data sits in the US. Step 1d
builds it: the legal pages, the cookie banner, PostHog started only after consent, and the GDPR
baseline. `gdpr` and `dataRegion` now decide only the region of each service.

## When `gdpr` is `true`

Regions are only part of it. These items make an EU startup compliant; they are tracked here so
no step forgets them. Report each one in the final checklist as shown:

- **Cookie consent** — built (Step 1d): PostHog does not start, or set cookies, before consent.
- **Privacy policy** — built (Step 1d): what is collected, why, how long, and the sub-processors:
  Supabase, Vercel, PostHog, Dash0, Resend (or the SMTP provider), Autumn, Stripe, Google
  (sign-in).
- **Legal notice** — built (Step 1d): required for a company established in France ("mentions
  légales").
- **User rights** — **needs action**: account deletion and data export (GDPR art. 17 and 20).
- **Telemetry hygiene** — `shared/logger` already redacts emails and names. HTTP spans can carry
  client IP addresses, which are personal data; Dash0 keeps them for its retention period.

## When `gdpr` is `false`

Use the `us` column. Skip the list above, but keep the logger redaction — it costs nothing.
