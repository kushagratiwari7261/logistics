-- Creates a secure RPC function to let users delete their own account completely
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid UUID;
BEGIN
  -- Get the ID of the user requesting deletion
  uid := auth.uid();
  
  -- Prevent unauthenticated calls
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Delete user's jobs
  DELETE FROM public.jobs WHERE user_id = uid;
  
  -- 2. Delete user's shipments
  DELETE FROM public.shipments WHERE user_id = uid;
  
  -- 3. Delete user's messages
  DELETE FROM public.messages WHERE sender_id = uid OR receiver_id = uid;

  -- 4. Delete user profile (and any user_settings will cascade if FK is set, or delete them explicitly)
  DELETE FROM public.user_settings WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;

  -- 5. Delete the user from Supabase Auth (this permanently removes their ability to log in)
  DELETE FROM auth.users WHERE id = uid;
  
END;
$$;
