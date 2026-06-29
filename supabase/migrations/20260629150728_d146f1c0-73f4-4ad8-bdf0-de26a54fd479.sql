
REVOKE EXECUTE ON FUNCTION public.log_contact_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_conversation_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_message_event() FROM PUBLIC, anon, authenticated;
