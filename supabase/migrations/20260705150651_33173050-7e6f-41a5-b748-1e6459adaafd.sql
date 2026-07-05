-- Tighten FR visibility: First Response division can only see conversations/contacts that are NOT YET assigned to anyone.
-- Once a lead is assigned (to any agent/admin/super_admin, or even another FR), it disappears from FR's inbox.

CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = _conv_id
        AND c.assigned_agent_id IS NULL
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND ct.assigned_agent_id IS NULL
    )
  END
$$;