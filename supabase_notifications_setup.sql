-- 1. Add assignment and deadline tracks to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- 2. Create Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- 'assignment', 'reminder', 'system'
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. Add Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 4. Enable Real-time for notifications
ALTER TABLE notifications REPLICA IDENTITY FULL;
-- (Make sure to enable 'notifications' in the Supabase 'realtime' publication via UI/SQL)
