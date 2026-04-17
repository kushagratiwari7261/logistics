-- 1. Add Assignment and Deadline tracking to Jobs
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notification_flags JSONB DEFAULT '{}'::jsonb;

-- 2. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'assignment', 'reminder', 'deadline', 'system'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs(assigned_to);

-- 4. Enable RLS on notifications (if not already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 5. Policies for notifications
CREATE POLICY "Users can see their own notifications" 
ON notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications (mark as read)" 
ON notifications FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
