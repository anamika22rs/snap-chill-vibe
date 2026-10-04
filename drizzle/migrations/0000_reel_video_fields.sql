ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS vibe text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD CONSTRAINT posts_media_type_check CHECK (media_type IN ('image','video'));