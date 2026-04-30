ALTER TABLE public.referral_codes ALTER COLUMN discount_type DROP NOT NULL;
ALTER TABLE public.referral_codes ALTER COLUMN discount_value DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
 RETURNS TABLE(id uuid, code text, discount_type text, discount_value integer, assigned_to_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rc.id, rc.code, rc.discount_type, rc.discount_value, rc.assigned_to_name
  FROM public.referral_codes rc
  WHERE lower(rc.code) = lower(_code)
    AND rc.active = true
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
    AND (rc.max_uses IS NULL OR (
      SELECT COUNT(*) FROM public.referral_code_uses u WHERE u.referral_code_id = rc.id
    ) < rc.max_uses)
  LIMIT 1
$function$;