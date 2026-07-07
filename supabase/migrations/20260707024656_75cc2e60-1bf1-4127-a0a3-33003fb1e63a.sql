-- Fix overly-permissive ALL policies that were also granting read access.
-- Then add restrictive guards so FR visibility is enforced even if another permissive read policy exists.

DROP POLICY IF EXISTS conv_write_auth ON public.conversations;
DROP POLICY IF EXISTS contacts_write_auth ON public.contacts;
DROP POLICY IF EXISTS msg_write_auth ON public.messages;

DROP POLICY IF EXISTS conv_insert_auth ON public.conversations;
DROP POLICY IF EXISTS conv_update_auth ON public.conversations;
DROP POLICY IF EXISTS conv_delete_auth ON public.conversations;
DROP POLICY IF EXISTS contacts_insert_auth ON public.contacts;
DROP POLICY IF EXISTS contacts_update_auth ON public.contacts;
DROP POLICY IF EXISTS contacts_delete_auth ON public.contacts;
DROP POLICY IF EXISTS msg_insert_auth ON public.messages;
DROP POLICY IF EXISTS msg_update_auth ON public.messages;
DROP POLICY IF EXISTS msg_delete_auth ON public.messages;

CREATE POLICY conv_insert_auth
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY conv_update_auth
ON public.conversations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY conv_delete_auth
ON public.conversations
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY contacts_insert_auth
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY contacts_update_auth
ON public.contacts
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY contacts_delete_auth
ON public.contacts
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY msg_insert_auth
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY msg_update_auth
ON public.messages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY msg_delete_auth
ON public.messages
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS fr_conversations_visibility_guard ON public.conversations;
DROP POLICY IF EXISTS fr_contacts_visibility_guard ON public.contacts;
DROP POLICY IF EXISTS fr_messages_visibility_guard ON public.messages;

CREATE POLICY fr_conversations_visibility_guard
ON public.conversations
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.fr_can_see_conversation(id));

CREATE POLICY fr_contacts_visibility_guard
ON public.contacts
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.fr_can_see_contact(id));

CREATE POLICY fr_messages_visibility_guard
ON public.messages
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.fr_can_see_conversation(conversation_id));