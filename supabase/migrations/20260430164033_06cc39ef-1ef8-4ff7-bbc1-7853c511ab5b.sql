
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_number int,
  ADD COLUMN IF NOT EXISTS subscription_price_cents int;

-- Backfill signup_number by creation order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM public.profiles
)
UPDATE public.profiles p SET signup_number = ordered.rn
FROM ordered WHERE ordered.id = p.id AND p.signup_number IS NULL;

-- Sequence-style: assign next signup_number on insert
CREATE OR REPLACE FUNCTION public.assign_signup_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.signup_number IS NULL THEN
    SELECT COALESCE(MAX(signup_number), 0) + 1 INTO NEW.signup_number FROM public.profiles;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_assign_signup_number ON public.profiles;
CREATE TRIGGER profiles_assign_signup_number
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_signup_number();

-- Tier price helper (price for a given signup number)
CREATE OR REPLACE FUNCTION public.tier_price_for_signup(_n int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _n <= 100 THEN 8000
    WHEN _n <= 200 THEN 9000
    ELSE 10000
  END
$$;

-- Public view of the current tier (for the next signup) — readable by anyone
CREATE OR REPLACE FUNCTION public.current_tier_info()
RETURNS TABLE(total_members int, next_signup_number int, price_cents int, spots_left_in_tier int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT COUNT(*)::int AS total FROM public.profiles)
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

GRANT EXECUTE ON FUNCTION public.current_tier_info() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_price_for_signup(int) TO anon, authenticated;
