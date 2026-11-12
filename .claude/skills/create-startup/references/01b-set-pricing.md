# Step 1b — Set the pricing

**Phase 1** (and after the run, to change the price of an existing startup). Decide what the
startup charges before any service is provisioned. Step 4e (phase 2) pushes the result to the
Autumn sandbox, so the price must be final in `autumn.config.ts` by then.

You derive the pricing from the idea (sections 1 to 3), and the phase 1 interview
(`phase-1-setup.md` section 2) shows the proposal for review in its one message. The founder's one
answer either keeps it or gives their own price (`pricing.source` is then `founder`). Never block
on this step: with no opinion from the founder, the derived proposal stands.

## What the app can sell today

Read this before you propose anything. The pricing must fit the code that exists.

- The whole app sits behind one hard paywall. One boolean feature, `app_access`, unlocks it.
- One paid plan, `pro`, grants `app_access`. A `free` plan with `autoEnable: true` is the baseline.
- `src/app/(app)/paywall/components/paywall-view.tsx` hard-codes `PRO_PLAN_ID = 'pro'`, and
  `src/core/billing/types/entitlement.ts` hard-codes `APP_ACCESS_FEATURE_ID = 'app_access'`.

So the supported shape is: **one flat-rate paid plan**, one billing interval, an optional free
trial. You may change the `pro` plan's `price` and `freeTrial`. Keep the ids `free`, `pro` and
`app_access`, and keep the plan name `Pro` (the paywall button copy says "Upgrade to Pro").

Tiers, usage limits, credits, seats and annual/monthly toggles need code changes (metered
features, a plan picker on the paywall). If the founder's answer asks for one of them, say it is
not wired yet, record the request in `pricing.deferred`, and set the closest flat price now.

## 1. Gather the inputs

The `idea` comes from the founder's first message (the interview asks for it only when the message
lacks it). Infer the rest from the idea; the interview asks nothing about these:

- **Customer** — who pays: an individual (`individual`), a small team or SMB (`team`), or a
  business buying a business-critical tool (`business`).
- **Value** — the main job the product does for that customer, and what it saves or earns them
  per month if you can estimate it.
- **Next best alternative** — what the customer uses today (a competitor, a spreadsheet, a
  freelancer, doing it by hand) and roughly what that costs.

## 2. Derive the price (skip if the founder gave one)

The first price is a bet to learn from, not an optimum. Pick a defensible number fast; real
buyers correct it later.

1. **Start from the customer bucket**, then adjust inside it:

   | Customer | Starting point (per month) |
   | --- | --- |
   | `individual` | about 10 |
   | `team` | about 100 |
   | `business` | about 1,000 |

2. **Place it between the alternative and the value.** The next best alternative is the floor;
   the customer's perceived value is the ceiling. A competitor's price is a data point, not a
   target. Your cost is a floor, never the basis.
3. **Check the 10:1 rule.** The customer should get about 10x more value than the price. If you
   cannot argue 10x, the price is too high or the idea's value is unclear. Lower the price inside
   the bucket, or say in the proposal that the value is unclear.
4. **Do not go ultra-low.** Avoid prices like 5 or 9 per month "to reduce friction". Cheap
   prices attract the least committed buyers, churn more, and are hard to raise later. When unsure
   between two numbers, pick the higher one.
5. **Use a round number** (29, 49, 99, 199 are fine; avoid 9.99-style charm prices for a new
   product). Whole currency units only.
6. **Check the cost floor.** If the product has a per-use cost (OpenAI calls, storage, third-party
   APIs), estimate what a typical customer costs per month. Keep that at or below half the price.
   If it is higher, raise the price inside the bucket or say in the proposal that the margin is
   thin. For a `team` customer, one organization pays once, but every member adds cost.

## 3. Decide the trial

The app is a hard paywall, so a new customer sees nothing before paying. Default to a free trial
so they can see the value:

- `14` days, card required (`cardRequired: true`). Card-upfront trials convert much better and
  bring better-qualified signups.
- Use `7` days if the value is obvious in the first session; `30` days if setup takes real work
  (importing data, onboarding a team).
- No trial only if the founder asks for it.

Do not propose freemium: the paywall cannot grant partial access today.

## 4. Show, then persist

The interview shows the proposal in a few lines: price and interval, trial, currency (`EUR` by
default) and a one-sentence rationale (bucket, alternative, value). Apply it as the founder's one
answer leaves it.

Add a `pricing` block to `startup.config.json` (keep the existing fields):

```json
{
  "idea": "Contract review assistant for freelance designers",
  "pricing": {
    "source": "derived",
    "customer": "individual",
    "amount": 19,
    "interval": "month",
    "currency": "EUR",
    "trialDays": 14,
    "cardRequired": true,
    "rationale": "Freelancers pay about 30-60 per contract review today; 19 is well under the value and above the 9 trap.",
    "deferred": []
  }
}
```

`source` is `founder` or `derived`. `interval` is `month` or `year`. `currency` is the ISO code
shown on the storefront price (default `EUR`); it must match the Autumn organization's default
currency, which step 4e checks and changes when it differs. `trialDays` is `0` for no trial.
`deferred` lists pricing shapes the founder asked for that the code cannot sell yet.

## 5. Write `autumn.config.ts`

Change only the `pro` plan. Example for the block above:

```ts
export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 19, interval: 'month' },
  freeTrial: { durationLength: 14, durationType: 'day', cardRequired: true },
  items: [item({ featureId: appAccess.id })],
});
```

Omit `freeTrial` when `trialDays` is `0`. Do not push yet: step 4e (phase 2) pushes the config to
the Autumn sandbox, which production uses until go-live. The production push is part of going
live (`after-the-run.md`).

**Changing the price later** follows `after-the-run.md` ("Changing the price of an existing
startup"): the same `pro` plan and `pricing` block, plus a `legal.termsVersion` bump, because the
terms of sale show the price, the trial and the currency.

---

Pricing rules adapted from the `pricing` skill in
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT).
Only the parts that apply to a day-one price are kept. Willingness-to-pay surveys, price
increases and pricing-page audits need real customers and live traffic, so they are out of scope
for this step.
