
CREATE POLICY "agents_upload_chat_media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "agents_read_chat_media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "service_role_all_chat_media" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'chat-media') WITH CHECK (bucket_id = 'chat-media');
