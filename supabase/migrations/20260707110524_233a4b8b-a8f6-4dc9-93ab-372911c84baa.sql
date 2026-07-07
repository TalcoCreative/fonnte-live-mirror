
-- 1. Backfill user_roles for anyone missing (default agent)
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'agent'::app_role FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.user_id IS NULL;

-- 2. Harden fr_can_see_conversation: default to allow when user has no known role
CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Only enforce guard when user is explicitly a first_response role
    WHEN public.has_role(auth.uid(), 'first_response')
      AND NOT public.has_role(auth.uid(), 'agent')
      AND NOT public.is_admin(auth.uid())
    THEN EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE c.id = _conv_id
        AND (c.assigned_agent_id IS NULL OR c.assigned_agent_id = auth.uid() OR public.has_role(c.assigned_agent_id, 'first_response'))
        AND (ct.assigned_agent_id IS NULL OR ct.assigned_agent_id = auth.uid() OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
    ELSE true
  END
$function$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'first_response')
      AND NOT public.has_role(auth.uid(), 'agent')
      AND NOT public.is_admin(auth.uid())
    THEN EXISTS (
      SELECT 1
      FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND (ct.assigned_agent_id IS NULL OR ct.assigned_agent_id = auth.uid() OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
    ELSE true
  END
$function$;
