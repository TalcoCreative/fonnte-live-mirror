CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur_any
      WHERE ur_any.user_id = _user_id
    )
    THEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.activity_logs al
      WHERE al.action = 'create_agent'
        AND al.entity_id = _user_id
        AND al.metadata->>'role' = _role::text
    )
  END
$$;