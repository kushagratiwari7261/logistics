-- Add boe_no and boe_date to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS boe_no TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS boe_date DATE;

-- Add boe_no and boe_date to shipments table
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS boe_no TEXT;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS boe_date DATE;

-- Update existing records: if any import jobs/shipments used sb_no, we could migrate them, 
-- but the user said "replace sb no with boe" for imports, implying they might have been using sb_no for boe.
-- To be safe, we won't move data unless asked, but we'll provide the columns now.
