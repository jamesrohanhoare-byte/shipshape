# ShipShape — Project Handover

> Paste this whole file into a new chat to resume with full context.
> Last updated: 2026-06-01 · Current version: **v1.6.0** (live).

---

## 1. TL;DR — current status

**ShipShape** is a white-label, mobile-first **yacht inventory + crew-ops PWA**, built by **Social Agencies** (James Hoare). It tracks every consumable on a boat (alcohol → toilet paper → games). Crew log usage; when stock drops to its **par level** it auto-appears on a Shopping list and pushes the captain/manager.

- **Live:** https://shipshape-ebon.vercel.app
- **GitHub:** https://github.com/jamesrohanhoare-byte/shipshape (branch `main`)
- **It is fully built and deployed.** v1 shipped, then a long polish + bug-fix round.
- **One thing left to confirm:** whether stock-use **push notifications** fire end-to-end. A "Send a test alert" button was just added (Settings → Alerts) to diagnose it — the next step is James tapping it and reading the result.

---

## 2. What it does (features, all built)

- **Inventory core:** configurable items (unit of measure, price/unit, par level), add/deduct via a tactile quantity sheet, immutable `stock_movements` ledger, cached `current_quantity` kept in sync by a DB trigger.
- **Auto shopping list:** everything at/below par, with suggested order qty + cost, shareable.
- **4 roles:** Captain (full), Manager (stock + config), Deckhand (log usage only), Engineer (usage + tasks). Enforced by **RLS + UI**.
- **Push notifications (OneSignal):** on every use *or* only when low *or* off (per-boat `notify_mode`), escalating message when crossing par. Targets captain + manager.
- **Tasks** (engineers/crew), **manual Sleep log**, **Reports** (usage & cost by item/category over an interval, Recharts).
- **Per-boat branding:** logo upload, accent colour, light/dark theme — shows in app + on reports.
- **Spreadsheet import/export** (Settings → Data): flexible column matching (only `Name` required), template download, Excel export/backup. Uses SheetJS (lazy-loaded).
- **First-run onboarding** walkthrough (replayable in Settings), teaches the daily loop + unit-of-measure.
- **Stock category filter** (chips), search, All/Low/Out segmented filter.
- **PWA:** installable, device-aware install prompt, network-first so updates self-apply.

---

## 3. Live environment & accounts

| Thing | Value |
|---|---|
| Live URL | https://shipshape-ebon.vercel.app |
| GitHub | github.com/jamesrohanhoare-byte/shipshape |
| Vercel project | `shipshape` (account `jamesrohanhoare-3760`) |
| Supabase project ref | `mornbzqtcpugyzxnclfb` |
| Supabase URL | https://mornbzqtcpugyzxnclfb.supabase.co |
| OneSignal App ID | `37e04acd-a150-4a1f-ba12-86c69fcac3b1` |
| Local path | `c:\Users\james\Documents\Claude\SocialAgencies\Projects\ClientWork\ShipShape` |

**Test data (3 boats, all separate tenants):**
- **SocialYaht** (`88821645-0c8b-49a2-aefc-a33ca06967eb`) — captain `jdhillster136@gmail.com` (Jared) + deckhand `test1@gmail.com` (Sam). Has the test item + the OneSignal-subscribed devices.
- **Poes nice** — captain `deanfall10@gmail.com`.
- **social agencies** — captain `sales@socialagencies.co.za`.

> All push-subscribed devices are currently the SocialYaht captain (external_user_id `3cd9c3ce-1c58-49a7-a8c0-8d733debdd99`).

---

## 4. Tech stack

React 19 · Vite 8 · TypeScript · Tailwind 4 · Framer Motion · TanStack Query · Recharts · SheetJS (xlsx, lazy) · Supabase (Postgres + Auth + Storage + Edge Functions) · OneSignal (web push) · deployed on Vercel.

Design system: iOS-native marine. **SF system font on Apple, Geist webfont on non-Apple.** Grouped lists, glass tab bar/headers/sheets, ocean-teal default accent (per-boat overridable via a runtime `--color-accent` CSS var + `color-mix` derived shades).

---

## 5. ⚙️ Operational / deploy playbook (CRITICAL — read before deploying)

