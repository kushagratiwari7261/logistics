-- Add client_email to jobs and shipments for tracking offline and link generations
ALTER TABLE IF EXISTS jobs ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Enhance payments table with offline tracking and link features
ALTER TABLE IF EXISTS payments 
  ADD COLUMN IF NOT EXISTS link_id TEXT,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS link_expiry TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'razorpay', -- 'razorpay' or 'cash'
  ADD COLUMN IF NOT EXISTS cash_received BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
