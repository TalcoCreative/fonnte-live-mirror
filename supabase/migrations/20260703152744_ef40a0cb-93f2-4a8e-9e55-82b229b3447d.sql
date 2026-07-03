
-- 1. Invitation system table
CREATE TABLE public.assignment_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  note text,
  reject_reason text,
  previous_stage_id uuid REFERENCES public.stages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE INDEX idx_inv_to_user_status ON public.assignment_invitations(to_user_id, status);
CREATE INDEX idx_inv_from_user_status ON public.assignment_invitations(from_user_id, status);
CREATE INDEX idx_inv_contact ON public.assignment_invitations(contact_id);
CREATE UNIQUE INDEX uniq_pending_invitation_per_conv
  ON public.assignment_invitations(conversation_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_invitations TO authenticated;
GRANT ALL ON public.assignment_invitations TO service_role;

ALTER TABLE public.assignment_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select" ON public.assignment_invitations FOR SELECT TO authenticated
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR is_admin(auth.uid())
  );

CREATE POLICY "inv_insert" ON public.assignment_invitations FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "inv_update" ON public.assignment_invitations FOR UPDATE TO authenticated
  USING (to_user_id = auth.uid() OR from_user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (true);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignment_invitations;

-- 2. First-Response isolation via RLS
-- Helper: can current user see conversation X?
CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = _conv_id
        AND (c.assigned_agent_id IS NULL OR c.assigned_agent_id = auth.uid())
    ) OR EXISTS (
      SELECT 1 FROM public.assignment_invitations i
      WHERE i.conversation_id = _conv_id AND i.from_user_id = auth.uid()
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND (ct.assigned_agent_id IS NULL OR ct.assigned_agent_id = auth.uid())
    ) OR EXISTS (
      SELECT 1 FROM public.assignment_invitations i
      WHERE i.contact_id = _contact_id AND i.from_user_id = auth.uid()
    )
  END
$$;

-- Replace permissive SELECT policies
DROP POLICY IF EXISTS "conv_read_auth" ON public.conversations;
CREATE POLICY "conv_read_auth" ON public.conversations FOR SELECT TO authenticated
  USING (public.fr_can_see_conversation(id));

DROP POLICY IF EXISTS "contacts_read_auth" ON public.contacts;
CREATE POLICY "contacts_read_auth" ON public.contacts FOR SELECT TO authenticated
  USING (public.fr_can_see_contact(id));

DROP POLICY IF EXISTS "msg_read_auth" ON public.messages;
CREATE POLICY "msg_read_auth" ON public.messages FOR SELECT TO authenticated
  USING (public.fr_can_see_conversation(conversation_id));
