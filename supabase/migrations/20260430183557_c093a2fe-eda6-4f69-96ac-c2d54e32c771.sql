CREATE TABLE public.venue_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  venue_pin text NOT NULL DEFAULT '2580',
  daily_drink_limit integer NOT NULL DEFAULT 2 CHECK (daily_drink_limit > 0 AND daily_drink_limit <= 20),
  venue_name text NOT NULL DEFAULT 'Old Vines Wine Bar',
  venue_address text,
  venue_phone text,
  venue_email text,
  redemptions_paused boolean NOT NULL DEFAULT false,
  paused_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.venue_settings (id) VALUES (true);

ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read venue info (needed by the redeem terminal & member dashboard)
CREATE POLICY "anyone read venue settings" ON public.venue_settings
FOR SELECT USING (true);

CREATE POLICY "admins update venue settings" ON public.venue_settings
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update drinks_remaining to use configurable limit
CREATE OR REPLACE FUNCTION public.drinks_remaining_today(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, (SELECT daily_drink_limit FROM public.venue_settings WHERE id = true) - COALESCE((
    SELECT SUM(drinks_redeemed)::int FROM public.redemptions
    WHERE user_id = _user_id AND redeemed_date = (now() AT TIME ZONE 'UTC')::date
  ), 0))
$$;