
-- Detach contacts before reseeding stages
UPDATE public.contacts SET stage_id = NULL;
DELETE FROM public.stages;
INSERT INTO public.stages (name, color, order_index, is_default, is_terminal) VALUES
('Lead Masuk', '#3B82F6', 1, true, false),
('Screening', '#06B6D4', 2, false, false),
('Menunggu Dokumen', '#8B5CF6', 3, false, false),
('Qualified', '#10B981', 4, false, false),
('Follow Up', '#F59E0B', 5, false, false),
('Appointment', '#EC4899', 6, false, false),
('Konsultasi', '#6366F1', 7, false, false),
('Treatment', '#14B8A6', 8, false, false),
('Closed Won', '#22C55E', 9, false, true),
('Closed Lost', '#EF4444', 10, false, true);

UPDATE public.contacts c SET stage_id = (SELECT id FROM public.stages WHERE is_default = true LIMIT 1)
WHERE stage_id IS NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS estimated_revenue NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_url TEXT;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS response_seconds INTEGER;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_quick_reply BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

DELETE FROM public.templates WHERE is_quick_reply = true;
INSERT INTO public.templates (name, content, category, is_quick_reply, sort_order) VALUES
('Opening', 'Halo, saya {agent} dari Rumah Sakit Husada. Terima kasih sudah menghubungi kami. Ada yang bisa saya bantu?', 'opening', true, 1),
('Tanya Keluhan', 'Boleh dijelaskan lebih detail keluhan yang sedang dialami? Sudah berapa lama gejala dirasakan?', 'qualifying', true, 2),
('Minta Dokumen', 'Untuk mempercepat proses, mohon kirimkan foto KTP/identitas dan riwayat medis (jika ada) ke chat ini.', 'docs', true, 3),
('Rekomendasi Dokter', 'Berdasarkan keluhan Anda, kami merekomendasikan untuk konsultasi dengan dokter spesialis kami. Apakah Anda berkenan kami jadwalkan?', 'recommendation', true, 4),
('Konfirmasi Appointment', 'Jadwal konsultasi Anda sudah kami siapkan. Mohon konfirmasi tanggal dan jam yang sesuai untuk Anda.', 'appointment', true, 5),
('Estimasi Biaya', 'Untuk estimasi biaya treatment, tim kami akan menyiapkan rincian dan mengirimkannya dalam beberapa saat. Mohon ditunggu.', 'pricing', true, 6),
('Follow Up', 'Selamat siang, kami ingin follow up terkait konsultasi sebelumnya. Apakah ada pertanyaan lebih lanjut yang ingin disampaikan?', 'followup', true, 7),
('Closing', 'Terima kasih atas kepercayaannya kepada Rumah Sakit Husada. Jika ada hal lain yang bisa kami bantu, jangan ragu menghubungi kami kembali.', 'closing', true, 8);

ALTER TABLE public.templates REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.templates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  emails text[] := ARRAY['vina@husada.com','candy@husada.com','aura@husada.com','audina@husada.com','maya@husada.com'];
  names  text[] := ARRAY['Vina','Candy','Aura','Audina','Maya'];
  uid uuid; e text; i int := 1;
BEGIN
  FOREACH e IN ARRAY emails LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = e) THEN
      uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        e, crypt('123456', gen_salt('bf')), now(),
        jsonb_build_object('full_name', names[i]),
        '{"provider":"email","providers":["email"]}'::jsonb,
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', e), 'email', uid::text, now(), now(), now());
    ELSE
      UPDATE auth.users SET
        encrypted_password = crypt('123456', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data,'{}'::jsonb), '{full_name}', to_jsonb(names[i]))
      WHERE email = e;
      UPDATE public.profiles SET full_name = names[i]
      WHERE id = (SELECT id FROM auth.users WHERE email = e);
    END IF;
    i := i + 1;
  END LOOP;
END $$;

-- Seed 3 default products if none
INSERT INTO public.products (name, description, is_active, sort_order)
SELECT * FROM (VALUES
  ('Medical Check Up', 'Pemeriksaan kesehatan menyeluruh', true, 1),
  ('Konsultasi Spesialis', 'Konsultasi dokter spesialis', true, 2),
  ('Rawat Inap', 'Layanan rawat inap', true, 3)
) v(name, description, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products);
