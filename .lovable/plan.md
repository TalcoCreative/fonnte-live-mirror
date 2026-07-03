
# Ringkasan
Ada 6 pekerjaan besar. Gua breakdown per bagian supaya lo bisa lihat apa saja yang berubah, mana yang butuh migration, dan urutannya.

---

## 1. Balikin Shift & Daftar Shift di Settings
- Tambah lagi tab **Shift & Jadwal** di `_app.settings.tsx` (dulu dihapus).
- UI:
  - Daftar shift (nama, hari, jam mulai, jam selesai, warna).
  - Daftar agent → assign shift per agent per hari.
- Tabel `shifts` dan `agent_shifts` sudah ada di DB (tidak dihapus), jadi tidak butuh migration schema — tinggal pakai lagi.

## 2. Dashboard First Response — semua metrik dibatasi ke jam shift
Untuk **setiap agent × setiap tanggal** dalam rentang filter dashboard:
- Hitung "in-shift window" dari tabel `agent_shifts` + `shifts` (bisa multi window/hari).
- **Avg First Response** = rata-rata (waktu jawab pertama − waktu inbound masuk) — hanya untuk inbound yang jatuh **di dalam window shift agent tsb**. Inbound yang masuk di luar shift → tidak dihitung terhadap agent itu.
- **Avg Handle Time** = rata-rata durasi handle per lead (dari `conv_assigned` sampai `stage_changed`→closing atau resolve), **clamp** ke window shift.
- **Avg Response** = rata-rata jeda per bubble (inbound→outbound berikutnya) untuk chat yang inbound-nya jatuh di dalam window shift agent.
- **SLA Breakdown**: baca threshold dari `system_settings` (`sla_green`, `sla_yellow`) yang sudah ada di tab **SLA Inbox**, lalu bucket setiap first-response ke Green / Yellow / Red. Pastikan chart & angka sesuai persentase.
- **Beban per Jam** → ganti rumus: hitung `count(distinct contact_id yang di-first-response agent)` per jam shift agent tsb, bukan dari event.

## 3. Isolasi Inbox First Response
- Role `first_response` di `_app.inbox.tsx` (query & realtime): filter conversations di mana `assigned_agent_id` masih NULL **atau** masih milik user FR itu sendiri.
- Begitu invitation di-accept oleh agent → `assigned_agent_id` di-set ke agent → FR otomatis kehilangan akses (RLS + query filter).
- Update RLS policy `conversations` untuk role FR: `SELECT` hanya jika `assigned_agent_id IS NULL OR assigned_agent_id = auth.uid()`.

## 4. Sistem Invitation (Assign dari FR ke Agent/Admin)
### Migration baru: tabel `assignment_invitations`
```
id, conversation_id, contact_id,
from_user_id (FR),        -- yang assign
to_user_id (agent),       -- yang diundang
status ('pending'|'accepted'|'rejected'|'expired'),
message (opsional catatan dari FR),
created_at, responded_at,
reject_reason
```
- Trigger: saat FR klik "Assign ke agent X" → **tidak langsung** ubah `assigned_agent_id`. Buat row `assignment_invitations` status=`pending`.
- Agent lihat notifikasi (badge di sidebar + toast realtime via Supabase Realtime channel).
- Agent buka **preview chat read-only** (route baru: `_app.invitation.$id.tsx`) → bisa scroll seluruh percakapan + info lead sebelum accept/reject.
- **Accept** → update `conversations.assigned_agent_id = agent`, `contacts.assigned_agent_id = agent`, invitation.status=accepted. Agent dapat continue-point.
- **Reject** → invitation.status=rejected, lead balik ke inbox FR yang assign (assigned_agent_id NULL lagi, stage rollback ke stage FR asal), dengan alasan reject tampil di FR.

## 5. Stage Guard — Cegah "closing" kalau chat belum layak
- Agent yang reject invitation → tambah audit event `invitation_rejected` dengan alasan, muncul di timeline lead.
- Di dashboard performa, agent tidak dapat +1 closing sampai invitation-nya di-accept.
- Tambah field `qualification_ok` di contacts? **Tidak perlu** — cukup pakai state invitation: kalau invitation ditolak, stage otomatis dikembalikan ke stage first-response, jadi tidak bisa di-close.

## 6. Testing (per keputusan lo: skip)
Gua akan:
- Verifikasi build sukses (`tsgo`).
- Query SQL cek RLS policy baru.
- Tidak jalanin Playwright.

---

## File yang Disentuh
- `supabase/migrations/xxx.sql` — tabel `assignment_invitations` + RLS + update RLS conversations untuk FR.
- `src/routes/_app.settings.tsx` — tambah tab Shift & Jadwal.
- `src/routes/_app.dashboard.tsx` — refactor semua metrik FR pakai window shift + SLA breakdown dari settings + beban per jam dari lead count.
- `src/routes/_app.inbox.tsx` — filter FR + tombol "Assign" jadi invitation.
- `src/routes/_app.my-inbox.tsx` — otomatis ikut (share InboxView).
- `src/routes/_app.invitation.$id.tsx` — **BARU**, preview chat + accept/reject.
- `src/components/*` — komponen invitation card di sidebar / topbar untuk notifikasi.
- `src/routeTree.gen.ts` — auto-regen.

## Yang TIDAK Diubah
- Skema shifts/agent_shifts (sudah ada).
- Auth flow.
- Fitur lain di luar dashboard/inbox/settings.

## Risiko / Perhatian
- Refactor dashboard cukup besar (semua metrik FR ganti sumber datanya) — angka lama akan berubah drastis kalau lo baru bikin shift; pastikan sudah isi shift dulu setelah tab shift balik.
- RLS FR yang lebih ketat bisa bikin FR "kehilangan" beberapa chat yang sebelumnya kelihatan — ini justru yang lo minta.
- Kalau agent tidak pernah accept/reject invitation, lead nyangkut — gua **tidak** tambahkan auto-expire karena lo tidak pilih opsi timeout. Bisa ditambahkan nanti kalau perlu.

Kalau OK gua eksekusi berurutan: migration dulu → shift settings → invitation flow → RLS inbox → refactor dashboard.
