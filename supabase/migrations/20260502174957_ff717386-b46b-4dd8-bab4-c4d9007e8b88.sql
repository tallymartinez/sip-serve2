-- Junction: manager <-> venue assignments
CREATE TABLE IF NOT EXISTS public.manager_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE public.manager_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin all manager_venues"
  ON public.manager_venues FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "manager reads own assignments"
  ON public.manager_venues FOR SELECT
  USING (auth.uid() = user_id);

-- Helper: is this user a manager assigned to this venue?
CREATE OR REPLACE FUNCTION public.is_venue_manager(_user_id uuid, _venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_venues
    WHERE user_id = _user_id AND venue_id = _venue_id
  )
$$;

-- Helper: list of venue IDs assigned to a manager
CREATE OR REPLACE FUNCTION public.manager_venue_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT venue_id FROM public.manager_venues WHERE user_id = _user_id
$$;

-- RLS: managers read their assigned venues
CREATE POLICY "managers read assigned venues"
  ON public.venues FOR SELECT
  USING (public.is_venue_manager(auth.uid(), id));

-- RLS: managers read redemptions at assigned venues
CREATE POLICY "managers read assigned venue redemptions"
  ON public.redemptions FOR SELECT
  USING (
    venue_id IS NOT NULL
    AND public.is_venue_manager(auth.uid(), venue_id)
  );

-- RLS: managers read profiles of members who redeemed at their assigned venues
CREATE POLICY "managers read profiles of venue members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.user_id = profiles.id
        AND r.venue_id IS NOT NULL
        AND public.is_venue_manager(auth.uid(), r.venue_id)
    )
  );

-- RLS: managers read employees at their venues (for log labels)
CREATE POLICY "managers read employees at assigned venues"
  ON public.employees FOR SELECT
  USING (
    venue_id IS NOT NULL
    AND public.is_venue_manager(auth.uid(), venue_id)
  );
