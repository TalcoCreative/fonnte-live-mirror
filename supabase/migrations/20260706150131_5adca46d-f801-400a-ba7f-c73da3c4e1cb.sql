CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT public.has_role(auth.uid(), 'first_response') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE c.id = _conv_id
        AND (c.assigned_agent_id IS NULL OR public.has_role(c.assigned_agent_id, 'first_response'))
        AND (ct.assigned_agent_id IS NULL OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT public.has_role(auth.uid(), 'first_response') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND (ct.assigned_agent_id IS NULL OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
  END
$$;