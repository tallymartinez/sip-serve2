CREATE TABLE IF NOT EXISTS public.comp_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.comp_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin all comp_memberships"
  ON public.comp_memberships FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "users read own comp"
  ON public.comp_memberships FOR SELECT
  USING (auth.uid() = user_id);
