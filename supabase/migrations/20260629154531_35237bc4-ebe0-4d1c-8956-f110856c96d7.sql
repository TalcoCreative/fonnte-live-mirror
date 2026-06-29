
CREATE TABLE IF NOT EXISTS public.agent_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, shift_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_shifts TO authenticated;
GRANT ALL ON public.agent_shifts TO service_role;

ALTER TABLE public.agent_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read agent_shifts"
  ON public.agent_shifts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage agent_shifts"
  ON public.agent_shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
