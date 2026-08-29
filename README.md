# Smart Restaurant OS

A multi-tenant SaaS platform for QR ordering, kitchen display, and floor
operations — **one Next.js app, one Vercel deployment, one Supabase project,
many restaurants.** A new restaurant becomes bookable at its own URL the
moment a Super Admin creates it; no new code, no new deploy, no new database.

```
yourdomain.com/menu/urban-spice        <- Restaurant A's customers
yourdomain.com/menu/royal-biryani      <- Restaurant B's customers
yourdomain.com/admin                   <- whichever restaurant you're logged into
yourdomain.com/kitchen                 <- that restaurant's kitchen display
yourdomain.com/waiter                  <- that restaurant's floor staff
yourdomain.com/super-admin             <- the platform owner, sees everything
```

## Architecture

**Stack:** Next.js 14 (App Router) - TypeScript - Tailwind CSS - Supabase
(Postgres, Auth, Realtime, Storage).

**Tenant isolation is enforced in three independent layers**, on purpose —
a bug in any one of them doesn't expose another restaurant's data:

1. **Row Level Security** (`supabase/migrations/0005_rls_policies.sql`) —
   every tenant-owned table carries `restaurant_id`, and every policy
   derives the caller's allowed restaurant(s) from their own
   `restaurant_members` row via `auth.uid()` — never from a client-supplied
   `restaurant_id`. See `lib/auth/session.ts` and the `auth_*` helper
   functions in `0004_auth_helpers.sql`.
2. **Route-level role gates** (`lib/auth/session.ts` -> `requireRole()`) —
   re-derives the caller's role from the database on every request to
   `/admin`, `/kitchen`, `/waiter`, `/super-admin`. This is a UX/performance
   layer, not the security boundary — RLS still applies underneath even if
   this were removed.
3. **Trusted server-side business logic** — prices, order totals, and
   state-machine transitions are computed inside `SECURITY DEFINER`
   Postgres functions (`0006_business_functions.sql`), not trusted from the
   client. The atomic waiter-claim (`claim_service_request`) is the sharpest
   example: a conditional `UPDATE ... WHERE status = 'pending'` guarantees
   exactly one waiter wins a race, enforced by Postgres row locking, not
   application code.

**Realtime** (`orders`, `order_items`, `service_requests`, `waiter_status`)
is authorized by the *same* RLS policies as regular reads — a client
subscribed with `filter: restaurant_id=eq.<A>` can never receive Restaurant
B's rows even if it tried to change the filter, because Supabase Realtime
evaluates the SELECT policy per row at delivery time.

**Known tradeoff (read before you rely on this for anything sensitive):**
customers have no accounts (by design — see spec section 9), so there's no
JWT claim RLS can check to express "only if you already know this order's
UUID." `orders`, `order_items`, and `service_requests` therefore grant
`anon` a narrow, *time-windowed* SELECT (recent rows only —
`0014_fix_public_order_visibility.sql`,
`0015_customer_service_request_visibility.sql`) rather than a blanket one.
This closes off historical cross-tenant bulk reads but doesn't stop someone
from enumerating *today's* orders if they had the anon key and were
motivated to script it. The documented hardening path, not implemented
here, is moving anonymous order updates to Supabase Realtime "Broadcast
from Database" on a private channel keyed by order id, and dropping anon's
table SELECT entirely in favor of a `SECURITY DEFINER` RPC for reads.

## Project structure

```
app/
  super-admin/         platform owner: restaurants, owners, platform stats
  admin/                restaurant owner/manager: menu, tables, staff, dashboard
  kitchen/              KDS: New / Preparing / Ready columns, audio alerts
  waiter/               FREE/BUSY toggle, live request queue, atomic claiming
  menu/[slug]/          public customer ordering app + order tracking
  auth/login/           shared login for every staff role
components/             one folder per area, mirrors app/
lib/
  supabase/             browser client, server client, admin (service-role) client
  auth/                 role/session resolution used by every protected layout
  restaurant/            restaurant-scoped reads shared by admin + super-admin
  customer/, kitchen/, shared/    area-specific helpers (cart, alert sound, etc.)
supabase/
  migrations/           numbered, sequential — see below
  seed/seed.sql          two demo restaurants, staff, tables, menu, one order
types/database.ts        hand-written types mirroring the schema + RPCs
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor (or via the CLI — see below), run every file in
   `supabase/migrations/` **in order** (they're numbered for exactly this
   reason; several depend on functions/policies created by earlier ones).
3. Run `supabase/seed/seed.sql` to create two demo restaurants (Urban
   Spice, Royal Biryani) with owners, kitchen/waiter staff, menus, and
   tables. **Every seeded account uses the password `Demo1234!`** — change
   this before using the seed script anywhere but local development.
4. In **Project Settings -> API**, copy the Project URL, `anon` key, and
   `service_role` key into your `.env.local` (see below).
5. Under **Authentication -> URL Configuration**, add your local
   (`http://localhost:3000`) and production site URLs so invite emails link
   back correctly.

