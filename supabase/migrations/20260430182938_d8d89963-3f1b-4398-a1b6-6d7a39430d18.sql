-- Drop old shared settings
DROP FUNCTION IF EXISTS public.verify_override_code(text);
DROP TABLE IF EXISTS public.admin_settings;

-- Per-admin personal override codes
CREATE TABLE public.admin_codes (
  user_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;

-- Admins can view their own code; admins can also see who has codes (not the code value enforced via column-level not needed since they're all admins)
CREATE POLICY "admins read own code" ON public.admin_codes
FOR SELECT USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins upsert own code" ON public.admin_codes
FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update own code" ON public.admin_codes
FOR UPDATE USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

-- Usage log
CREATE TABLE public.override_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  member_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.override_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read override uses" ON public.override_uses
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Verify a code -> returns admin user_id (or null), and logs the use
CREATE OR REPLACE FUNCTION public.verify_admin_code(_code text, _member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  SELECT user_id INTO uid FROM public.admin_codes WHERE code = _code LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.override_uses (admin_user_id, member_id) VALUES (uid, _member_id);
  END IF;
  RETURN uid;
END;
$$;

-- Seed Tally's personal code = 6789
INSERT INTO public.admin_codes (user_id, code)
SELECT id, '6789' FROM auth.users WHERE email = 'tally@oldvineswinebar.com'
ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, updated_at = now();