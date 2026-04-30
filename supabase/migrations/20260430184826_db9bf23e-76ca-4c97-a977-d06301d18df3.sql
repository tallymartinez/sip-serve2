
-- =========================================
-- 1. COMPANIES
-- =========================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  daily_drink_limit int NOT NULL DEFAULT 2 CHECK (daily_drink_limit BETWEEN 1 AND 20),
  redemptions_paused boolean NOT NULL DEFAULT false,
  paused_message text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_companies_updated
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 2. VENUES
-- =========================================
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  email text,
  venue_pin text NOT NULL DEFAULT '2580',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venues_company ON public.venues(company_id);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_venues_updated
BEFORE UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 3. SEED OLD VINES GROUP + 2 VENUES (using existing settings)
-- =========================================
DO $$
DECLARE
  v_company uuid;
  v_old_vines uuid;
  v_supper uuid;
  v_settings record;
BEGIN
  SELECT * INTO v_settings FROM public.venue_settings WHERE id = true LIMIT 1;

  INSERT INTO public.companies (name, daily_drink_limit, redemptions_paused, paused_message)
  VALUES (
    'Old Vines Group',
    COALESCE(v_settings.daily_drink_limit, 2),
    COALESCE(v_settings.redemptions_paused, false),
    v_settings.paused_message
  )
  RETURNING id INTO v_company;

  INSERT INTO public.venues (company_id, name, address, phone, email, venue_pin)
  VALUES (
    v_company,
    COALESCE(v_settings.venue_name, 'Old Vines Wine Bar'),
    v_settings.venue_address,
    v_settings.venue_phone,
    v_settings.venue_email,
    COALESCE(v_settings.venue_pin, '2580')
  )
  RETURNING id INTO v_old_vines;

  INSERT INTO public.venues (company_id, name, venue_pin)
  VALUES (v_company, 'The Supper Club', COALESCE(v_settings.venue_pin, '2580'))
  RETURNING id INTO v_supper;

  -- stash for downstream steps
  PERFORM set_config('app.seed_company_id', v_company::text, true);
  PERFORM set_config('app.seed_old_vines_venue_id', v_old_vines::text, true);
END $$;

-- =========================================
-- 4. ADD company_id TO EXISTING TABLES
-- =========================================
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;
ALTER TABLE public.redemptions ADD COLUMN venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_company ON public.profiles(company_id);
CREATE INDEX idx_user_roles_company ON public.user_roles(company_id);
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_employees_venue ON public.employees(venue_id);
CREATE INDEX idx_redemptions_venue ON public.redemptions(venue_id);

-- =========================================
-- 5. BACKFILL existing rows to Old Vines Group / Old Vines Wine Bar
-- =========================================
DO $$
DECLARE
  v_company uuid;
  v_old_vines uuid;
BEGIN
  SELECT id INTO v_company FROM public.companies WHERE name = 'Old Vines Group' LIMIT 1;
  SELECT id INTO v_old_vines FROM public.venues WHERE name = (
    SELECT COALESCE(venue_name, 'Old Vines Wine Bar') FROM public.venue_settings WHERE id = true
  ) AND company_id = v_company LIMIT 1;

  IF v_old_vines IS NULL THEN
    SELECT id INTO v_old_vines FROM public.venues WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  END IF;

  UPDATE public.profiles SET company_id = v_company WHERE company_id IS NULL;
  UPDATE public.user_roles SET company_id = v_company WHERE company_id IS NULL AND role IN ('admin','employee');
  UPDATE public.employees SET company_id = v_company, venue_id = v_old_vines WHERE company_id IS NULL;
  UPDATE public.redemptions SET venue_id = v_old_vines WHERE venue_id IS NULL;
END $$;

