-- 1) Extend role enum with 'manager'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