**Frontend deploy — git push does NOT auto-deploy.** The Vercel↔GitHub integration is not triggering builds. After committing, **always** run from the project dir:
```bash
vercel --prod --yes
```
Then verify the live bundle changed:
```bash
curl -s https://shipshape-ebon.vercel.app | grep -o '/assets/index-[^"]*\.js' | head -1
```
(Vercel CLI is installed and logged in as `jamesrohanhoare-3760`.)

**Bump the version every release:** edit `src/lib/version.ts` (`APP_VERSION`). It shows as a badge in Settings + the More sheet so James can confirm which build is live.

**Database migrations** live in `supabase/migrations/0000N_*.sql`. Apply either by:
- pasting `supabase/migrations/setup_all.sql` (the concatenation of all migrations) into the Supabase SQL editor, OR
- running SQL directly via the **Management API** (used throughout this project):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mornbzqtcpugyzxnclfb/database/query" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"query":"<SQL>"}'
```
After adding a migration, regenerate `setup_all.sql` (cat all migrations in order).

**Edge functions** — deploy with the CLI via npx, and **always `--no-verify-jwt`** (see gotcha #3):
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy notify-low-stock \
  --project-ref mornbzqtcpugyzxnclfb --use-api --no-verify-jwt
```
`supabase/config.toml` persists `verify_jwt = false` for both functions.

**Function secrets** (already set): `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`. To change:
```bash
npx supabase secrets set NAME=value --project-ref mornbzqtcpugyzxnclfb
```

