
CREATE TABLE public.fr_date_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  work_date date NOT NULL,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, work_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fr_date_shifts TO authenticated;
GRANT ALL ON public.fr_date_shifts TO service_role;

ALTER TABLE public.fr_date_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage FR date shifts"
  ON public.fr_date_shifts FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users read own FR date shifts"
  ON public.fr_date_shifts FOR SELECT
  USING (auth.uid() = agent_id OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated read FR date shifts"
  ON public.fr_date_shifts FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_fr_date_shifts_updated
  BEFORE UPDATE ON public.fr_date_shifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_fr_date_shifts_agent_date ON public.fr_date_shifts(agent_id, work_date);
CREATE INDEX idx_fr_date_shifts_date ON public.fr_date_shifts(work_date);
