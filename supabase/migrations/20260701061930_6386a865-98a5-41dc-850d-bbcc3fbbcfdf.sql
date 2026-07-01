
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE whatsapp_number='6281234567890'));
DELETE FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE whatsapp_number='6281234567890');
DELETE FROM contacts WHERE whatsapp_number='6281234567890';
