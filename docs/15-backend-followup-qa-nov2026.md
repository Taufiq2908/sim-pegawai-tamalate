# Backend follow-up — hasil QA fitur surat, presensi, cuti, KGB

Tanggal: 2026-11-06
Konteks: perbaikan frontend sudah dikerjakan. Dokumen ini merangkum hal yang
masih perlu ditindaklanjuti di backend. Tidak ada kode backend yang diubah.

## 1. Surat masuk — surat terbaru tidak tampil di halaman Sekcam

### Temuan

Data terbaru di database:

- `AGENDA-2026-0042` — status `RECEIVED`, `submittedAt` kosong,
  dibuat `2026-11-05T13:04:24Z` oleh `verifier1`.
- `AGENDA-2026-0041` — status `REVIEW_SEKCAM`, `submittedAt` juga kosong.

`GET /letters` untuk Sekcam memakai `scopeWhere()` di
`backend/src/routes/letter.routes.ts:162-173`. Sekcam hanya melihat status
`REVIEW_SEKCAM` dan `MENUNGGU_ARSIP` (selain surat yang melibatkan dirinya).
Status `RECEIVED` bukan status workflow saat ini, sehingga surat tersebut tidak
pernah masuk daftar Sekcam.

`RECEIVED` juga bukan nilai baru yang dihasilkan route create saat ini
(`POST /letters` menulis `DRAFT_TU` atau `REVIEW_SEKCAM` di
`backend/src/routes/letter.routes.ts:514`). Migrasi
`20261105010000_surat_workflow_revision/migration.sql:23` sudah memetakan
`RECEIVED -> REVIEW_SEKCAM`, tetapi baris baru di atas tetap berstatus
`RECEIVED`.

### Yang perlu dilakukan backend

1. Audit data `surat_masuk.status` yang berada di luar enum workflow
   (`RECEIVED`, `PARAF`, `DISPOSED`, `COMPLETED`, `ARCHIVED`).
2. Perbaiki/ulangi migrasi data untuk baris yang masih `RECEIVED`
   (`AGENDA-2026-0042`). Putuskan apakah baris tersebut memang sudah dikirim
   (menjadi `REVIEW_SEKCAM`) atau masih draft (`DRAFT_TU`).
3. Pastikan proses/instance backend yang dipakai QA benar-benar memakai kode
   terbaru. Nilai `RECEIVED` tidak mungkin dihasilkan route create saat ini.
4. Pertimbangkan menambahkan validasi enum status di level database atau
   constraint agar status lama tidak muncul lagi.

Catatan: frontend sudah menambahkan auto-refresh/fokus dan tombol **Muat
ulang** pada daftar surat masuk, serta penjelasan bahwa surat baru terlihat
setelah TU mengirimkannya.

## 2. Presensi / pembinaan / surat teguran

### 2a. Pegawai penerima tidak bisa membuka surat teguran

Endpoint berikut mensyaratkan `attendance.summary`:

- `GET /attendances/warning-letters/:id`
  (`backend/src/routes/attendance.routes.ts:600-608`)
- `GET /attendances/warning-letters/:id/print`
  (`backend/src/routes/attendance.routes.ts:561-598`)

Pegawai (`EMPLOYEE`) hanya punya `attendance.view` dan `attendance.checkin`
(`backend/prisma/seed.ts`), sehingga notifikasi `warning_letter` miliknya
mengarah ke halaman yang selalu `403`.

**Perlu backend:** izinkan pemilik surat membaca suratnya, misalnya:

```text
GET /attendances/warning-letters/:id
  boleh jika user.role === 'SUPER_ADMIN'
  atau user.permissions includes 'attendance.summary'
  atau warningLetter.employeeId === req.user.employeeId
```

Endpoint print dapat memakai aturan ownership yang sama. Alternatif lain:
sertakan isi surat lengkap di body notifikasi khusus pemilik.

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
| P0 | Perbaiki data/status `RECEIVED` dan pastikan create surat memakai kode terbaru | Surat terbaru tidak terlihat Sekcam |
| P0 | Izinkan pegawai membuka surat teguran miliknya | Notifikasi teguran selalu 403 |
| P1 | Tegakkan urutan `forward`/`instruct` sebelum `summon` | Kasubag bisa skip ke pembinaan |
| P1 | Batasi `paraf`/`approve` cuti dan KGB berdasarkan jabatan | Aktor salah bisa memproses |
| P1 | Simpan tanda tangan KGB | Persetujuan Kasubag/Camat belum punya TTD |
| P2 | Pertimbangkan dedup/grouping notifikasi | Notifikasi penting tenggelam |
