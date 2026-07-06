
-- Add owner_role to stages so FR visibility is stage-based, not assignment-based.
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS owner_role public.app_role NOT NULL DEFAULT 'agent';

-- Seed: mark existing FR-owned stages
UPDATE public.stages SET owner_role = 'first_response'
  WHERE lower(name) IN ('leads masuk','first response') OR order_index <= 2;

-- FR conversation visibility: allowed iff the contact's stage owner_role is 'first_response'
CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      JOIN public.stages s ON s.id = ct.stage_id
      WHERE c.id = _conv_id
        AND s.owner_role = 'first_response'
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.fr_can_see_contact(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.contacts ct
      JOIN public.stages s ON s.id = ct.stage_id
      WHERE ct.id = _contact_id
        AND s.owner_role = 'first_response'
    )
  END
$$;
