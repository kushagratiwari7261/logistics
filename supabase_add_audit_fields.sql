-- Add audit fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Ensure replication is enabled for Realtime on jobs AND shipments tables
-- Dropping from publication if exists to avoid errors, then adding (or simply adding if safe)
-- But in Postgres, `ALTER PUBLICATION name ADD TABLE name` fails if it's already there. 
-- We'll try to add them if they are not already in the publication. Actually Supabase usually has a publication called `supabase_realtime` and we add tables to it.
-- Since this script could throw errors if the table is already in the publication, we can just execute the commands and ignore publication errors if it occurs, or better:
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'shipments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If the publication 'supabase_realtime' does not exist yet, we can create it
    -- but usually it exists in Supabase.
END;
$$;
