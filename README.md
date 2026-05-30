# ShipShape

A configurable, mobile-first **yacht inventory & crew-ops** PWA. White-label: one
app, dropped onto many boats. A Captain registers their boat, adds crew with roles,
configures stock items (unit, price, par level), and the crew log usage. When an
item drops to its par level it auto-appears on a shopping list and pushes the
captain + manager. Built to feel like a native iOS app.

Built by **Social Agencies**.

## Features (v1)

- **Inventory core** — configurable items (unit of measure, price/unit, par level),
  add/deduct via a tactile quantity sheet, an immutable `stock_movements` ledger.
- **Auto shopping list** — everything at/below par, with suggested order qty + cost.
- **4 roles** — Captain (full control), Manager (stock + config), Deckhand (log
  usage), Engineer (log usage + tasks). Enforced by RLS *and* UI.
- **Push notifications** — low-stock alerts to captain/manager via OneSignal.
- **Tasks** — assign and track jobs (engineers & crew).
- **Sleep log** — manual rest tracking with weekly totals.
- **Reports** — usage & cost by item / category over a chosen interval (POS-style).
- **Branding** — per-boat logo, accent colour, light/dark theme.
- **PWA** — installable, device-aware install prompt, full-screen.

## Stack

React 19 · Vite 8 · TypeScript · Tailwind 4 · Framer Motion · TanStack Query ·
Recharts · Supabase (Postgres + Auth + Storage + Edge Functions) · OneSignal ·
deploys on Vercel.

## Setup

### 1. Install
```bash
npm install
cp .env.local.example .env.local   # fill in the values below
```

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in order (SQL editor or `supabase db push`):
   `supabase/migrations/00001 → 00004`.
3. **Disable email confirmation** (Auth → Providers → Email → turn off "Confirm
   email") so captains and crew can sign in immediately.
4. Deploy the edge functions:
   ```bash
   supabase functions deploy create-crew-member
   supabase functions deploy notify-low-stock
   ```
5. Set edge-function secrets:
   ```bash
   supabase secrets set ONESIGNAL_APP_ID=...  ONESIGNAL_REST_API_KEY=...
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.)
6. Put the project URL + anon key into `.env.local`.

### 3. OneSignal (push)
1. Create a Web Push app at [onesignal.com](https://onesignal.com).
2. Put the **App ID** in `.env.local` (`VITE_ONESIGNAL_APP_ID`) and set the App ID +
   REST API key as Supabase secrets (step 2.5).
3. iOS only receives push **after** the PWA is installed to the Home Screen
   (iOS 16.4+) — the app guides users through this.

### 4. Run
```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

### 5. Deploy (Vercel)
Import the repo, set the `VITE_*` env vars, deploy. `vercel.json` already rewrites
all routes to `index.html` for the SPA.

## Notes
- App icons are generated from `public/icon.svg`. For best PWA results, also drop in
  PNG icons (192/512) and an `apple-touch-icon` — generate them from the SVG.
- Online-only in v1 (boats use Starlink). Offline-sync is a v2 item.
- Sleep tracking is manual entry — wearable sync (Apple Health / Whoop / etc.) is v2.
