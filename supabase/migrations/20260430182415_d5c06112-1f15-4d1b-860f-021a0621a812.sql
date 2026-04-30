-- Promote master admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'tally@oldvineswinebar.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Allow admins to delete redemptions (undo)
CREATE POLICY "admins delete redemptions"
ON public.redemptions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to remove roles (demote) and already can manage via existing policy
-- Existing "admins manage roles" ALL policy covers INSERT/DELETE/UPDATE, good.

-- Admin settings (single row) for override / troubleshooting code
CREATE TABLE public.admin_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  override_code text NOT NULL DEFAULT '9999',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.admin_settings (id) VALUES (true);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read settings" ON public.admin_settings
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update settings" ON public.admin_settings
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to verify override code (callable by anyone, returns boolean)
CREATE OR REPLACE FUNCTION public.verify_override_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_settings WHERE override_code = _code AND id = true)
$$;

-- Function to look up user by email for admin promotion (admin-only)
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO uid FROM auth.users WHERE email = lower(_email) LIMIT 1;
  RETURN uid;
END;
$$;