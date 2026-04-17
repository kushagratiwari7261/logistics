-- ENABLE REALTIME FOR NOTIFICATIONS 
-- This allows the browser to receive instant updates when a new notification is inserted.

BEGIN;
  -- 1. Ensure the 'supabase_realtime' publication exists
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- 2. Add 'notifications' table to the publication
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
COMMIT;

-- 3. Verify the setting
ALTER TABLE notifications REPLICA IDENTITY FULL;
