
-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'first_response';

-- 2. Shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  color text NOT NULL DEFAULT '#0ea5e9',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shifts readable by authenticated" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shifts managed by admin" ON public.shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER touch_shifts_updated BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Profile: shift + division
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS division text;

-- 4. Extend activity_logs
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS entity_label text;
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON public.activity_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON public.activity_logs(action, created_at DESC);

-- 5. audit_events table — historical source-of-truth for analytics
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit readable by authenticated" ON public.audit_events FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS audit_events_type_time_idx ON public.audit_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_time_idx ON public.audit_events(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_conv_time_idx ON public.audit_events(conversation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_contact_time_idx ON public.audit_events(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_occurred_brin ON public.audit_events USING brin(occurred_at);

-- 6. Conversations: priority
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

-- 7. Audit triggers
CREATE OR REPLACE FUNCTION public.log_contact_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(event_type, actor_id, contact_id, stage_id, product_id, new_value)
    VALUES ('contact_created', v_actor, NEW.id, NEW.stage_id, NEW.interested_product_id,
            jsonb_build_object('full_name', NEW.full_name, 'whatsapp_number', NEW.whatsapp_number));
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      INSERT INTO public.audit_events(event_type, actor_id, contact_id, stage_id, old_value, new_value)
      VALUES ('stage_changed', v_actor, NEW.id, NEW.stage_id,
              jsonb_build_object('stage_id', OLD.stage_id),
              jsonb_build_object('stage_id', NEW.stage_id));
    END IF;
    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      INSERT INTO public.audit_events(event_type, actor_id, contact_id, old_value, new_value)
      VALUES (CASE WHEN OLD.assigned_agent_id IS NULL THEN 'assigned' ELSE 'reassigned' END,
              v_actor, NEW.id,
              jsonb_build_object('agent_id', OLD.assigned_agent_id),
              jsonb_build_object('agent_id', NEW.assigned_agent_id));
    END IF;
    IF NEW.interested_product_id IS DISTINCT FROM OLD.interested_product_id THEN
      INSERT INTO public.audit_events(event_type, actor_id, contact_id, product_id, old_value, new_value)
      VALUES ('product_changed', v_actor, NEW.id, NEW.interested_product_id,
              jsonb_build_object('product_id', OLD.interested_product_id),
              jsonb_build_object('product_id', NEW.interested_product_id));
    END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      INSERT INTO public.audit_events(event_type, actor_id, contact_id, old_value, new_value)
      VALUES ('name_changed', v_actor, NEW.id,
              jsonb_build_object('full_name', OLD.full_name),
              jsonb_build_object('full_name', NEW.full_name));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contacts_audit ON public.contacts;
CREATE TRIGGER contacts_audit AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_changes();

CREATE OR REPLACE FUNCTION public.log_conversation_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO public.audit_events(event_type, actor_id, contact_id, conversation_id, old_value, new_value)
    VALUES (CASE WHEN OLD.assigned_agent_id IS NULL THEN 'conv_assigned' ELSE 'conv_takeover' END,
            v_actor, NEW.contact_id, NEW.id,
            jsonb_build_object('agent_id', OLD.assigned_agent_id),
            jsonb_build_object('agent_id', NEW.assigned_agent_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS conversations_audit ON public.conversations;
CREATE TRIGGER conversations_audit AFTER UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.log_conversation_changes();

CREATE OR REPLACE FUNCTION public.log_message_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact uuid;
BEGIN
  SELECT contact_id INTO v_contact FROM public.conversations WHERE id = NEW.conversation_id;
  INSERT INTO public.audit_events(event_type, actor_id, contact_id, conversation_id, new_value, occurred_at)
  VALUES (CASE WHEN NEW.direction = 'INBOUND' THEN 'chat_in' ELSE 'chat_out' END,
          NEW.sent_by_id, v_contact, NEW.conversation_id,
          jsonb_build_object('message_id', NEW.id, 'type', NEW.type, 'response_seconds', NEW.response_seconds),
          NEW.sent_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_audit ON public.messages;
CREATE TRIGGER messages_audit AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.log_message_event();

-- 8. Seed default shifts
INSERT INTO public.shifts(name, start_time, end_time, color) VALUES
  ('Shift Pagi', '07:00', '15:00', '#22c55e'),
  ('Shift Siang', '15:00', '23:00', '#f59e0b'),
  ('Shift Malam', '23:00', '07:00', '#6366f1')
ON CONFLICT (name) DO NOTHING;

-- 9. Seed 10 default stages if empty
INSERT INTO public.stages(name, color, order_index, is_default, is_terminal) VALUES
  ('Leads Masuk', '#3b82f6', 1, true, false),
  ('First Response', '#06b6d4', 2, false, false),
  ('Screening', '#0ea5e9', 3, false, false),
  ('Menunggu Dokumen', '#8b5cf6', 4, false, false),
  ('Qualified', '#a855f7', 5, false, false),
  ('Follow Up', '#eab308', 6, false, false),
  ('Appointment', '#f59e0b', 7, false, false),
  ('Konsultasi', '#10b981', 8, false, false),
  ('Treatment', '#14b8a6', 9, false, false),
  ('Closed Won', '#22c55e', 10, false, true),
  ('Closed Lost', '#ef4444', 11, false, true)
ON CONFLICT DO NOTHING;

-- 10. SLA defaults
INSERT INTO public.system_settings(key, value) VALUES
  ('sla_green_minutes', '5'),
  ('sla_yellow_minutes', '10')
ON CONFLICT (key) DO NOTHING;
