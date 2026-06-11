-- Create the dsr_workbooks table
CREATE TABLE IF NOT EXISTS public.dsr_workbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    workbook_data JSONB DEFAULT '[]'::jsonb,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.dsr_workbooks ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/insert/update/delete
CREATE POLICY "Enable all for authenticated users" ON public.dsr_workbooks
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Also allow anon for simplicity if needed (since it's a dev project, checking your other policies might be good, but authenticated is standard)
CREATE POLICY "Enable all for anon" ON public.dsr_workbooks
    FOR ALL
    USING (true)
    WITH CHECK (true);
