-- ============================================================
-- Schedule the daily per-boat "tasks due today" push (07:00 UTC).
-- Run this ONCE in the Supabase SQL editor. Replace <CRON_SECRET>
-- with the same value set as the daily-task-digest function secret.
--
-- Requires the pg_cron and pg_net extensions (enable under
-- Database → Extensions if not already on).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running is safe: drop an existing job of the same name first.
select cron.unschedule('daily-task-digest')
where exists (select 1 from cron.job where jobname = 'daily-task-digest');

select cron.schedule(
  'daily-task-digest',
  '0 7 * * *',                         -- every day at 07:00 UTC
  $$
  select net.http_post(
    url     := 'https://mornbzqtcpugyzxnclfb.supabase.co/functions/v1/daily-task-digest',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', '<CRON_SECRET>'
               ),
    body    := '{}'::jsonb
  );
  $$
);
