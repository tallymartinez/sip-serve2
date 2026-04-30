INSERT INTO public.home_content (id, data) VALUES ('default', '{
  "heroImageUrl": "https://vumgjebgfzfzhtbdojkk.supabase.co/storage/v1/object/public/home-images/hero-bar.jpg",
  "galleryImages": [
    "https://vumgjebgfzfzhtbdojkk.supabase.co/storage/v1/object/public/home-images/gallery-1.jpg",
    "https://vumgjebgfzfzhtbdojkk.supabase.co/storage/v1/object/public/home-images/gallery-2.jpg",
    "https://vumgjebgfzfzhtbdojkk.supabase.co/storage/v1/object/public/home-images/gallery-3.jpg"
  ],
  "closingImageUrl": "https://vumgjebgfzfzhtbdojkk.supabase.co/storage/v1/object/public/home-images/closing.jpg"
}'::jsonb)
ON CONFLICT (id) DO UPDATE SET data = public.home_content.data || EXCLUDED.data;