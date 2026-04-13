-- Update vendors table to support partner types
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS partner_type VARCHAR(20) DEFAULT 'customer';

-- Update existing records (optional, defaults to customer as per request to change 'Customer' to 'Business Partner')
-- UPDATE vendors SET partner_type = 'customer' WHERE partner_type IS NULL;