**Using the Supabase CLI instead of the SQL editor:**
```bash
supabase link --project-ref <your-project-ref>
supabase db push        # applies every migration in supabase/migrations/
supabase db execute -f supabase/seed/seed.sql
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | safe to expose — RLS does the real work |
| `SUPABASE_SERVICE_ROLE_KEY` | server actions only | **never** prefix with `NEXT_PUBLIC_`. Used in exactly one place: inviting a new owner/staff member's `auth.users` account via the Admin API (`lib/supabase/admin.ts`). Everything else runs through the RLS-scoped client. |
| `NEXT_PUBLIC_SITE_URL` | table QR code generation | full origin, e.g. `https://yourdomain.com` |

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open `http://localhost:3000`, sign in with a seeded demo account (see
below), or go straight to `http://localhost:3000/menu/urban-spice?table=<a
seeded table's qr_token>` to try the customer flow — grab a `qr_token` from
the `tables` table in the Supabase dashboard, or generate one from
`/admin/tables` after logging in as the Urban Spice owner.

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build        # production build
```

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it into Vercel — framework preset `Next.js` is auto-detected.
3. Add the four environment variables above in **Project Settings ->
   Environment Variables** (Production and Preview).
4. Deploy. That's the entire deployment story — every restaurant you create
   afterward through `/super-admin` is served from this same deployment,
   immediately, with no further Vercel or Supabase configuration.

## Creating your Super Admin

The seed script creates one (`superadmin@platform.demo` / `Demo1234!`). To
create a real one in production:

```sql
-- run once, directly in the Supabase SQL editor, after inviting the person
-- via Authentication -> Users -> Invite in the Supabase dashboard (so their
-- password is set through the normal invite-email flow, not hardcoded here)
insert into public.restaurant_members (restaurant_id, user_id, role, display_name)
values (null, '<their auth.users id>', 'super_admin', 'Your Name');
```

Note `restaurant_id` is `null` — Super Admin is platform-level, not scoped
to any one restaurant (enforced by the `restaurant_members_super_admin_
scope` check constraint in `0002_tables.sql`).

## Creating restaurants and owners

All through the UI — this is the point of the platform:

1. Log in as Super Admin -> `/super-admin` -> **Create Restaurant**.
2. Fill in the restaurant's details and the owner's name/email/phone.
3. On submit: the restaurant row is created, the owner is invited by email
   (they get a Supabase invite link to set their password), the `owner`
   membership is attached, and — if you leave the checkbox on — default
   menu categories are seeded. The restaurant is live at `/menu/<slug>`
   immediately.
4. If the invite email fails to send (e.g. SMTP not configured yet, or the
   email's already registered), the restaurant isn't lost — the detail page
   shows a retry form.

The owner then signs in at `/admin` and builds out their menu, tables (with
QR codes), and staff from there. Owners can invite managers; owners *and*
managers can invite kitchen/waiter staff (managers can't create other
managers — see the RLS notes in `0011_admin_staff_policy_refinement.sql`).

## Testing the full customer -> kitchen -> waiter flow

1. **Get a table QR/link:** log in as an Urban Spice owner or manager ->
   `/admin/tables` -> "Show QR" on any table (or just copy the link — it's
   `/menu/urban-spice?table=<qr_token>`).
2. **Order as a customer:** open that link in an incognito tab, add a few
   items, place the order.
3. **Accept in the kitchen:** log in as `kitchen@urbanspice.demo` ->
   `/kitchen` -> **Start Shift** (this unlocks the audio alert — browsers
   block sound before a user gesture) -> the new order appears in **New**
   with an alert tone looping -> **Accept & Set Time**.
4. **Watch it update live:** the customer's tracking page updates to
   "Accepted"/"Preparing" with no refresh. Mark **Ready**, then **Served**
   from the kitchen board.
5. **Call a waiter:** from the customer menu, tap the floating **+** ->
   **Call Waiter**.
6. **Claim it:** log in as `waiter1@urbanspice.demo` and
   `waiter2@urbanspice.demo` in two different browser profiles, both
   toggled to **FREE** -> both see the request appear -> whichever taps
   **Accept** first wins; the other sees the button disappear (or "Task
   already claimed" if they tapped within the same race window). The
   customer's screen shows "Waiter is on the way."
7. **Resolve:** the waiter who claimed it taps **Resolve** -> they go back
   to FREE, the request disappears from the board.

## Multi-tenant isolation smoke test

With `owner@urbanspice.demo` and `owner@royalbiryani.demo` logged into two
separate browser profiles: confirm neither can see the other's `/admin`
data, `/kitchen` orders, or `/waiter` requests — and that a Super Admin
logged in separately can see both from `/super-admin`. Suspending Urban
Spice (`/super-admin` -> restaurant row -> Suspend) should immediately
block new orders at `/menu/urban-spice` (shows the "currently inactive"
message) while leaving its historical orders intact — nothing is deleted
on suspension.

## Security notes

- **Never trust client input for:** `restaurant_id`, user role, order
  totals, menu prices, or order status. All of these are re-derived or
  re-validated server-side — see `create_order()`, `kitchen_accept_order()`,
  and `update_order_status()` in `0006_business_functions.sql` for the
  concrete pattern.
- **The service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) is used in exactly
  one file, `lib/supabase/admin.ts`, for exactly one purpose: inviting a new
  staff member's auth account. If you find yourself reaching for it
  elsewhere, that's almost always a sign the operation should go through
  the RLS-scoped client instead.
- **Concurrency-sensitive operations are database-atomic, not
  application-locked:** waiter claiming (`claim_service_request`) and order
  state transitions (`update_order_status`) both use conditional `UPDATE`
  statements that succeed for exactly one caller under a race, verified via
  `GET DIAGNOSTICS ... ROW_COUNT`.
- **See the "Known tradeoff" paragraph above** under Architecture for the
  one place (anonymous order/service-request visibility) where the security
  model is intentionally narrowed rather than fully closed, and why.
