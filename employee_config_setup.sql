-- Create overriding configurations table for per-employee locations and timings
CREATE TABLE IF NOT EXISTS employee_office_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE UNIQUE NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION DEFAULT 100.0 NOT NULL,
    start_time TIME DEFAULT '09:00:00'::time NOT NULL,
    end_time TIME DEFAULT '18:00:00'::time NOT NULL,
    grace_period_minutes INTEGER DEFAULT 15 NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE employee_office_config ENABLE ROW LEVEL SECURITY;

-- Policies for RLS
CREATE POLICY "Employee configs readable by authenticated users"
    ON employee_office_config FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Employee configs editable only by Admins"
    ON employee_office_config FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());