**Vercel env vars** (already set in Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ONESIGNAL_APP_ID`. Local dev reads `.env.local` (gitignored).

---

## 6. 🔑 Secrets (NOT in this file — provide to a new session as needed)

These passed through the original chat and **should be rotated** when convenient:
- **Supabase access token** (`sbp_…`) — needed to deploy functions / run Management-API SQL. James has it; paste into a new session when DB/function work is needed.
- **OneSignal REST API key** (`os_v2_app_…`) — server-side only (Supabase secret). Rotate → re-set the secret.

The client bundle only contains **public** identifiers (Supabase URL, anon key, OneSignal App ID) — verified, no secrets leak. Security boundary = RLS + server-side secrets.

---

## 7. Architecture

### Data model (Postgres, all tables boat-scoped unless noted)
- `boats` — id, name, slug, `logo_url`, `accent_color`, `theme_mode` (light/dark/auto), `notify_mode` (all/low/off).
- `profiles` — id (→auth.users), `boat_id`, email, full_name, `role` (captain/manager/deckhand/engineer), `onboarded` bool.
- `units` — id, boat_id, name, abbreviation.
- `categories` — id, boat_id, name.
- `items` — id, boat_id, name, category_id, unit_id, price_per_unit, par_level, **current_quantity** (cached), location, photo_url.
- `stock_movements` — id, boat_id, item_id, user_id, change_qty (signed), type (add/deduct/adjust/stocktake), note. **Immutable ledger.**
- `tasks` — id, boat_id, title, description, assigned_to, status (open/in_progress/done), due_date, **shift (day/night), is_recurring, recurrence_type (daily/weekly/monthly), recurrence_start_date** (v1.6.0).
- `task_completions` — **(v1.6.0)** boat-scoped per-occurrence state for recurring tasks: id, boat_id, task_id, occurrence_date, done, skipped. Unique (task_id, occurrence_date). One-off tasks ignore this table (use tasks.status).
- `sleep_logs` — **user-scoped** (user_id = auth.uid()): log_date, sleep_start, sleep_end, hours, note.

### Key DB functions
- `get_user_boat_id()`, `get_user_role()` — security-definer helpers used in every RLS policy.
- `get_my_context()` — returns `{profile, boat}` json for the current user (the app calls this on login; new columns auto-included via `to_json`).
- `create_boat_and_profile(boat_name, full_name)` — captain self-signup: creates boat + captain profile + seeds units/categories.
- `apply_stock_movement()` — trigger on `stock_movements`; updates `items.current_quantity`. **MUST be `security definer`** (gotcha #4).

### RLS model
Every table: `using (boat_id = get_user_boat_id())` + matching `with check`. Writes role-gated via `get_user_role()`:
- items/units/categories writes → captain, manager.
- `stock_movements` insert → deduct allowed for all roles; add/adjust/stocktake → captain/manager.
- profiles/crew → captain only (+ self edits). tasks → captain/manager/engineer. sleep_logs → owner only.
- Storage bucket `boat-logos` (public read; write captain/manager within `{boat_id}/` path).

### Edge functions (`supabase/functions/`)
- **`create-crew-member`** — captain-only; creates an auth user + profile (service role) scoped to the captain's boat. Called from Settings → Crew.
- **`notify-low-stock`** — sends OneSignal push to captain+manager of the boat. Normal mode (after a deduct, respects `notify_mode`, escalates when low/out) + **test mode** (`{test:true}` returns OneSignal's raw response for the Settings test button). Both verify the JWT internally via `admin.auth.getUser(jwt)`.

### Frontend structure (`src/`)
- `App.tsx` — router + auth gate + onboarding gate.
- `context/AuthContext.tsx` — session/profile/boat, applies branding, **6s safety timeout** + **no-op auth lock** (gotchas #1/#2).
- `lib/` — `supabase.ts` (client + no-op lock), `api.ts` (edge fn calls: notifyUsage, createCrewMember, sendTestAlert), `spreadsheet.ts` (import/export), `theme.ts`, `permissions.ts`, `version.ts`, `push.ts`, `formatters.ts`.
- `hooks/` — `useInventory.ts` (items/units/categories + useLogMovement/useStocktake), `useCrew.ts`, `usePWAInstall.ts`.
- `components/` — `Layout`, `BottomNav`, `MoreSheet`, `Sheet` (drag-to-dismiss), `QuantitySheet`, `ItemFormSheet`, `TaskSheet`, `Onboarding`, `OneSignalInit`, `InstallPrompt`, `PageHeader`, `EmptyState`, `SplashLoader`, `SettingsDataTab`.
- `pages/` — `Auth`, `Home`, `Stock`, `Shopping`, `Tasks`, `Sleep`, `Reports`, `Crew`, `Settings`.

---

## 8. Version history
- **v1.0** — initial full build, shipped to Vercel.
- **v1.1** — notification volume control, Settings fixes (units/categories save+edit, logo upload, branding persist), Geist font, glass pass, version badge.
- **v1.2** — Data tab: spreadsheet import + template + export.
- **v1.3.0–1.3.5** — onboarding walkthrough; then the hang-fix saga: network-first SW (1.3.2), 6s auth timeout (1.3.4), **no-op auth lock (1.3.5)**.
- **v1.4.0** — onboarding teaches daily loop + unit-of-measure; inline Settings hints. Also: **deckhand-deduction trigger fix** (security definer) + **verify_jwt=false** on functions.
- **v1.5.0** — "Send a test alert" diagnostic button + Stock category filter.
- **v1.6.0** — **Tasks redesign** (BlitzBooks-style day engine + crew/status model): horizontal day strip with unfinished-day dots; status-segmented board (To do/Doing/Done, "Variant A"); Day/Night-watch **shift filter** (night watch is a task flag, not a status); **recurring tasks** (daily/weekly/monthly via `task_completions`, per-occurrence done); **carry-over** of unfinished one-off tasks to today+future, badged "From <date>"; recurring delete sheet (skip this day / delete series). Migration `00007` (shift + recurrence cols on `tasks`, new boat-scoped `task_completions` table). New files: `src/lib/taskScheduling.ts`; rewrote `src/pages/Tasks.tsx` + `src/components/TaskSheet.tsx`. `setup_all.sql` now generated (00001–00007).

> **Tasks v1.6.0 — known follow-ups / notes:** recurring tasks are **tick-done only** (no Doing state) by design; carry-over shows on today **and future** days (kept, per James); **notifications on task-done are NOT built** (deferred — was the agreed next feature after the redesign). Sketch + plan: `.planning/sketches/001-tasks-day-board/`, `docs/superpowers/plans/2026-06-01-tasks-day-scheduling.md`.

---

## 9. 🐛 The big bugs & fixes (hard-won learnings)

1. **Stale service-worker cache** — aggressive PWA precache served old/broken builds; users got stuck on a pulsing splash. Fix: **network-first** shell (exclude `index.html` from precache, NetworkFirst nav). Escaping an already-stuck build needs a one-time "Clear site data" (F12 → Application → Storage) / uninstall+reinstall the PWA.
2. **Supabase auth Web-Locks deadlock** — supabase-js v2 uses `navigator.locks` to coordinate token refresh; in previously-opened browsers (with a SW) it deadlocked, hanging `getSession`/`signInWithPassword`/queries forever. **Symptom: login/splash hang on desktop, fine on phone/incognito. NOT the shared account.** Fix: pass a **no-op `lock`** to `createClient` (`src/lib/supabase.ts`) + a 6s safety timeout in AuthContext.
3. **verify_jwt CORS block** — edge functions deployed with gateway `verify_jwt=true` rejected the browser's CORS preflight (no auth header on OPTIONS), so calls died before reaching the function (curl worked, browser didn't). Fix: deploy with `--no-verify-jwt`; functions verify the JWT themselves. Persisted in `config.toml`.
4. **Deckhand deduction didn't lower the count** — the `apply_stock_movement` trigger ran as the invoking user; a deckhand can insert a deduct but **can't update items** (RLS), so the count update silently affected 0 rows. Fix: make the trigger **`security definer`**. (Reconciled drifted counts from the ledger afterward.)
5. **Notifications targeting** — OneSignal filters evaluate left-to-right with no grouping, so a combined captain-OR-manager filter would leak across boats. Fix: one targeted send per role (`boat_id AND role`).

---

## 10. ⏳ Outstanding / in-progress

- **Confirm stock-use push fires.** Delivery + targeting are PROVEN (forced sends arrive). Whether a *user deduction* triggers it end-to-end is unconfirmed — earlier tests were muddied by stale builds. **Next step: James taps Settings → Alerts → "Send a test alert" and reads the result** ("Sent to N devices ✅" / "0 devices matched" / an error). That pinpoints it.
- **First-launch stall** — should be resolved by v1.5.0 (lock fix); residual is the one-load SW-update lag. If a hard stall persists on a confirmed-v1.5.0 load, add a more aggressive "new version → auto reload" prompt.
- iOS push only works after the PWA is installed to the Home Screen (iOS 16.4+).

---

## 11. 📋 Backlog / ideas (not yet built)
- **Stronger "glassy" UI** — James felt the glass is still too subtle; needs a richer background so the frosting reads (more saturated accent mesh + more translucency).
- **Proper PNG icon set** (192/512 + apple-touch + OneSignal default icon) generated from `public/icon.svg` — current icons are SVG only.
- **Charter/APA consumption billing** (flagged as the strongest sellable v2 differentiator — track guest consumption per charter → auto reconciliation/bill).
- Move crew onto **individual logins** in real use (works already; it's an operational habit, gives who-did-what accountability).
- Offline-first sync · barcode/QR scan · wearable sleep sync · agency super-admin tier across boats · supplier management.
- Harden `xlsx` (npm 0.18.5 has a low-sev advisory; fine for captain-uploaded files).

---

## 12. Known gotchas / "if X breaks, it's probably Y"
- **App hangs on splash / login on desktop** → stale SW cache; clear site data once. (Underlying deadlock already fixed.)
- **A function works in curl but not from the app** → `verify_jwt` got re-enabled; redeploy with `--no-verify-jwt`.
- **A count doesn't change after a movement** → check `apply_stock_movement` is still `security definer`.
- **New DB column not showing in the app** → it's fine; `get_my_context` returns `to_json(p)` so columns auto-include — just add to the TS type.
- **Pushes don't arrive** → use the "Send a test alert" button; check `notify_mode` ≠ off, device subscribed + tagged (boat_id/role), and OneSignal Web platform is activated (it is — `site_name` set).
- **Deploy "succeeded" but live didn't change** → git push doesn't auto-deploy; run `vercel --prod --yes` and verify the bundle hash.

## How James works (style)
Ruthless-mentor tone, sharp/direct, money/leverage framing, SA/ZAR context, explain simply, **always push to GitHub after committing** (and here: run `vercel --prod` too).
