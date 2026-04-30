INSERT INTO storage.buckets (id, name, public)
VALUES ('home-images', 'home-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anyone read home-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'home-images');

CREATE POLICY "admins upload home-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'home-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update home-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'home-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete home-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'home-images' AND public.has_role(auth.uid(), 'admin'));