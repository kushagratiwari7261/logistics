-- Enable RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to update their own notifications (for marking as read)
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow the service role (backend) to insert notifications
-- (Special backend key handles this, but explicit policy for safety)
CREATE POLICY "Service role can manage all notifications"
ON notifications FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
