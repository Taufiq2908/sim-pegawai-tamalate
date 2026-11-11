# Backend follow-up — hasil QA fitur surat, presensi, cuti, KGB

Tanggal: 2026-11-06
Konteks: perbaikan frontend sudah dikerjakan. Dokumen ini merangkum hal yang
masih perlu ditindaklanjuti di backend. Tidak ada kode backend yang diubah.

> **Status setelah pembaruan backend 6 November 2026**
>
> - `AGENDA-2026-0042` sudah dimigrasikan ke `REVIEW_SEKCAM` dan muncul di daftar
>   Sekcam. Migration: `20261106000000_normalize_letter_received_status`.
> - Pegawai sekarang dapat membaca surat teguran miliknya sendiri. Endpoint
>   `GET /attendances/warning-letters`, detail, dan `/print` memakai ownership
>   check; pegawai lain tetap mendapat `403`.
> - Notifikasi surat teguran dibuat saat surat baru diterbitkan, dan laporan hasil
>   pembinaan dikirim ke Sekcam/Camat. Respons surat teguran kini menyertakan
>   `workflowStatus`.
> - Pencarian surat masuk tidak lagi menimpa scope akses (`OR` digabung dengan
>   `AND`).
> - Masih terbuka: urutan `forward → instruct → summon` belum ditegakkan backend,
>   permission `paraf`/`approve` LEADER masih tumpang tindih, dan tanda tangan
>   cuti/KGB masih demo.
>
> Frontend sudah disesuaikan: halaman teguran memakai `RequireAuth`, tombol aksi
> tetap berbasis permission, pegawai melihat **Surat Teguran Saya**, dan badge
> notifikasi membedakan **Surat Teguran**/ **Pembinaan**.

## 1. Surat masuk — surat terbaru tidak tampil di halaman Sekcam

**Status: selesai.**

Data terbaru setelah migrasi:

- `AGENDA-2026-0042` — status `REVIEW_SEKCAM`, `submittedAt`
  `2026-11-05T13:04:24Z`, dibuat oleh `verifier1`.
- `AGENDA-2026-0041` — status `REVIEW_SEKCAM`.

Penyebab awal: `AGENDA-2026-0042` masih berstatus lama `RECEIVED`, yang tidak
dikenali `scopeWhere()` untuk Sekcam. Migration
`20261106000000_normalize_letter_received_status/migration.sql` memetakan
`RECEIVED -> REVIEW_SEKCAM` dan mengisi `submittedAt` bila kosong.

Verifikasi: login `sekcam1`, buka **Surat Masuk → Menunggu Sekcam**;
`AGENDA-2026-0041` dan `AGENDA-2026-0042` tampil.

Sisa saran untuk produksi:

1. Audit berkala `surat_masuk.status` agar nilai lama tidak muncul lagi.
2. Pertimbangkan constraint/enum status di level database.
3. Pastikan proses backend yang dipakai QA memakai kode terbaru.

Catatan: frontend sudah menambahkan auto-refresh/fokus dan tombol **Muat
ulang** pada daftar surat masuk, serta penjelasan bahwa surat baru terlihat
setelah TU mengirimkannya.

## 2. Presensi / pembinaan / surat teguran

### 2a. Pegawai penerima tidak bisa membuka surat teguran

**Status: selesai.**

Endpoint berikut sekarang memakai ownership check, bukan hanya
`attendance.summary`:

- `GET /attendances/warning-letters` — pegawai hanya menerima surat miliknya.
- `GET /attendances/warning-letters/:id` — pemilik boleh membuka, pegawai lain
  mendapat `403`.
- `GET /attendances/warning-letters/:id/print` — aturan yang sama.

Pegawai (`EMPLOYEE`) tidak perlu permission khusus untuk membuka suratnya
sendiri. Frontend sudah membuka halaman **Surat Teguran Saya** dan menampilkan
tombol **Buka surat teguran** pada notifikasi.

Verifikasi:

1. Login `pegawai1`, buka **Presensi → Surat teguran saya**; surat milik Ahmad
   tampil.
2. Login `pegawai2`, buka surat milik Ahmad lewat URL detail; backend
   mengembalikan **“Bukan surat teguran milik Anda”**.


### 2b. Alur “lapor ke Sekcam” dan pembinaan

Saat ini `POST /attendances/warning-letters/generate`
(`backend/src/routes/attendance.routes.ts:477-536`) otomatis membuat notifikasi
ke posisi `SEKCAM` dan pemegang `attendance.summary`. Tidak ada endpoint
eksplisit “lapor ke Sekcam” dari Kasubag.

Di frontend, tombol generate sudah dilabeli **Terbitkan & lapor ke Sekcam**
dan detail teguran sekarang memblokir penjadwalan pembinaan sampai:

1. Sekcam menekan **Teruskan ke Camat** (`forward`), dan
2. Camat memberi instruksi (`instruct`).

