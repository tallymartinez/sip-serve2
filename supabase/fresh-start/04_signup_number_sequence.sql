-- Upgrade existing projects from MAX(signup_number)+1 to a real sequence.
-- This avoids duplicate signup numbers when users join at nearly the same time.

CREATE SEQUENCE IF NOT EXISTS public.signup_number_seq;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_signup_number_unique
  ON public.profiles(signup_number)
  WHERE signup_number IS NOT NULL;
