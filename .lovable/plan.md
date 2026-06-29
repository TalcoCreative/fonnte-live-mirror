# Husada CRM — Major Revision Plan

Scope ini sangat besar (≈ setara membangun ulang ~60% sistem). Untuk menjaga stabilitas data existing dan agar setiap fitur bisa diuji sebelum lanjut, saya pecah menjadi 6 fase. Setiap fase di-deliver berurutan, di-review, baru fase berikutnya dieksekusi. Tidak ada data lama yang dihapus — hanya ditambah kolom/tabel baru + backfill.

---

## Fase 1 — Fondasi: RBAC + Audit Log + Shift (wajib pertama)

Semua fitur lain bergantung pada ini.

- Tambah role baru di enum `app_role`: `first_response` (FR), `agent` (existing, jadi "Semi Super Admin"), `super_admin` (existing). Hapus role `admin` lama (digabung ke super_admin).
- Helper `has_role` dan policy RLS diperbarui untuk membaca role baru.
- Tabel baru `shifts` (name, start_time, end_time, color) + kolom `profiles.shift_id`, `profiles.division`.
- Tabel `activity_logs` (sudah ada) di-extend: kolom `old_value JSONB`, `new_value JSONB`, `entity_label TEXT`. Index `(entity_type, entity_id, created_at)` + `(user_id, created_at)`.
- Database trigger `log_changes()` dipasang di `contacts`, `conversations`, `messages` untuk auto-capture: stage change, product change, name change, assignment, take-over, delete. Insert log otomatis tanpa application code.
- Audit log jadi single source of truth untuk semua analytics historis (KPI dihitung dari log, bukan kondisi terakhir).

## Fase 2 — Inbox: Filter, Sort, Edit Inline, SLA, RBAC Gating

- Inbox query difilter berdasarkan role:
  - FR Agent: hanya `stage IN ('Leads Masuk','First Response')` + My Inbox tab (chat yang pernah disentuh log-nya).
  - Agent / Super Admin: semua chat.
- Sorting: Terbaru, Terlama, Unread, Prioritas, Nama A-Z/Z-A (dropdown).
- Filter chips: Unread, Assigned to Me, Belum Assigned, Priority, Stage, Product, Shift.
- Inline edit nama customer di header chat → broadcast realtime ke Inbox/Leads/Customer DB.
- Badge SLA per chat (hijau <5m, kuning 5–10m, merah >10m) — threshold disimpan di `system_settings.sla_thresholds`.
- Internal Notes upgrade: mention `@agent`, edit & delete history disimpan di audit log.

## Fase 3 — Dashboard berbasis Audit Log + Filter Multi-Dimensi

- Server function `getDashboardMetrics({ filters, range })` melakukan agregasi SQL di Postgres (bukan client). Pagination + windowing.
- Multi-filter combinable: agent, divisi, shift, role, stage, product + date-range picker (hari/minggu/bulan/tahun/custom range/range bulan/range tahun).
- KPI: Total Chat, Leads, Appointment, Closed, Lost, Conversion %, Avg First Response, Avg Resolve, Avg Handle, Total Assignment, Total Takeover, Chat per Product, Chat per Divisi.
- Charts (Recharts): Line trend, Bar per agent/produk, Donut stage distribution, Heatmap jam×hari.
- Leaderboard tabs: Fastest Response, Most Conversation, Most Closed, Most Leads, Highest Conversion — filter periode independen.
- Dashboard khusus `/dashboard/first-response` untuk role FR: KPI First Response (Total FR, Shift Take Over, Chat Dilanjutkan, Avg Response/Handle, Avg Conv per Shift) + grafik produktivitas.

## Fase 4 — Dynamic Workflow Builder

- Tabel `workflows` (name, status: draft/published, version, is_active) + `workflow_steps` (workflow_id, order, type, config JSONB, mapping_field, next_step_id, condition JSONB).
- Step types: message, input text, dropdown, radio, checkbox, date, phone, email, number, file upload, conditional, closing.
- UI builder di `/settings/workflows`: drag-drop (dnd-kit), duplicate, versioning, enable/disable, draft, publish.
- Engine baru `chatbot-runner` (edge function) menggantikan chatbot hardcoded di `fonnte-webhook`. Mapping ke `customers.*` / `leads.*` per step.
- **Product TIDAK ditanyakan ke customer.** Hanya kategori kebutuhan (dropdown). Product di-assign manual oleh FR/Agent dari Inbox → realtime update leads.

## Fase 5 — WhatsApp Mirroring Lengkap + Quick Reply Master

- `messages.type` extend: TEXT, IMAGE, VIDEO, AUDIO/VN, PDF, DOC, XLS, STICKER, CONTACT, LOCATION.
- Webhook handler men-download media URL dari WA Gateway → upload ke Supabase Storage bucket `wa-media` (private + signed URL).
- Outbound: composer di Inbox support attachment upload (image/video/doc) → kirim via gateway `sendMedia`.
- Bubble menampilkan: nama pengirim, role badge, jam, delivery status (sent/delivered/read).
- Quick Reply: tabel `quick_replies` + `quick_reply_categories` (Salam, Menunggu, Jadwal Dokter, Administratif, BPJS, Rawat Jalan, Rawat Inap, MCU, Lab, Penutup). CRUD di Settings, picker di Inbox composer (slash command `/`).

## Fase 6 — Polish, Performance, Permission Gating UI

- Setiap route & menu item di-gate sesuai role (FR tidak lihat Settings, Workflow, API, dll).
- Hilangkan semua onboarding hardcoded — flow chatbot 100% dari workflow builder.
- Optimisasi: materialized view `daily_metrics` di-refresh per 5 menit untuk dashboard cepat di data besar; semua list pakai keyset pagination.
- Index tambahan untuk audit query (BRIN pada `created_at`).
- QA pass: test setiap role login (FR vina test, Agent, Super Admin), reproduce flow chat end-to-end.

---

## Detail Teknis

Stack tetap: TanStack Start + Supabase + WA Gateway existing. Tambah dependency: `@dnd-kit/core` (workflow builder), `date-fns` (sudah ada). Tidak ganti file integrasi auto-gen.

Migrasi DB dipecah per fase, masing-masing reversible. Data existing (contacts, conversations, messages, leads, agents) tidak dihapus — hanya backfill: contoh `activity_logs` di-seed dari `messages` historis agar dashboard punya history saat go-live.

---

## Pertanyaan sebelum mulai

1. **Mulai semua fase sekaligus atau fase-per-fase dengan review?** Saya rekomendasikan fase-per-fase — total kerjaan ini 5–8 jam build agent. Sekaligus = resiko regresi tinggi & sulit di-rollback.
2. **Role mapping**: agent `vina@husada.com` tetap `super_admin`. Untuk 4 agent existing lain (candy, aura, audina, maya) — siapa yang FR, siapa yang Agent? Default saya: semua jadi `agent`, lalu Anda assign FR via Settings → Tim Agent.
3. **Shift definitions** default: Pagi (07–15), Siang (15–23), Malam (23–07). Setuju atau custom?
4. **Workflow builder live default**: pakai workflow contoh di PRD (Nama → Kategori → Pertanyaan → Closing) sebagai workflow `Default Husada v1` yang langsung aktif menggantikan bot lama?
