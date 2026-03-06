-- First clean up duplicate sessions (keep only the latest per phone)
DELETE FROM public.whatsapp_sessions a
USING public.whatsapp_sessions b
WHERE a.phone_number = b.phone_number
  AND a.created_at < b.created_at;

-- Add unique constraint on phone_number
ALTER TABLE public.whatsapp_sessions
ADD CONSTRAINT whatsapp_sessions_phone_number_key UNIQUE (phone_number);