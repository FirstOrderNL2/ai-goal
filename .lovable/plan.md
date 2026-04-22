

# Subscription System: 30-day trial → Stripe €10/mo (with Stripe Tax)

## Provider switch

Paddle is out (their AUP excludes sports prediction / betting-tips SaaS). Replacing with **Lovable's built-in Stripe payments + Stripe Tax** for automatic VAT collection across EU/UK/US. No Stripe account needed to test — sandbox provisions immediately. Product framing stays as-is ("predictions / probabilities / intelligence"); Value Bets remain.

Everything else from the previously approved plan (DB schema, trial logic, paywall UX, access control) stays identical — only the payment integration layer changes.

## What this run delivers

### 1. DB — `subscriptions` table

| Column | Purpose |
|---|---|
| `user_id` (FK auth.users, unique) | One row per user |
| `tier` enum: `trial` / `active` / `past_due` / `canceled` / `expired` | Source of truth |
| `trial_started_at`, `trial_ends_at` (default `now() + 30 days`) | Auto-set on signup |
| `stripe_customer_id`, `stripe_subscription_id` | Set after first checkout |
| `current_period_end` | Mirrored from Stripe |
| `updated_at` | Touched by webhook |

- Trigger on `auth.users` insert → auto-creates row with 30-day trial, no card required
- RLS: each user reads only own row; writes service-role only (trigger + webhook)
- Helper function `public.has_access(_user_id uuid) returns boolean` (security definer): true when `(tier='trial' AND now() < trial_ends_at) OR (tier='active' AND now() < current_period_end)`

### 2. Stripe integration (Lovable built-in, sandbox-first)

- Enable via `enable_stripe_payments` — provisions Lovable-managed sandbox immediately
- One product: **GoalGPT Premium**, recurring **€10/month**
- **Stripe Tax enabled** on the price → automatic VAT calculation/collection across EU/UK/US (~0.5% extra). User/you still file/remit (or use Stripe filing partners later)
- Three new edge functions:
  - `create-checkout-session` — returns Stripe Checkout URL for logged-in user; passes `client_reference_id = user_id`
  - `stripe-webhook` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → mirrors state into `subscriptions`
  - `stripe-customer-portal` — returns hosted billing portal URL for cancel / payment-method / invoices

### 3. Client — `useSubscription()` hook

Single source of truth: `{ tier, daysLeft, hasAccess, loading, currentPeriodEnd }`. Subscribes to realtime changes on the user's row so UI flips instantly after webhook write.

### 4. UI surfaces

**a) `<TrialBanner />`** — sticky in `Header.tsx`
- Trial: green, "Free trial — N days left · Upgrade →"
- ≤5 days: amber tone
- Expired/canceled: red, "Trial ended. Upgrade for €10/mo →"
- Active paid: hidden

**b) `/upgrade` page** — dark+neon theme matching Landing
- Single €10/mo card, feature list (live predictions, recheck updates, AI reasoning, Confidence Engine, Value Bets, multilingual)
- "Subscribe" → `create-checkout-session` → Stripe Checkout
- After return: `/upgrade/success` polls `subscriptions.tier` until `active` → redirects to `/dashboard`

**c) `<PaywallOverlay />` on `/match/:id`** (your choice: blurred + overlay)
- When `!hasAccess`: ProbabilityBar, AIReasoning, OverUnderCard, ValueBetCard, ConfidenceEngineCard rendered with `blur-sm pointer-events-none` + centered card "Upgrade to see this prediction · €10/mo"
- Match metadata (teams, kickoff, league, lineups) remains visible — user understands what's behind the paywall
- Dashboard cards stay clickable; locked detail page is the conversion surface

**d) Profile page** — subscription panel
- Tier badge, trial countdown OR next billing date
- "Manage subscription" → opens Stripe Customer Portal (cancel handled there)

### 5. Edge function access guard

New `_shared/access-guard.ts` exporting `assertHasAccess(userId)` → calls `has_access()` RPC. Mounted in **user-triggered** entrypoints only:
- `generate-statistical-prediction` (when called from match-detail on-demand)
- `football-intelligence` (user-triggered AI calls)
- `generate-post-match-review` (already credit-gated; align with subscription)

Cron-triggered jobs (auto-sync, batch-generate, nightly-reconcile) bypass — they're system, not user-bound.

### 6. Routing

- `/:lang/upgrade`, `/:lang/upgrade/success` (logged-in only; redirect to `/login` otherwise)
- All existing routes unchanged; gating happens at component level

## Files touched

**New**
- Migration: `subscriptions` table, RLS, `has_access()` function, signup trigger
- `src/hooks/useSubscription.tsx`
- `src/components/PaywallOverlay.tsx`, `src/components/TrialBanner.tsx`
- `src/pages/Upgrade.tsx`, `src/pages/UpgradeSuccess.tsx`
- `supabase/functions/_shared/access-guard.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/stripe-customer-portal/index.ts`

**Edited**
- `src/App.tsx` — register 2 new routes
- `src/components/Header.tsx` — mount `<TrialBanner />`
- `src/pages/MatchDetail.tsx` — wrap prediction sections in `<PaywallOverlay />`
- `src/pages/Profile.tsx` — subscription card
- `supabase/functions/generate-statistical-prediction/index.ts`, `football-intelligence/index.ts`, `generate-post-match-review/index.ts` — `assertHasAccess` on user-triggered paths
- i18n EN/DE — banner, upgrade page, paywall copy

## Out of scope (intentional)

- Annual plan / promo codes (single €10/mo SKU; add later in Stripe catalog without code changes)
- Email / push notifications, favorites, ML-vs-Poisson toggle (your Phase 8)
- Granular role tiers beyond trial/active/expired (admin/moderator stays separate)
- Going live on Stripe (requires you to claim the Lovable-managed account and complete Stripe verification — sandbox works for full testing now)

## Success criteria

- New signup → `tier='trial'`, `trial_ends_at = signup + 30d`, no card prompt
- Trial user sees green banner with countdown; full match detail visible
- Force `trial_ends_at` to past → banner red, match detail blurred with overlay
- Subscribing in Stripe sandbox → webhook flips `tier='active'` within seconds, blur lifted
- Cancel in Customer Portal → `tier='canceled'`, access until `current_period_end`, then auto-`expired`
- User-triggered edge functions return 403 without access; cron jobs unaffected
- VAT line appears on Stripe invoice for EU test customer (Stripe Tax verification)

