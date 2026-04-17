-- 1. Create Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'In Progress', 'Completed', 'Cancelled'
    priority TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
    deadline_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_tasks_sender_id ON tasks(sender_id);
CREATE INDEX IF NOT EXISTS idx_tasks_receiver_id ON tasks(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- 3. Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Users can view tasks they sent or received" 
ON tasks FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create tasks" 
ON tasks FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Involved users can update task status" 
ON tasks FOR UPDATE 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 5. Enable Real-time
ALTER TABLE tasks REPLICA IDENTITY FULL;
