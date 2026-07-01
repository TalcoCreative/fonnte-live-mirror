
CREATE TABLE public.content_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  content_link text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_codes TO authenticated;
GRANT ALL ON public.content_codes TO service_role;
ALTER TABLE public.content_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read codes" ON public.content_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage codes" ON public.content_codes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS content_code_id uuid REFERENCES public.content_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_content_code ON public.contacts(content_code_id);
