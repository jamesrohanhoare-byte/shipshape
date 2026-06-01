# Notifications batch (v1.10.0) — deploy steps

This batch needs DB + edge-function + cron deploys, not just a migration. Do these in order.
Project ref: `mornbzqtcpugyzxnclfb`.

### 1. Database migration (SQL editor)
Paste `supabase/migrations/00010_shopping_dismiss.sql` → Run.
Adds `items.shopping_dismissed` and updates the stock trigger to auto-clear it on restock.

### 2. Deploy the edge functions (CLI, needs SUPABASE_ACCESS_TOKEN)
```bash
SUPABASE_ACCESS_TOKEN=<sbp_…> npx supabase functions deploy notify-task \
  --project-ref mornbzqtcpugyzxnclfb --use-api --no-verify-jwt
SUPABASE_ACCESS_TOKEN=<sbp_…> npx supabase functions deploy daily-task-digest \
  --project-ref mornbzqtcpugyzxnclfb --use-api --no-verify-jwt
```
(`notify-low-stock` and `create-crew-member` are unchanged.)

### 3. Set the cron secret (CLI)
```bash
npx supabase secrets set CRON_SECRET=<pick-a-long-random-string> --project-ref mornbzqtcpugyzxnclfb
```

### 4. Schedule the daily digest (SQL editor)
Open `supabase/cron/daily-task-digest.sql`, replace `<CRON_SECRET>` with the same value as step 3, → Run.
Enable the `pg_cron` + `pg_net` extensions first if prompted (Database → Extensions).

### 5. Ship the frontend
```bash
git push        # merge feat/notifications → main first
vercel --prod --yes
```

## What this turns on
- **Instant:** task completed → captain/manager; task assigned (with a due date) → the assignee.
- **Already wired:** item used / low / below-par + "added to shopping list" (via `notify-low-stock`).
- **Scheduled:** 07:00 UTC per-boat "N tasks due today" push (boat-scoped — each boat only its own).
- **Shopping:** remove an item from the list (X); it re-appears automatically once restocked above par and dips again.

## Verify (on a real device, captain login)
- Settings → Alerts shows **enabled ✓** persistently (no longer resets).
- Background the app, complete a task on another device → captain gets "✅ Task done".
- Assign a task to a crew member → that member gets "📋 New task".
- Test the digest now without waiting for 07:00:
  ```bash
  curl -s -X POST https://mornbzqtcpugyzxnclfb.supabase.co/functions/v1/daily-task-digest \
    -H "x-cron-secret: <CRON_SECRET>"
  ```
