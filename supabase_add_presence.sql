-- ============================================================
-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- Adds last_seen and is_online columns for presence tracking
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;

-- Update existing profiles
UPDATE public.profiles SET last_seen = NOW(), is_online = FALSE WHERE last_seen IS NULL;
