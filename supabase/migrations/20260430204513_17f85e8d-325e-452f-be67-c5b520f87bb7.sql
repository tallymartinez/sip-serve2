CREATE TABLE IF NOT EXISTS public.home_content (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read home content"
  ON public.home_content FOR SELECT
  USING (true);

CREATE POLICY "admins insert home content"
  ON public.home_content FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update home content"
  ON public.home_content FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER home_content_set_updated_at
  BEFORE UPDATE ON public.home_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.home_content (id, data) VALUES ('default', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;