-- =========================================
-- 6. PROMOTE tally@oldvineswinebar.com TO super_admin
-- =========================================
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'tally@oldvineswinebar.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (v_uid, 'super_admin', NULL)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- =========================================
-- 7. HELPER FUNCTIONS (security definer)
-- =========================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id
  UNION ALL
  SELECT company_id FROM public.user_roles WHERE user_id = _user_id AND company_id IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id uuid, _role app_role, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (company_id = _company_id OR role = 'super_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.user_company_id(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_company(uuid, app_role, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_company(uuid, app_role, uuid) TO authenticated;

-- =========================================
-- 8. UPDATE drinks_remaining_today to use company limit
-- =========================================
CREATE OR REPLACE FUNCTION public.drinks_remaining_today(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cfg AS (
    SELECT COALESCE(c.daily_drink_limit, 2) AS lim
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = _user_id
  )
  SELECT GREATEST(0, (SELECT lim FROM cfg) - COALESCE((
    SELECT SUM(drinks_redeemed)::int FROM public.redemptions
    WHERE user_id = _user_id AND redeemed_date = (now() AT TIME ZONE 'UTC')::date
  ), 0))
$$;

-- =========================================
-- 9. RLS POLICIES
-- =========================================

-- companies
CREATE POLICY "super admin all companies" ON public.companies
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin reads own company" ON public.companies
  FOR SELECT USING (id = public.user_company_id(auth.uid()));

CREATE POLICY "admin updates own company" ON public.companies
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') AND id = public.user_company_id(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') AND id = public.user_company_id(auth.uid())
  );

CREATE POLICY "members read own company" ON public.companies
  FOR SELECT USING (id = public.user_company_id(auth.uid()));

-- venues
CREATE POLICY "super admin all venues" ON public.venues
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin manages venues in own company" ON public.venues
  FOR ALL USING (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  );

CREATE POLICY "anyone read active venues" ON public.venues
  FOR SELECT USING (active = true);

-- =========================================
-- 10. UPDATE EXISTING POLICIES TO BE COMPANY-SCOPED
-- =========================================

-- profiles: super admin sees all, admin sees own company, staff sees own company
DROP POLICY IF EXISTS "staff read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;

CREATE POLICY "super admin all profiles" ON public.profiles
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "staff read company profiles" ON public.profiles
  FOR SELECT USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
    AND company_id = public.user_company_id(auth.uid())
  );

CREATE POLICY "admin update company profiles" ON public.profiles
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  );

-- employees
DROP POLICY IF EXISTS "admins manage employees" ON public.employees;
DROP POLICY IF EXISTS "staff read employees" ON public.employees;

CREATE POLICY "super admin all employees" ON public.employees
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin manages company employees" ON public.employees
  FOR ALL USING (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') AND company_id = public.user_company_id(auth.uid())
  );

CREATE POLICY "staff read company employees" ON public.employees
  FOR SELECT USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
    AND company_id = public.user_company_id(auth.uid())
  );

-- redemptions
DROP POLICY IF EXISTS "staff read all redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "staff insert redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "admins delete redemptions" ON public.redemptions;

CREATE POLICY "super admin all redemptions" ON public.redemptions
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "staff read company redemptions" ON public.redemptions
  FOR SELECT USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
    AND EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = redemptions.venue_id
        AND v.company_id = public.user_company_id(auth.uid())
    )
  );

CREATE POLICY "staff insert company redemptions" ON public.redemptions
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
    AND EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_id
        AND v.company_id = public.user_company_id(auth.uid())
    )
  );

CREATE POLICY "admin delete company redemptions" ON public.redemptions
  FOR DELETE USING (
    has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = redemptions.venue_id
        AND v.company_id = public.user_company_id(auth.uid())
    )
  );

-- user_roles: super admin can assign any; admin can manage roles within own company (except super_admin)
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;

CREATE POLICY "super admin all roles" ON public.user_roles
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin manage company roles" ON public.user_roles
  FOR ALL USING (
    has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND company_id = public.user_company_id(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND company_id = public.user_company_id(auth.uid())
  );

-- =========================================
-- 11. DROP OLD venue_settings (replaced by companies + venues)
-- =========================================
DROP TABLE IF EXISTS public.venue_settings CASCADE;
