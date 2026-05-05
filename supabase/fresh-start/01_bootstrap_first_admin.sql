-- Fresh bootstrap for a brand-new project.
-- Replace the values in the DECLARE section, then run after:
-- 1. 00_fresh_schema.sql
-- 2. signing up your first real user in the app

DO $$
DECLARE
  v_email text := 'foundbuddy101@gmail.com';
  v_company_name text := 'O.V. Cocktail Club';
  v_venue_name text := 'Main Lounge';
  v_admin_code text := '6789';
  v_user_id uuid;
  v_full_name text;
  v_phone text;
  v_company_id uuid;
  v_venue_id uuid;
BEGIN
  SELECT
    id,
    COALESCE(raw_user_meta_data->>'full_name', ''),
    raw_user_meta_data->>'phone'
  INTO v_user_id, v_full_name, v_phone
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for %', v_email;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (v_user_id, lower(v_email), COALESCE(v_full_name, ''), v_phone)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

  INSERT INTO public.user_roles (user_id, role)
  SELECT v_user_id, 'super_admin'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role = 'super_admin'
      AND company_id IS NULL
      AND venue_id IS NULL
  );

  INSERT INTO public.companies (name, daily_drink_limit, active, owner_user_id)
  SELECT v_company_name, 2, true, v_user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.companies
    WHERE name = v_company_name
  );

  SELECT id
  INTO v_company_id
  FROM public.companies
  WHERE name = v_company_name
  ORDER BY created_at
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company bootstrap failed for %', v_company_name;
  END IF;

  UPDATE public.companies
  SET owner_user_id = v_user_id
  WHERE id = v_company_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  SELECT v_user_id, 'admin', v_company_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role = 'admin'
      AND company_id = v_company_id
      AND venue_id IS NULL
  );

  UPDATE public.profiles
  SET company_id = v_company_id
  WHERE id = v_user_id;

  INSERT INTO public.venues (company_id, name, venue_pin, active)
  SELECT v_company_id, v_venue_name, '2580', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.venues
    WHERE company_id = v_company_id
      AND name = v_venue_name
  );

  SELECT id
  INTO v_venue_id
  FROM public.venues
  WHERE company_id = v_company_id
    AND name = v_venue_name
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.admin_codes (user_id, code)
  VALUES (v_user_id, v_admin_code)
  ON CONFLICT (user_id) DO UPDATE
  SET code = EXCLUDED.code,
      updated_at = now();

  INSERT INTO public.drink_cards (company_id, name, description, category, price_label, status, sort_order)
  SELECT v_company_id, x.name, x.description, x.category, x.price_label, x.status::public.drink_card_status, x.sort_order
  FROM (
    VALUES
      ('First Class', 'evan williams bourbon, aperol, amaro nonino, peach, mint, prosecco, lemon', 'Bright & Bubbly', '$18', 'included', 1),
      ('Snake in the Grass', 'palomo mezcal, reposado tequila, green pepper cordial, boomsma, lime', 'Playful & Confident', '$18', 'included', 2),
      ('Green Goose', 'gin, elderflower, citrus, sparkling wine', 'Bright & Bubbly', '$18', 'not_included', 3)
  ) AS x(name, description, category, price_label, status, sort_order)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.drink_cards dc
    WHERE dc.company_id = v_company_id
      AND dc.name = x.name
  );

  RAISE NOTICE 'Bootstrap complete for %, company %, venue %', v_email, v_company_name, v_venue_name;
END $$;
