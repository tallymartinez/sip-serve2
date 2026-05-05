-- Fresh Supabase baseline for this app.
-- Use this for brand-new projects instead of replaying the old migration history.
--
-- What it does:
-- - creates the current app schema
-- - creates the storage bucket and policies the app expects
-- - creates the auth/signup triggers and helper functions
-- - keeps a few legacy compatibility tables/fields that the current code still reads
--
-- What it does not do:
-- - create your first company/admin automatically
-- - seed old project-specific emails, image URLs, or override codes
--
-- Run this first on a fresh Supabase project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- Enums
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin',
      'employee',
      'member',
      'super_admin',
      'manager',
      'server'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'drink_card_status'
  ) THEN
    CREATE TYPE public.drink_card_status AS ENUM (
      'included',
      'not_included',
      'inactive'
    );
  END IF;
END $$;

-- =========================================================
-- Shared helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;

-- =========================================================
-- Core tables
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  company_id uuid,
  venue_id uuid,
  server_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  phone text,
  signup_number int,
  subscription_price_cents int,
  subscription_status text NOT NULL DEFAULT 'inactive',
  subscription_started_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  daily_drink_limit int NOT NULL DEFAULT 2 CHECK (daily_drink_limit BETWEEN 1 AND 20),
  redemptions_paused boolean NOT NULL DEFAULT false,
  paused_message text,
  active boolean NOT NULL DEFAULT true,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  email text,
  venue_pin text NOT NULL DEFAULT '2580',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid,
  venue_id uuid,
  full_name text NOT NULL,
  employee_code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  user_role_id uuid,
  venue_id uuid,
  drink_name text,
  drinks_redeemed integer NOT NULL CHECK (drinks_redeemed > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.override_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  company_id uuid,
  assigned_to_user_id uuid,
  assigned_to_name text,
  notes text,
  discount_type text CHECK (discount_type IN ('fixed', 'percent')),
  discount_value integer CHECK (discount_value > 0),
  max_uses integer,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_code_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL,
  user_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.home_content (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.comp_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE IF NOT EXISTS public.drink_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  image_url text,
  category text NOT NULL DEFAULT 'Cocktails',
  price_label text,
  status public.drink_card_status NOT NULL DEFAULT 'included',
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.signup_number_seq;

-- =========================================================
-- Foreign keys added after all tables exist
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_company_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_owner_user_id_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venues_company_id_fkey'
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_company_id_fkey'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_venue_id_fkey'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'redemptions_venue_id_fkey'
  ) THEN
    ALTER TABLE public.redemptions
      ADD CONSTRAINT redemptions_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'redemptions_user_role_id_fkey'
  ) THEN
    ALTER TABLE public.redemptions
      ADD CONSTRAINT redemptions_user_role_id_fkey
      FOREIGN KEY (user_role_id) REFERENCES public.user_roles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_company_id_fkey'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_venue_id_fkey'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_codes_company_id_fkey'
  ) THEN
    ALTER TABLE public.referral_codes
      ADD CONSTRAINT referral_codes_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_code_uses_referral_code_id_fkey'
  ) THEN
    ALTER TABLE public.referral_code_uses
      ADD CONSTRAINT referral_code_uses_referral_code_id_fkey
      FOREIGN KEY (referral_code_id) REFERENCES public.referral_codes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drink_cards_company_id_fkey'
  ) THEN
    ALTER TABLE public.drink_cards
      ADD CONSTRAINT drink_cards_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =========================================================
