
-- Referral codes catalog
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  company_id UUID,
  assigned_to_user_id UUID,
  assigned_to_name TEXT,
  notes TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed','percent')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referral_codes_code_lower_idx ON public.referral_codes (lower(code));

-- Track every redemption (one row per signup that used a code)
CREATE TABLE public.referral_code_uses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id) -- a member can only use one code on signup
);
CREATE INDEX referral_code_uses_code_idx ON public.referral_code_uses(referral_code_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_code_uses ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger
CREATE TRIGGER set_referral_codes_updated_at
BEFORE UPDATE ON public.referral_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: super admin full
CREATE POLICY "super admin all referral codes" ON public.referral_codes FOR ALL
USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "super admin all referral uses" ON public.referral_code_uses FOR ALL
USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- RLS: company admins manage their company's codes (or codes with no company)
CREATE POLICY "admin manage company referral codes" ON public.referral_codes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND (company_id IS NULL OR company_id = user_company_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (company_id IS NULL OR company_id = user_company_id(auth.uid())));

-- RLS: admins read uses for codes in their scope
CREATE POLICY "admin read referral uses" ON public.referral_code_uses FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
  SELECT 1 FROM public.referral_codes rc
  WHERE rc.id = referral_code_uses.referral_code_id
    AND (rc.company_id IS NULL OR rc.company_id = user_company_id(auth.uid()))
));

-- Public lookup helper: validates a code and returns its info if usable
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code TEXT)
RETURNS TABLE(id UUID, code TEXT, discount_type TEXT, discount_value INTEGER, assigned_to_name TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rc.id, rc.code, rc.discount_type, rc.discount_value, rc.assigned_to_name
  FROM public.referral_codes rc
  WHERE lower(rc.code) = lower(_code)
    AND rc.active = true
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
    AND (rc.max_uses IS NULL OR (
      SELECT COUNT(*) FROM public.referral_code_uses u WHERE u.referral_code_id = rc.id
    ) < rc.max_uses)
  LIMIT 1
$$;

-- Redeem: callable by an authenticated user during signup, ties them to the code
CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_max INTEGER;
  v_used INTEGER;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT rc.id, rc.max_uses INTO v_id, v_max
  FROM public.referral_codes rc
  WHERE lower(rc.code) = lower(_code)
    AND rc.active = true
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
  LIMIT 1;

  IF v_id IS NULL THEN RAISE EXCEPTION 'invalid or expired code'; END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used FROM public.referral_code_uses WHERE referral_code_id = v_id;
    IF v_used >= v_max THEN RAISE EXCEPTION 'code usage limit reached'; END IF;
  END IF;

  INSERT INTO public.referral_code_uses (referral_code_id, user_id)
  VALUES (v_id, v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_id;
END;
$$;
