-- Harden role checks against older/user-created accounts whose user_roles row was not written.
-- This keeps FR inbox visibility based on actual account role from user_roles, with a safe fallback to creation logs.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.activity_logs al
    WHERE al.action = 'create_agent'
      AND al.entity_id = _user_id
      AND al.metadata->>'role' = _role::text
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'first_response')
      AND NOT public.has_role(auth.uid(), 'agent')
      AND NOT public.is_admin(auth.uid())
    THEN EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE c.id = _conv_id
        AND (c.assigned_agent_id IS NULL OR public.has_role(c.assigned_agent_id, 'first_response'))
        AND (ct.assigned_agent_id IS NULL OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'first_response')
      AND NOT public.has_role(auth.uid(), 'agent')
      AND NOT public.is_admin(auth.uid())
    THEN EXISTS (
      SELECT 1
      FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND (ct.assigned_agent_id IS NULL OR public.has_role(ct.assigned_agent_id, 'first_response'))
    )
    ELSE true
  END
$$;