-- Constraints and indexes
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_server_code_format_check'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_server_code_format_check
      CHECK (server_code IS NULL OR server_code ~ '^[0-9]{4}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_scope_check'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_scope_check
      CHECK (
        (role = 'super_admin' AND company_id IS NULL AND venue_id IS NULL AND server_code IS NULL) OR
        (role = 'member' AND venue_id IS NULL AND server_code IS NULL) OR
        (role = 'admin' AND company_id IS NOT NULL AND venue_id IS NULL AND server_code IS NULL) OR
        (role = 'employee' AND company_id IS NOT NULL AND venue_id IS NULL AND server_code IS NULL) OR
        (role = 'manager' AND company_id IS NOT NULL AND venue_id IS NOT NULL AND server_code IS NULL) OR
        (role = 'server' AND company_id IS NOT NULL AND venue_id IS NOT NULL AND server_code IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_signup_number_unique
  ON public.profiles(signup_number)
  WHERE signup_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_company_role ON public.user_roles(company_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_venue_id ON public.user_roles(venue_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner_user_id ON public.companies(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_venues_company ON public.venues(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_venue ON public.employees(venue_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user_date ON public.redemptions(user_id, redeemed_date);
CREATE INDEX IF NOT EXISTS idx_redemptions_date ON public.redemptions(redeemed_date);
CREATE INDEX IF NOT EXISTS idx_redemptions_venue ON public.redemptions(venue_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user_role_id ON public.redemptions(user_role_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_lower_idx ON public.referral_codes(lower(code));
CREATE INDEX IF NOT EXISTS referral_code_uses_code_idx ON public.referral_code_uses(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_drink_cards_company_id ON public.drink_cards(company_id);
CREATE INDEX IF NOT EXISTS idx_drink_cards_company_sort ON public.drink_cards(company_id, category, sort_order, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_global_unique
  ON public.user_roles(user_id, role)
  WHERE company_id IS NULL AND venue_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_company_unique
  ON public.user_roles(user_id, role, company_id)
  WHERE company_id IS NOT NULL AND venue_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_venue_unique
  ON public.user_roles(user_id, role, venue_id)
  WHERE venue_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_server_code_per_venue
  ON public.user_roles(venue_id, server_code)
  WHERE server_code IS NOT NULL;

-- =========================================================
-- Triggers
-- =========================================================
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_companies_updated ON public.companies;
CREATE TRIGGER trg_companies_updated
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_venues_updated ON public.venues;
CREATE TRIGGER trg_venues_updated
BEFORE UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_roles_updated ON public.user_roles;
CREATE TRIGGER trg_user_roles_updated
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER set_referral_codes_updated_at
BEFORE UPDATE ON public.referral_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS home_content_set_updated_at ON public.home_content;
CREATE TRIGGER home_content_set_updated_at
BEFORE UPDATE ON public.home_content
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_drink_cards_updated ON public.drink_cards;
CREATE TRIGGER trg_drink_cards_updated
BEFORE UPDATE ON public.drink_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Signup numbering
-- =========================================================
SELECT setval(
  'public.signup_number_seq',
  COALESCE((SELECT MAX(signup_number) FROM public.profiles), 0),
  true
);

CREATE OR REPLACE FUNCTION public.assign_signup_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.signup_number IS NULL THEN
    NEW.signup_number := nextval('public.signup_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_signup_number() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_assign_signup_number ON public.profiles;
CREATE TRIGGER profiles_assign_signup_number
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_signup_number();

-- =========================================================
-- Auth signup hook
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, 'member'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.id
      AND role = 'member'
      AND company_id IS NULL
      AND venue_id IS NULL
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND company_id IS NOT NULL
    AND active = true
  ORDER BY created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id uuid, _role public.app_role, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND company_id = _company_id
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_effective_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = _company_id
      AND owner_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND company_id = _company_id
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.tier_price_for_signup(_n int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _n <= 100 THEN 8000
    WHEN _n <= 200 THEN 9000
    ELSE 10000
  END
$$;

CREATE OR REPLACE FUNCTION public.current_tier_info()
RETURNS TABLE(total_members int, next_signup_number int, price_cents int, spots_left_in_tier int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT COUNT(*)::int AS total
    FROM public.profiles
  )
  SELECT
    t.total,
    t.total + 1,
    public.tier_price_for_signup(t.total + 1),
    CASE
      WHEN t.total + 1 <= 100 THEN 100 - t.total
      WHEN t.total + 1 <= 200 THEN 200 - t.total
      ELSE NULL
    END
  FROM t;
$$;

CREATE OR REPLACE FUNCTION public.drinks_remaining_today(_user_id uuid, _company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT COALESCE(c.daily_drink_limit, 2) AS lim
    FROM public.companies c
    WHERE c.id = _company_id
  ),
  consumed AS (
    SELECT COALESCE(SUM(r.drinks_redeemed), 0)::int AS used
    FROM public.redemptions r
    JOIN public.venues v ON v.id = r.venue_id
    WHERE r.user_id = _user_id
      AND v.company_id = _company_id
      AND r.redeemed_date = (now() AT TIME ZONE 'UTC')::date
  )
  SELECT GREATEST(0, COALESCE((SELECT lim FROM cfg), 2) - COALESCE((SELECT used FROM consumed), 0));
$$;

CREATE OR REPLACE FUNCTION public.drinks_remaining_today(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.drinks_remaining_today(_user_id, public.user_company_id(_user_id));
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'sandbox')
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active', 'trialing', 'past_due') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id
  INTO uid
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;

  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_code(_code text, _member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  SELECT user_id
  INTO uid
  FROM public.admin_codes
  WHERE code = _code
  LIMIT 1;

  IF uid IS NOT NULL THEN
    INSERT INTO public.override_uses (admin_user_id, member_id)
    VALUES (uid, _member_id);
  END IF;

  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS TABLE(id uuid, code text, discount_type text, discount_value integer, assigned_to_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rc.id, rc.code, rc.discount_type, rc.discount_value, rc.assigned_to_name
  FROM public.referral_codes rc
  WHERE lower(rc.code) = lower(_code)
    AND rc.active = true
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
    AND (
      rc.max_uses IS NULL OR (
        SELECT COUNT(*)
        FROM public.referral_code_uses u
        WHERE u.referral_code_id = rc.id
      ) < rc.max_uses
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_max integer;
  v_used integer;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT rc.id, rc.max_uses
  INTO v_id, v_max
  FROM public.referral_codes rc
  WHERE lower(rc.code) = lower(_code)
    AND rc.active = true
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid or expired code';
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_used
    FROM public.referral_code_uses
    WHERE referral_code_id = v_id;

    IF v_used >= v_max THEN
      RAISE EXCEPTION 'code usage limit reached';
    END IF;
  END IF;

  INSERT INTO public.referral_code_uses (referral_code_id, user_id)
  VALUES (v_id, v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.user_company_id(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_company(uuid, public.app_role, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_effective_company_admin(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.drinks_remaining_today(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.drinks_remaining_today(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_admin_code(text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_referral_code(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_company(uuid, public.app_role, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_effective_company_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drinks_remaining_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drinks_remaining_today(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tier_info() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_price_for_signup(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_code(text, uuid) TO authenticated;

-- =========================================================
-- RLS enablement
-- =========================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.override_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_code_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_cards ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Policies
-- =========================================================
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "super admin all roles" ON public.user_roles;
CREATE POLICY "super admin all roles"
  ON public.user_roles FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage company roles" ON public.user_roles;
CREATE POLICY "admin manage company roles"
  ON public.user_roles FOR ALL
  USING (
    role <> 'super_admin'
    AND company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    role <> 'super_admin'
    AND company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users update own profile basics" ON public.profiles;
CREATE POLICY "users update own profile basics"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "super admin all profiles" ON public.profiles;
CREATE POLICY "super admin all profiles"
  ON public.profiles FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "staff read company profiles" ON public.profiles;
CREATE POLICY "staff read company profiles"
  ON public.profiles FOR SELECT
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = profiles.company_id
        AND ur.role IN ('admin', 'manager', 'server', 'employee')
        AND ur.active = true
    )
  );

DROP POLICY IF EXISTS "admin update company profiles" ON public.profiles;
CREATE POLICY "admin update company profiles"
  ON public.profiles FOR UPDATE
  USING (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "public read active companies" ON public.companies;
CREATE POLICY "public read active companies"
  ON public.companies FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "super admin all companies" ON public.companies;
CREATE POLICY "super admin all companies"
  ON public.companies FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "owner or admin manage own company" ON public.companies;
CREATE POLICY "owner or admin manage own company"
  ON public.companies FOR ALL
  USING (public.is_effective_company_admin(auth.uid(), id))
  WITH CHECK (public.is_effective_company_admin(auth.uid(), id));

DROP POLICY IF EXISTS "public read active venues" ON public.venues;
CREATE POLICY "public read active venues"
  ON public.venues FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "super admin all venues" ON public.venues;
CREATE POLICY "super admin all venues"
  ON public.venues FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "owner or admin manage company venues" ON public.venues;
CREATE POLICY "owner or admin manage company venues"
  ON public.venues FOR ALL
  USING (public.is_effective_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_effective_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "super admin all employees" ON public.employees;
CREATE POLICY "super admin all employees"
  ON public.employees FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manages company employees" ON public.employees;
CREATE POLICY "admin manages company employees"
  ON public.employees FOR ALL
  USING (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "staff read company employees" ON public.employees;
CREATE POLICY "staff read company employees"
  ON public.employees FOR SELECT
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = employees.company_id
        AND ur.role IN ('admin', 'manager', 'server', 'employee')
        AND ur.active = true
    )
  );

DROP POLICY IF EXISTS "members read own redemptions" ON public.redemptions;
CREATE POLICY "members read own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "super admin all redemptions" ON public.redemptions;
CREATE POLICY "super admin all redemptions"
  ON public.redemptions FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "staff read company redemptions" ON public.redemptions;
CREATE POLICY "staff read company redemptions"
  ON public.redemptions FOR SELECT
  USING (
    venue_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.venues v
      JOIN public.user_roles ur
        ON ur.company_id = v.company_id
       AND ur.user_id = auth.uid()
       AND ur.active = true
      WHERE v.id = redemptions.venue_id
        AND ur.role IN ('admin', 'manager', 'server', 'employee')
    )
  );

DROP POLICY IF EXISTS "staff insert company redemptions" ON public.redemptions;
CREATE POLICY "staff insert company redemptions"
  ON public.redemptions FOR INSERT
  WITH CHECK (
    venue_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.venues v
      JOIN public.user_roles ur
        ON ur.company_id = v.company_id
       AND ur.user_id = auth.uid()
       AND ur.active = true
      WHERE v.id = redemptions.venue_id
        AND ur.role IN ('admin', 'manager', 'server', 'employee')
    )
  );

DROP POLICY IF EXISTS "admin delete company redemptions" ON public.redemptions;
CREATE POLICY "admin delete company redemptions"
  ON public.redemptions FOR DELETE
  USING (
    venue_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = redemptions.venue_id
        AND public.is_effective_company_admin(auth.uid(), v.company_id)
    )
  );

DROP POLICY IF EXISTS "users can view own subscription" ON public.subscriptions;
CREATE POLICY "users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "admins and super admins read own code" ON public.admin_codes;
CREATE POLICY "admins and super admins read own code"
  ON public.admin_codes FOR SELECT
  USING (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "admins and super admins upsert own code" ON public.admin_codes;
CREATE POLICY "admins and super admins upsert own code"
  ON public.admin_codes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "admins and super admins update own code" ON public.admin_codes;
CREATE POLICY "admins and super admins update own code"
  ON public.admin_codes FOR UPDATE
  USING (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "super admin read all override uses" ON public.override_uses;
CREATE POLICY "super admin read all override uses"
  ON public.override_uses FOR SELECT
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read override uses" ON public.override_uses;
CREATE POLICY "admins read override uses"
  ON public.override_uses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.user_roles admin_role
        ON admin_role.user_id = override_uses.admin_user_id
       AND admin_role.company_id = ur.company_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.active = true
    )
  );

DROP POLICY IF EXISTS "super admin all referral codes" ON public.referral_codes;
CREATE POLICY "super admin all referral codes"
  ON public.referral_codes FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage company referral codes" ON public.referral_codes;
CREATE POLICY "admin manage company referral codes"
  ON public.referral_codes FOR ALL
  USING (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND public.is_effective_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "super admin all referral uses" ON public.referral_code_uses;
CREATE POLICY "super admin all referral uses"
  ON public.referral_code_uses FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin read referral uses" ON public.referral_code_uses;
CREATE POLICY "admin read referral uses"
  ON public.referral_code_uses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.referral_codes rc
      WHERE rc.id = referral_code_uses.referral_code_id
        AND rc.company_id IS NOT NULL
        AND public.is_effective_company_admin(auth.uid(), rc.company_id)
    )
  );

DROP POLICY IF EXISTS "anyone read home content" ON public.home_content;
CREATE POLICY "anyone read home content"
  ON public.home_content FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "admins insert home content" ON public.home_content;
CREATE POLICY "admins insert home content"
  ON public.home_content FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update home content" ON public.home_content;
CREATE POLICY "admins update home content"
  ON public.home_content FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "super admin all comp_memberships" ON public.comp_memberships;
CREATE POLICY "super admin all comp_memberships"
  ON public.comp_memberships FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "users read own comp" ON public.comp_memberships;
CREATE POLICY "users read own comp"
  ON public.comp_memberships FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "public read visible drink_cards" ON public.drink_cards;
CREATE POLICY "public read visible drink_cards"
  ON public.drink_cards FOR SELECT
  USING (status <> 'inactive');

DROP POLICY IF EXISTS "super admin all drink_cards" ON public.drink_cards;
CREATE POLICY "super admin all drink_cards"
  ON public.drink_cards FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage company drink_cards" ON public.drink_cards;
CREATE POLICY "admin manage company drink_cards"
  ON public.drink_cards FOR ALL
  USING (public.is_effective_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_effective_company_admin(auth.uid(), company_id));

-- =========================================================
-- Default rows and storage
-- =========================================================
INSERT INTO public.home_content (id, data)
VALUES ('default', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('home-images', 'home-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anyone read home-images" ON storage.objects;
CREATE POLICY "anyone read home-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'home-images');

DROP POLICY IF EXISTS "admins upload home-images" ON storage.objects;
CREATE POLICY "admins upload home-images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'home-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "admins update home-images" ON storage.objects;
CREATE POLICY "admins update home-images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'home-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "admins delete home-images" ON storage.objects;
CREATE POLICY "admins delete home-images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'home-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  );

-- =========================================================
-- Realtime
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'redemptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.redemptions;
  END IF;
END $$;
