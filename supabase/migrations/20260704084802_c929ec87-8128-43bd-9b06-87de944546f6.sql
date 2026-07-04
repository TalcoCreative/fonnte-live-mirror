-- First Response tidak lagi bisa lihat chat setelah di-assign ke agent/admin/super_admin
-- Hapus klausa "boleh lihat kalau ada invitation dari saya"
CREATE OR REPLACE FUNCTION public.fr_can_see_conversation(_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = _conv_id
        AND (c.assigned_agent_id IS NULL OR c.assigned_agent_id = auth.uid())
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
    WHEN NOT has_role(auth.uid(),'first_response') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.contacts ct
      WHERE ct.id = _contact_id
        AND (ct.assigned_agent_id IS NULL OR ct.assigned_agent_id = auth.uid())
    )
  END
$$;

-- Snapshot waktu invitation dibuat: chat history di halaman invitation dibatasi sampai waktu ini
ALTER TABLE public.assignment_invitations
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz NOT NULL DEFAULT now();