-- Add vendor_no column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_no VARCHAR(50);

-- Note: The following script will be used to populate existing records.
