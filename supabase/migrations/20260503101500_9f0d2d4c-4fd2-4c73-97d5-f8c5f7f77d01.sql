-- Foundation migration for the new org/location role model.
-- This is intentionally compatibility-friendly:
-- - keeps existing tables in place
-- - adds new columns/tables/helpers
-- - allows app code to migrate in slices

-- 1. Extend roles for the new server terminology.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role'
      AND e.enumlabel = 'server'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'server';
  END IF;
END $$;

-- 2. Companies gain an owner so "owner == admin" can be enforced at the company layer.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_owner_user_id
  ON public.companies(owner_user_id);

-- Backfill owner_user_id from the first admin role in the company when possible.
WITH first_admin AS (
  SELECT DISTINCT ON (ur.company_id)
    ur.company_id,
    ur.user_id
  FROM public.user_roles ur
  WHERE ur.company_id IS NOT NULL
    AND ur.role = 'admin'
  ORDER BY ur.company_id, ur.created_at, ur.user_id
)
UPDATE public.companies c
SET owner_user_id = fa.user_id
FROM first_admin fa
WHERE c.id = fa.company_id
  AND c.owner_user_id IS NULL;

-- 3. Expand user_roles so it can absorb server and manager venue assignments.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS server_code text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

CREATE INDEX IF NOT EXISTS idx_user_roles_venue_id
  ON public.user_roles(venue_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_company_role
  ON public.user_roles(company_id, role);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles(user_id, role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_assignment
  ON public.user_roles(user_id, role, company_id, venue_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_server_code_per_venue
  ON public.user_roles(venue_id, server_code)
  WHERE server_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_server_code_format_check'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_server_code_format_check
      CHECK (server_code IS NULL OR server_code ~ '^[0-9]{4}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_user_roles_updated'
  ) THEN
    CREATE TRIGGER trg_user_roles_updated
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. Seed server role rows from employees when the employee is tied to an auth user.
INSERT INTO public.user_roles (user_id, role, company_id, venue_id, server_code, active, created_at, updated_at)
SELECT
  e.user_id,
  'server',
  COALESCE(e.company_id, v.company_id),
  e.venue_id,
  CASE WHEN e.employee_code ~ '^[0-9]{4}$' THEN e.employee_code ELSE NULL END,
  e.active,
  e.created_at,
  now()
FROM public.employees e
LEFT JOIN public.venues v ON v.id = e.venue_id
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = e.user_id
      AND ur.role = 'server'
      AND ur.venue_id IS NOT DISTINCT FROM e.venue_id
  );

-- 5. Seed manager role rows from manager_venues.
INSERT INTO public.user_roles (user_id, role, company_id, venue_id, active, created_at, updated_at)
SELECT
  mv.user_id,
  'manager',
  v.company_id,
  mv.venue_id,
  true,
  mv.created_at,
  now()
FROM public.manager_venues mv
JOIN public.venues v ON v.id = mv.venue_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = mv.user_id
    AND ur.role = 'manager'
    AND ur.venue_id = mv.venue_id
);

-- 6. Add structured drink cards.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'drink_card_status'
  ) THEN
    CREATE TYPE public.drink_card_status AS ENUM ('included', 'not_included', 'inactive');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.drink_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Cocktails',
  price_label text,
  status public.drink_card_status NOT NULL DEFAULT 'included',
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drink_cards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_drink_cards_company_id
  ON public.drink_cards(company_id);

CREATE INDEX IF NOT EXISTS idx_drink_cards_company_sort
  ON public.drink_cards(company_id, category, sort_order, name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_drink_cards_updated'
  ) THEN
    CREATE TRIGGER trg_drink_cards_updated
    BEFORE UPDATE ON public.drink_cards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DROP POLICY IF EXISTS "super admin all drink_cards" ON public.drink_cards;
CREATE POLICY "super admin all drink_cards"
  ON public.drink_cards FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read visible drink_cards" ON public.drink_cards;
CREATE POLICY "authenticated read visible drink_cards"
  ON public.drink_cards FOR SELECT
  USING (auth.role() = 'authenticated' AND status <> 'inactive');

DROP POLICY IF EXISTS "admin manage company drink_cards" ON public.drink_cards;
CREATE POLICY "admin manage company drink_cards"
  ON public.drink_cards FOR ALL
  USING (public.has_role_in_company(auth.uid(), 'admin', company_id))
  WITH CHECK (public.has_role_in_company(auth.uid(), 'admin', company_id));

-- 7. Expand redemptions for the future selected-drink flow.
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS user_role_id uuid REFERENCES public.user_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drink_name text;

CREATE INDEX IF NOT EXISTS idx_redemptions_user_role_id
  ON public.redemptions(user_role_id);

-- Backfill user_role_id where a server role can be matched to the legacy employee row.
UPDATE public.redemptions r
SET user_role_id = ur.id
FROM public.employees e
JOIN public.user_roles ur
  ON ur.user_id = e.user_id
 AND ur.role = 'server'
 AND (ur.venue_id IS NULL OR ur.venue_id IS NOT DISTINCT FROM r.venue_id)
WHERE r.employee_id = e.id
  AND r.user_role_id IS NULL;

-- 8. New company-aware drink limit helper for the future dashboard and redeem flow.
CREATE OR REPLACE FUNCTION public.drinks_remaining_today(_user_id uuid, _company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.drinks_remaining_today(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.drinks_remaining_today(uuid, uuid) TO authenticated;

-- 9. Effective company admin helper: owner, admin row, or super admin.
CREATE OR REPLACE FUNCTION public.is_effective_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = _company_id
      AND c.owner_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
      AND ur.company_id = _company_id
  )
  OR public.is_super_admin(_user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.is_effective_company_admin(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_effective_company_admin(uuid, uuid) TO authenticated;