Backend sebaiknya menegakkan urutan yang sama agar tidak bisa dilangkahi lewat
API langsung:

- `summon` hanya boleh jika `forwardAt != null` dan `instructedAt != null`.
- Pertimbangkan endpoint/status eksplisit “laporan diterima Sekcam” bila
  memang dibutuhkan sebagai task tersendiri.

## 3. Cuti — notifikasi ke Sekcam/Camat

### Temuan

Notifikasi cuti dibuat oleh `notifyLeaveTransition()` di
`backend/src/routes/leave.routes.ts:80-112`. Pemetaan tahap berikutnya ada di
`backend/src/services/leave.service.ts:36-42`:

- `verify -> leave.paraf` (Sekcam dan Camat sama-sama memegang `leave.paraf`)
- `paraf -> leave.approve` (hanya Camat yang memegang `leave.approve` setelah
  override seed)

Data aktual menunjukkan notifikasi `CUTI-2026-0073` memang sudah dibuat untuk
`sekcam1` dan `camat1` saat Kasubag melakukan `verify`. Jadi jalur notifikasi
utama bekerja.

Penyebab yang lebih mungkin di QA adalah notifikasi lama tidak terlihat karena
halaman notifikasi frontend hanya mengambil 50 item pertama. Frontend sudah
diperbaiki dengan pagination **Muat lebih banyak**, badge tipe, dan filter
belum dibaca.

### Yang perlu dilakukan backend

1. Pastikan setiap instance memakai seed/override permission terbaru:
   Sekcam `leave.paraf`, Camat `leave.approve`.
2. Tegakkan jabatan pada aksi, bukan hanya permission:
   - `paraf` hanya untuk `position === 'SEKCAM'` (kecuali SUPER_ADMIN).
   - `approve` hanya untuk `position === 'CAMAT'` (kecuali SUPER_ADMIN).
   Frontend sekarang menyembunyikan tombol yang tidak sesuai jabatan, tetapi
   API masih mengizinkan kombinasi permission LEADER.
3. Jika volume notifikasi tinggi, pertimbangkan pengelompokan/dedup atau
   penanda tahap agar notifikasi cuti tidak tenggelam.

## 4. KGB — validasi akhir Camat dan tanda tangan Kasubag

### Temuan

Workflow KGB sudah punya `approve` sebagai validasi akhir
(`backend/src/services/kgb.service.ts:6-17`), tetapi:

- `kgb.paraf` dan `kgb.approve` sama-sama dimiliki role `LEADER`, sehingga
  Sekcam dan Camat secara permission bisa melakukan keduanya. Tidak ada
  pengecekan jabatan pada route aksi.
- Tidak ada field/endpoint tanda tangan untuk KGB. `KgbApproval` hanya
  menyimpan catatan. Ini sebabnya persetujuan Kasubag terlihat “verifikasi
  saja tanpa TTD”.

Frontend sekarang:

- menyembunyikan **Paraf** untuk non-Sekcam dan **Validasi akhir & setujui**
  untuk non-Camat;
- menambahkan papan tanda tangan Kasubag saat `verify` dan Camat saat
  `approve` (disimpan di browser, sama seperti pola cuti);
- menampilkan blok tanda tangan Kasubag pada pratinjau surat KGB bila
  tanda tangan tersedia.

### Yang perlu dilakukan backend

1. Tambahkan penyimpanan tanda tangan (field/endpoint) untuk KGB, misalnya
   `signatureDataUrl`/file pada `KgbApproval`, atau endpoint upload TTD.
2. Tegakkan jabatan:
   - `paraf` hanya `SEKCAM`
   - `approve` hanya `CAMAT`
3. Bila ingin mempertahankan permission bersama, tambahkan pengecekan
   `req.user.position` pada route `POST /kgb-requests/:id/:action`.
4. Pastikan payload detail/surat mengembalikan data penanda tangan
   (nama, NIP, jabatan, waktu) untuk verifikasi dan approval.

## 5. Ringkasan prioritas backend

| Prioritas | Item | Dampak |
|---|---|---|
| ~~P0~~ | ~~Perbaiki data/status `RECEIVED` dan pastikan create surat memakai kode terbaru~~ | **Selesai** — migrasi `20261106000000_normalize_letter_received_status` |
| ~~P0~~ | ~~Izinkan pegawai membuka surat teguran miliknya~~ | **Selesai** — ownership check pada list/detail/print |
| P1 | Tegakkan urutan `forward`/`instruct` sebelum `summon` | Kasubag bisa skip ke pembinaan |
| P1 | Batasi `paraf`/`approve` cuti dan KGB berdasarkan jabatan | Aktor salah bisa memproses |
| P1 | Simpan tanda tangan KGB | Persetujuan Kasubag/Camat belum punya TTD |
| P2 | Pertimbangkan dedup/grouping notifikasi | Notifikasi penting tenggelam |
