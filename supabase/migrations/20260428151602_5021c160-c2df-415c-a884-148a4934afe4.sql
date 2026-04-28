SELECT cron.schedule(
  'learning-maybe-retrain-nightly',
  '15 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://lpjejahmmtfknlbfiapx.supabase.co/functions/v1/maybe-trigger-retraining',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwamVqYWhtbXRma25sYmZpYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDIxMzAsImV4cCI6MjA5MDQ3ODEzMH0.9wv9HtlBR2OYr-FBOstvMSSfRSbdXB3cxVJc8BSKQ2o"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'learning-train-challenger-nightly',
  '30 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://lpjejahmmtfknlbfiapx.supabase.co/functions/v1/train-challenger-model',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwamVqYWhtbXRma25sYmZpYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDIxMzAsImV4cCI6MjA5MDQ3ODEzMH0.9wv9HtlBR2OYr-FBOstvMSSfRSbdXB3cxVJc8BSKQ2o"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'learning-shadow-evaluate-nightly',
  '45 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://lpjejahmmtfknlbfiapx.supabase.co/functions/v1/evaluate-challenger-model',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwamVqYWhtbXRma25sYmZpYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDIxMzAsImV4cCI6MjA5MDQ3ODEzMH0.9wv9HtlBR2OYr-FBOstvMSSfRSbdXB3cxVJc8BSKQ2o"}'::jsonb,
    body := '{"window_days":30}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'learning-run-shadow-predictions-10m',
  '*/10 * * * *',
  $$ SELECT net.http_post(
    url := 'https://lpjejahmmtfknlbfiapx.supabase.co/functions/v1/run-shadow-predictions',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwamVqYWhtbXRma25sYmZpYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDIxMzAsImV4cCI6MjA5MDQ3ODEzMH0.9wv9HtlBR2OYr-FBOstvMSSfRSbdXB3cxVJc8BSKQ2o"}'::jsonb,
    body := '{"limit":200,"lookback_days":14}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'learning-pipeline-health-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://lpjejahmmtfknlbfiapx.supabase.co/functions/v1/pipeline-health-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwamVqYWhtbXRma25sYmZpYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDIxMzAsImV4cCI6MjA5MDQ3ODEzMH0.9wv9HtlBR2OYr-FBOstvMSSfRSbdXB3cxVJc8BSKQ2o"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);