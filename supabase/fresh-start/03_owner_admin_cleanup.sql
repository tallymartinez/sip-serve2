INSERT INTO public.user_roles (user_id, role, company_id)
SELECT c.owner_user_id, 'admin', c.id
FROM public.companies c
WHERE c.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = c.owner_user_id
      AND ur.role = 'admin'
      AND ur.company_id = c.id
      AND ur.venue_id IS NULL
  );

DELETE FROM public.user_roles ur
USING public.companies c
WHERE ur.role = 'admin'
  AND ur.company_id = c.id
  AND c.owner_user_id IS NOT NULL
  AND ur.user_id <> c.owner_user_id;
