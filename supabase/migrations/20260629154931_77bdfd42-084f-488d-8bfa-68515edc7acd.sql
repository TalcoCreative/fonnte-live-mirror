
-- Workflow builder tables
CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft', -- draft | published | archived
  version int NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflows read all auth" ON public.workflows FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflows admin write" ON public.workflows FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  type text NOT NULL, -- message | input_text | textarea | dropdown | radio | checkbox | date | phone | email | number | file | conditional | closing
  label text,
  prompt text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping text, -- e.g. "contacts.full_name"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_steps read all auth" ON public.workflow_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_steps admin write" ON public.workflow_steps FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_workflow_steps_updated BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS workflow_steps_workflow_pos_idx ON public.workflow_steps(workflow_id, position);

-- Extra contact columns for richer mappings
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS need_category text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email text;
