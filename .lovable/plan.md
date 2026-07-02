
## Tujuan
Hilangkan fitur **Shift & SLA** manual dan ganti perhitungan "rata-rata jam shift" di Dashboard First Response dengan **jam kerja aktual berdasarkan log aktivitas** tiap agent per hari.

## Perubahan

### 1. Hilangkan Shift dari Settings
- Hapus tab **Shift & SLA** di `src/routes/_app.settings.tsx` (daftar shift, form tambah shift, dan penjadwalan agent-shift).
- Sisakan pengaturan SLA (badge warna inbox) tetap ada — pindahkan ke tab lain (mis. tab Umum) supaya threshold hijau/kuning/merah masih bisa diatur.
- Tabel `shifts` dan `agent_shifts` di database tidak dihapus (biar aman dari data loss); cukup UI-nya yang hilang. Bisa dihapus fisik nanti kalau diminta eksplisit.

### 2. Ganti "Avg Shift" di Dashboard First Response
Di `src/routes/_app.dashboard.tsx` tab **First Response**:
- Hapus perhitungan `avgShiftHours` yang membaca `shifts` + `agent_shifts`.
- Ganti dengan **Jam Kerja Aktual per hari** dihitung dari `audit_events` (event `chat_out`, `chat_in`, `stage_changed`, `conv_assigned`, dll — semua aktivitas agent):
  - Untuk tiap agent + tiap tanggal (di rentang filter dashboard):
    - `first_activity` = waktu event pertama agent hari itu
    - `last_activity` = waktu event terakhir agent hari itu
    - `jam_kerja_hari_itu` = (last − first) dalam jam
  - **Avg Jam Kerja/Hari** = rata-rata `jam_kerja_hari_itu` dari semua hari agent aktif.
- Tampilkan kolom baru **Avg Jam Kerja/Hari** di tabel "Detail Tim First Response (Historis)".

### 3. Section baru: Rincian Jam Kerja per Agent per Hari
Di bagian **paling bawah** tab First Response, tambahkan card **"Rincian Jam Kerja Harian"**:
- Mengikuti rentang tanggal filter dashboard yang sudah ada.
- Untuk setiap agent, tampilkan tabel/list per hari:
  - Tanggal (hari, contoh: Kamis 02 Jul 2026)
  - Jam mulai (event pertama)
  - Jam selesai (event terakhir)
  - Total jam kerja
  - Jumlah aktivitas (opsional, jumlah events)
- Agent bisa dipilih via dropdown atau ditampilkan expandable per agent (biar sendirian bisa dilihat detail).
- Baris total di bawah: total hari aktif & rata-rata jam/hari untuk agent tsb.

### 4. Detail Teknis
- Query `audit_events` filter by `actor_id in (agents)` dan `occurred_at between range` — group by `actor_id, date_trunc('day', occurred_at)`, ambil `min(occurred_at)` & `max(occurred_at)`.
- Dihitung client-side dari data yang sudah difetch (tanpa RPC baru) supaya cepat.
- Timezone: pakai lokal browser (Asia/Jakarta implisit dari `Date`).

## File yang Disentuh
- `src/routes/_app.settings.tsx` — hapus UI Shift & SLA (sisakan SLA threshold).
- `src/routes/_app.dashboard.tsx` — ganti `avgShiftHours` logic + tambah section "Rincian Jam Kerja Harian".

## Yang TIDAK Diubah
- Skema database (tabel `shifts` & `agent_shifts` tetap ada, hanya tidak dipakai).
- Fitur lain di dashboard, inbox, leads, dsb.

Konfirmasi kalau setuju, atau kasih tahu bagian mana yang mau diubah.
