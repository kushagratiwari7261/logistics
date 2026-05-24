-- Database setup script for Smart Attendance System
-- Enable the vector extension for 128-dimensional face encodings
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing tables/functions if they exist to prevent conflicts during setup
DROP FUNCTION IF EXISTS match_employee_face(vector(128), double precision, int);
DROP FUNCTION IF EXISTS is_super_admin();
DROP FUNCTION IF EXISTS is_admin();
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS office_config CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- 1. Create Employees Table
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('office', 'field')) NOT NULL,
    face_encoding vector(128), -- Stores the 128-dimensional face encoding vector
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create Admins Table
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_super_admin BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create Attendance Table
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role TEXT CHECK (role IN ('office', 'field')) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    inside_geofence BOOLEAN,
    face_matched BOOLEAN DEFAULT FALSE NOT NULL,
    direction_used TEXT NOT NULL,
    status TEXT CHECK (status IN ('Present', 'Late', 'Excused')) DEFAULT 'Present' NOT NULL,
    override_reason TEXT,
    marked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL
);

-- 4. Create Office Config Table
CREATE TABLE office_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Hardcoded to 1 to ensure a single configuration row
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION DEFAULT 100.0 NOT NULL,
    start_time TIME DEFAULT '09:00:00'::time NOT NULL,
    end_time TIME DEFAULT '18:00:00'::time NOT NULL,
    grace_period_minutes INTEGER DEFAULT 15 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Create Holidays Table
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    holiday_date DATE UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for pgvector cosine similarity search
CREATE INDEX IF NOT EXISTS employees_face_encoding_idx ON employees USING ivfflat (face_encoding vector_cosine_ops) WITH (lists = 100);

-- Insert Default Office Configuration (Noida Corporate Area)
INSERT INTO office_config (id, lat, lng, radius_meters, start_time, end_time, grace_period_minutes)
VALUES (1, 28.5355, 77.3910, 100.0, '09:00:00', '18:00:00', 15)
ON CONFLICT (id) DO NOTHING;

-- Insert Whitelisted Super Admins
INSERT INTO admins (email, name, is_super_admin) VALUES
('Vikas.singh@seal.co.in', 'Vikas Singh', TRUE),
('sushil.jaisingh@seal.co.in', 'Sushil Jaisingh', TRUE),
('kushagratiwari252@gmail.com', 'Kushagra Tiwari', TRUE)
ON CONFLICT (email) DO UPDATE SET is_super_admin = TRUE;

-- ----------------------------------------------------
-- Security Roles & Helper Functions
-- ----------------------------------------------------

-- Function to check if current authenticated user is an Admin
CREATE OR REPLACE FUNCTION is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins 
        WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current authenticated user is a Super Admin
CREATE OR REPLACE FUNCTION is_super_admin() 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins 
        WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email') 
          AND is_super_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------
-- Enable Row Level Security (RLS)
-- ----------------------------------------------------
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Employees Policies
CREATE POLICY "Employees are readable by authenticated users"
    ON employees FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Employees can only be updated/inserted by Admins"
    ON employees FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Attendance Policies
CREATE POLICY "Attendance logs readable by admins or matching employee"
    ON attendance FOR SELECT
    USING (
        is_admin() OR 
        employee_id IN (
            SELECT id FROM employees 
            WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "Attendance logs insertable by employee or admin"
    ON attendance FOR INSERT
    WITH CHECK (
        is_admin() OR
        auth.role() = 'authenticated'
    );

CREATE POLICY "Attendance logs modifiable only by admins"
    ON attendance FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins Policies
CREATE POLICY "Admins read access to authenticated users"
    ON admins FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins write access only to Super Admins"
    ON admins FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- Office Config Policies
CREATE POLICY "Office config is readable by authenticated users"
    ON office_config FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Office config editable only by Super Admins"
    ON office_config FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- Holidays Policies
CREATE POLICY "Holidays are readable by authenticated users"
    ON holidays FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Holidays editable only by Super Admins"
    ON holidays FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- ----------------------------------------------------
-- pgvector Face Recognition RPC Function
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION match_employee_face(
    embedding vector(128),
    match_threshold double precision,
    match_count int
)
RETURNS TABLE (
    id uuid,
    name text,
    email text,
    role text,
    distance double precision
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        employees.id,
        employees.name,
        employees.email,
        employees.role,
        (employees.face_encoding <=> embedding) AS distance
    FROM employees
    WHERE employees.is_active = true
      AND (employees.face_encoding <=> embedding) < match_threshold
    ORDER BY employees.face_encoding <=> embedding ASC
    LIMIT match_count;
END;
$$;
