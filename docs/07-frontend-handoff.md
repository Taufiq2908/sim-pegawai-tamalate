# 07 — Handoff Frontend (per 27 Oktober 2026)

Dokumen ini adalah daftar kerja frontend berdasarkan **kode aktual** di repo, bukan asumsi.
Backend sudah menyediakan hampir semua endpoint; sebagian besar pekerjaan frontend adalah
menutup celah integrasi, bukan membuat modul baru.

---

## Ringkasan prioritas

| Prioritas | Item | Dampak |
|---|---|---|
| P0 | Unduhan dokumen & foto apel rusak | PDF/foto tidak bisa dibuka |
| P0 | Proxy tidak pernah refresh token | Semua request 401 setelah 15 menit |
| P0 | Status `SIGNED` masih dipakai | Antrean registrasi selalu 0 |
| P0 | KGB `REVISION` buntu | Pegawai tidak bisa perbaiki data/berkas |
| P0 | Cuti draft/revisi tidak bisa kelola dokumen | Alur revisi berkas buntu |
| P0 | Tombol create tidak dicek permission | Banyak 403 yang terlihat seperti bug |
| P0 | UI monitoring/reminder KGB belum memakai `isOverdue` | KGB terlambat tidak pernah ditindak |
| P1 | Surat pengajuan vs pengantar tidak satu sumber | Tanggal/penandatangan bisa beda |
| P1 | Operator tidak bisa membuat cuti/KGB untuk pegawai lain | Fitur backend tidak terpakai |
| P2 | Kontrak tipe & label status | Kebingungan status |

---

## P0 — Wajib sebelum demo/UAT

### P0-1. Unduhan dokumen dan foto apel rusak (dua lapis bug)

**Bukti**

- Backend mengembalikan URL absolut API:
  - `backend/src/routes/leave.routes.ts:49` → `/api/v1/leave-requests/...`
  - `backend/src/routes/kgb.routes.ts:225` → `/api/v1/kgb-requests/...`
  - `backend/src/routes/attendance.routes.ts:751,780` → `/api/v1/attendances/session-photos/.../file`
- Frontend menambahkan `/api` lagi:
  - `frontend/src/app/cuti/[id]/page.tsx:310`
  - `frontend/src/app/kgb/[id]/page.tsx:193`
  - `frontend/src/app/presensi/page.tsx:719,721`
  - Hasil: `/api/api/v1/...` → proxy meneruskan `api/v1/...` → backend `/api/v1/api/v1/...` → 404.
- Proxy membaca file sebagai teks:
  - `frontend/src/app/api/[...path]/route.ts:34` → `res.text()`
  - Header `content-disposition`/`content-length` tidak diteruskan (baris 35–38).
  - PDF/JPG akan korup walau URL benar.

**Kerjakan**

1. Buat helper tunggal, mis. `frontend/src/lib/file-url.ts`:
   ```ts
   // Backend mengirim "/api/v1/..." — proxy Next memakai prefix "/api".
   export function fileUrl(url: string): string {
     return `/api${url.replace(/^\/api\/v1/, "")}`;
   }
   ```
   Ganti semua pemakaian `/api${...}` dengan `fileUrl(...)`.
2. Ubah proxy agar meneruskan byte:
   ```ts
   const buf = Buffer.from(await res.arrayBuffer());
   const response = new NextResponse(buf, { status: res.status });
   for (const h of ["content-type", "content-disposition", "content-length", "cache-control"]) {
     const v = res.headers.get(h);
     if (v) response.headers.set(h, v);
   }
   ```
   Tetap parse JSON hanya untuk `auth/login`.
3. Alternatif jangka panjang: backend mengembalikan path relatif (`/leave-requests/...`)
   dan frontend selalu memakai `fileUrl`. Pilih satu kontrak, jangan dua.

**Selesai bila:** PDF cuti/KGB terunduh utuh dengan nama file asli; foto apel tampil;
respons error JSON (401/404) tetap terbaca.

---

### P0-2. Refresh token tidak pernah dijalankan

**Bukti**

- Access token 15 menit, refresh 7 hari: `frontend/src/app/api/[...path]/route.ts:52,61`.
- Tidak ada pemanggilan `/auth/refresh` di seluruh frontend (`grep` hanya menemukan route backend).
- Setelah 15 menit, `apiFetch` menerima 401, `AuthProvider` tidak mengarahkan ke login
  (`frontend/src/lib/auth.tsx:22-31`).

**Kerjakan**

- Di proxy: bila respons upstream 401 dan cookie `simpeg_refresh` ada, panggil
  `POST {BACKEND}/auth/refresh`, simpan token baru ke cookie, lalu ulangi request asli **sekali**.
- Bila refresh gagal: hapus kedua cookie dan kembalikan 401.
- Di `apiFetch`: pada 401, redirect ke `/login?next=<path>` (kecuali sedang di `/login`).
- Tambahkan indikator sesi berakhir agar pengguna tidak kehilangan isian form tanpa pesan.

**Selesai bila:** halaman yang dibiarkan >15 menit masih bisa menyimpan form setelah refresh otomatis.

---

### P0-3. `SIGNED` sudah dihapus backend, masih dipakai frontend

`SIGNED` tidak ada lagi di rantai cuti (`backend/src/services/leave.service.ts:6`,
`docs/06-cuti-surat-backend.md:123`).

**Bukti pemakaian**

- Dashboard VERIFIER: `frontend/src/app/page.tsx:114,121` → hitung `status=SIGNED` (selalu 0).
- Filter cuti: `frontend/src/app/cuti/page.tsx:21`.
- Label/tone: `frontend/src/components/ui.tsx:11,45`.
- Tipe: `frontend/src/lib/types.ts:57`.
- Detail cuti: `frontend/src/app/cuti/[id]/page.tsx:135,140`.
- Surat pengantar: `frontend/src/app/cuti/[id]/surat/page.tsx:96`.

**Kerjakan**

- Hapus semua referensi `SIGNED`.
- Dashboard VERIFIER:
  - “Cuti siap registrasi” → `status=APPROVED` + link `/cuti?status=APPROVED`.
  - “Menunggu ke BKPSDM” → `status=REGISTERED` (sudah benar).
- Sesuaikan array `showPengantar`/`pengantarFinal`/`finalStatus` tanpa `SIGNED`.

**Selesai bila:** setelah Camat menekan Setujui, angka “siap registrasi” langsung bertambah.

---

### P0-4. KGB `REVISION` dan `DRAFT` tidak punya UI perbaikan

Backend sudah mendukung, frontend belum memakai:

- `PATCH /kgb-requests/:id` untuk DRAFT/REVISION — `backend/src/routes/kgb.routes.ts:344-373`.
- `POST /kgb-requests/:id/documents` untuk DRAFT/REVISION — baris 375-402.
- `DELETE /kgb-requests/:id` untuk DRAFT — baris 480-497.

Halaman `frontend/src/app/kgb/[id]/page.tsx` hanya menampilkan aksi transisi
(baris 108-148). Akibatnya setelah “Minta revisi”, pengguna hanya bisa `submit` ulang
tanpa bisa membetulkan nilai atau menambah berkas.

**Kerjakan**

1. Tambah `/kgb/[id]/edit` (atau panel edit inline) untuk pemilik saat `DRAFT|REVISION`:
   `oldRank`, `newRank`, `oldSalary`, `newSalary`, `effectiveDate`, `note`.
2. Tampilkan daftar dokumen + tombol unggah (docType dari `KGB_REQUIRED_DOCS`) pada
   status DRAFT/REVISION.
3. Tambah tombol “Hapus draf” untuk DRAFT milik sendiri.
4. Tampilkan `revisionNote` menonjol dan tombol “Perbaiki sekarang”.

**Selesai bila:** alur `submit → verify → revise → edit + unggah → submit → verify` selesai
tanpa menyentuh API manual.

---

### P0-5. Cuti: draft wajib berkas, revisi tidak bisa kelola berkas

**Bukti**

- Frontend memblokir “Simpan draft” bila berkas belum ada:
  `frontend/src/app/cuti/baru/page.tsx:72-85`.
- Backend tidak mewajibkan berkas saat create; kewajiban baru dicek saat `submit`
  (`backend/src/routes/leave.routes.ts:168-238` dan `470-479`).
- Halaman edit tidak punya kontrol unggah/daftar dokumen:
  `frontend/src/app/cuti/[id]/edit/page.tsx` (hanya field teks).
- Backend mengizinkan upload saat DRAFT/REVISION: `leave.routes.ts:275`.

**Kerjakan**

- Pisahkan validasi: simpan draft **tanpa** berkas; validasi “≥2 berkas termasuk SK_TERAKHIR”
  hanya saat tombol “Ajukan cuti”.
- Tambah section dokumen di halaman edit/detail untuk DRAFT/REVISION: daftar, unduh, unggah.
- Setelah `revise`, tampilkan `revisionNote` + tombol “Unggah berkas perbaikan”.
- Catat kebutuhan backend: belum ada endpoint hapus dokumen; bila perlu ganti berkas,
  backend harus menambah `DELETE /leave-requests/:id/documents/:docId`.

**Selesai bila:** draft bisa dibuat tanpa berkas, lalu dilengkapi; revisi berkas bisa
diselesaikan dari UI.

---

### P0-6. Tombol create/upload tidak dicek permission

**Bukti**

- Cuti: “+ Ajukan cuti” selalu tampil (`frontend/src/app/cuti/page.tsx:87-92`), padahal
  `VERIFIER` dan `SUPERVISOR` tidak punya `leave.create` (`backend/prisma/seed.ts:61-66`).
- KGB: “+ Ajukan KGB” selalu tampil (`frontend/src/app/kgb/page.tsx:77-82`), padahal
  `VERIFIER/SUPERVISOR/LEADER` tidak punya `kgb.create`.
- Surat: “+ Catat surat” selalu tampil (`frontend/src/app/surat-masuk/page.tsx:63-68`),
  padahal `EMPLOYEE` tidak punya `letter.create`.
- Unggah dokumen surat selalu tampil (`frontend/src/app/surat-masuk/[id]/page.tsx:298-306`),
  padahal backend membutuhkan `letter.document.upload`.

**Kerjakan**

- Gunakan `hasPermission(...)` untuk setiap CTA, bukan hanya untuk menu.
- Matriks minimum:
  - `leave.create` → tombol cuti baru.
  - `kgb.create` → tombol KGB baru.
  - `letter.create` → tombol catat surat.
  - `letter.document.upload` + `availableActions.includes("upload")` → unggah surat.
  - `outgoing.create` → unggah surat keluar.
- Jangan hanya menyembunyikan; tampilkan pesan bila halaman diakses langsung.

**Selesai bila:** tidak ada tombol yang menghasilkan 403 saat diklik oleh role yang wajar.

---

### P0-7. Monitoring & reminder KGB belum menangani overdue

> Status backend 27 Okt 2026: `GET /kgb-requests/monitoring` sudah mengirim `isOverdue`
> dan `meta.overdue`, memakai KGB final terakhir (COMPLETED/ARCHIVED) sebagai basis.
> `POST /kgb-requests/reminders/generate` sudah mengirim yang terlambat maksimal 12 bulan.

Temuan sebelum fix (historis):

- `dueSoon` hanya `0..3` bulan (`backend/src/routes/kgb.routes.ts:119`).
- `requiredDocs` hanya diisi bila `dueSoon` (baris 135).
- Reminder hanya `monthsUntil >= 0 && <= 3` (baris 164), `isOverdue` belum ada.
- UI “Hanya jatuh tempo” memfilter `dueSoon` saja
  (`frontend/src/app/kgb/monitoring/page.tsx:53-62`).

**Kerjakan (frontend)**

- Pakai `isOverdue` dari backend; fallback `monthsUntil < 0` hanya untuk respons lama/cache.
- Filter "Hanya jatuh tempo" = `dueSoon || isOverdue`.
- Hitungan header = `dueSoon + overdue`.
- Badge merah “Terlambat X bulan” untuk `monthsUntil < 0`.
- Tampilkan `requiredDocs` juga untuk overdue.
- Toast reminder: “N pengingat dibuat (M terlambat)” bila backend mengirim `isOverdue`.
- Tambah konfirmasi sebelum “Kirim pengingat” (backend belum idempoten; klik berulang
  membuat notifikasi ganda).

**Selesai bila:** pegawai dengan `nextKgbDate` 2 bulan lalu muncul di filter jatuh tempo,
mendapat badge terlambat, dan bisa dikirimi pengingat.

---

## P1 — Penting, setelah P0

### P1-1. Operator belum bisa membuat cuti/KGB untuk pegawai lain

Backend mendukung `employeeId` opsional:

- Cuti: `backend/src/routes/leave.routes.ts:177`.
- KGB: `backend/src/routes/kgb.routes.ts:291,300-304`.

Frontend selalu memakai akun sendiri (`cuti/baru` baris 88-98; `kgb/baru` baris 54-63).

**Kerjakan**

- Tambah pemilih pegawai (cari `/employees?limit=...`) untuk role non-EMPLOYEE.
- Kirim `employeeId` hanya bila dipilih.
- Di monitoring KGB, tambah aksi “Buatkan KGB” → `/kgb/baru?employeeId=...`, lalu prefill.
- Sembunyikan pemilih untuk `EMPLOYEE`.

### P1-2. Sinkronisasi surat pengajuan vs surat pengantar

Dua halaman memang dokumen berbeda, tetapi sumber data dan perilakunya harus konsisten.

**Masalah konkret**

- Kop surat diduplikasi di dua tempat:
  `cuti/[id]/pengajuan/page.tsx:273-299` dan `cuti/[id]/surat/page.tsx:138-165`.
- Nama/NIP Camat masih fallback hardcode:
  `pengajuan/page.tsx:179-180`, `surat/page.tsx:64-65`.
- Pangkat “Pembina” hardcode: `pengajuan/page.tsx:532`, `surat/page.tsx:243`.
- Tanggal pengajuan memakai **hari ini** (`pengajuan/page.tsx:207`), sedangkan pengantar
  memakai tanggal approve (`surat/page.tsx:103`). Setelah disetujui, tanggal pengajuan
  ikut berubah setiap kali dibuka.
- `atasanUsername` dihitung tetapi tidak dipakai; `atasanSig` memakai user yang sedang
  melihat (`pengajuan/page.tsx:65-79,167-168`). Akibatnya:
  - staf yang mencetak tidak melihat tanda tangan atasan;
  - dua pejabat dengan jabatan sama bisa saling tertukar tanda tangan.
- `JABATAN_ID` belum punya `STAF_KEPEGAWAIAN` (`pengajuan/page.tsx:34-42`).
- Label status masih menyertakan `SIGNED` (`pengajuan/page.tsx:156-158`, `surat/page.tsx:95-102`).
- KGB memuat tanda tangan Camat berdasarkan username di timeline, tanpa cek viewer
  (`kgb/[id]/surat/page.tsx:68-69`), berbeda dari cuti.

**Kerjakan**

1. Ekstrak komponen bersama:
   - `components/letter/KopSurat.tsx` (logo, alamat, kontak).
   - `components/letter/SignatureBlock.tsx` (nama, NIP, jabatan, waktu, gambar).
   - `lib/letter.ts` untuk `formatTanggalSurat`, `resolveSigner`.
2. Tanggal surat:
   - Pengajuan: `submittedAt` (fallback `createdAt`), bukan `now`.
   - Pengantar: tanggal `APPROVE`; setelah registrasi gunakan tanggal register.
3. Penandatangan: selalu dari data backend (`camat`, `supervisor`, snapshot timeline).
   Hapus fallback nama/NIP hardcode; bila data kosong tampilkan “................”.
4. Tanda tangan: resolusi berdasarkan **username aktor di timeline**, bukan user yang
   membuka halaman. Karena penyimpanan masih localStorage (demo), tampilkan catatan
   “hanya tersedia di browser penandatangan”.
5. Samakan daftar status final; buang `SIGNED`.
6. Tambah penanda “PRATINJAU” di surat KGB sebelum `REGISTERED`, seperti surat cuti.

### P1-3. Nomor surat masih hasil regex atas catatan bebas

- Cuti: `cuti/[id]/surat/page.tsx:58-61`.
- KGB: `kgb/[id]/surat/page.tsx:71-72`.

`register` hanya menyimpan catatan bebas. Regex akan gagal bila operator menulis
“No: …”, “Nomor …”, atau menambahkan tanggal.

**Kerjakan (koordinasi backend)**

- Minta field terstruktur, mis. `registerNumber`/`registerDate` pada detail cuti/KGB,
  atau endpoint `register` menerima `{ note, letterNumber, letterDate }`.
- Sementara itu, frontend: wajibkan catatan register (tambah `register` ke `NOTE_REQUIRED`
  cuti) dan tampilkan preview hasil parsing agar operator sadar.

### P1-4. Notifikasi KGB belum bisa diklik

`frontend/src/app/notifikasi/page.tsx:80-94` hanya menangani surat, cuti, dan teguran.
Pengingat KGB bertipe `KGB_REMINDER`, `referenceType: "kgb_reminder"`, `referenceId: null`
(`backend/src/routes/kgb.routes.ts:185-190`).

**Kerjakan**

- Tampilkan badge “Pengingat KGB” dan tautan ke `/kgb/monitoring`.
- Bila backend nanti mengisi `referenceId`, arahkan ke `/kgb/:id`.

### P1-5. Daftar/unduh dokumen surat & surat keluar

- Detail surat masuk menampilkan unggah, tetapi tidak menampilkan daftar dokumen
  (`frontend/src/app/surat-masuk/[id]/page.tsx`).
- Detail surat keluar hanya menampilkan nama file tanpa unduh
  (`frontend/src/app/surat-keluar/[id]/page.tsx:148-154`).
- Backend belum punya route unduh untuk `letterDocument`/`outgoingDocument`.

**Kerjakan**

- Frontend: setelah backend menambah route unduh, tampilkan tombol “Unduh”.
- Backend: tambah `GET /letters/:id/documents/:docId/download` dan padanannya untuk
  surat keluar; jangan sertakan `storedPath` di response detail.

---

## P2 — Polish

- Tombol “Tampilkan” pada daftar KGB (form hanya submit via Enter).
- Label aksi KGB “Kirim ke BKD” → “Teruskan ke BKPSDM”.
- `cuti/[id]/pengajuan` masih memberi label `review` = “Setujui & tandatangani”;
  sebut “Pertimbangan atasan” agar tidak tertukar dengan keputusan Camat.
- Empty state/403 yang ramah saat halaman diakses langsung.
- `KgbDetail.note` (catatan pembuatan) belum ditampilkan di detail.
- Tampilkan `detail.note` pada surat KGB agar alasan usulan terlihat.
- Rapikan `LeaveStatus`/`KgbStatus` di `types.ts`; tambah `isOverdue: boolean`
  pada `KgbMonitoringItem` (backend sudah mengirim) dan `isOverdue` pada baris reminder.

---

## Blocker backend (status per 27 Okt 2026)

### B-1. Perbaikan monitoring/reminder KGB **SELESAI**

Status: sudah diperbaiki di working tree. Monitoring memilih KGB final terakhir
(`COMPLETED`/`ARCHIVED`) per pegawai berdasarkan `effectiveDate`, bukan record terbaru
`createdAt`. Reminder memakai basis yang sama, mencakup yang terlambat maksimal 12 bulan,
dan mengembalikan `isOverdue`. E2E `backend/scripts/e2e-kgb.ps1` sudah mengecek basis
final, `nextKgbDate`, `isOverdue`, notifikasi, dan reminder.

Catatan di bawah adalah temuan sebelum perbaikan (historis).

Klaim “sudah fix” belum tercermin di kode:

- Monitoring masih memilih record terbaru berdasarkan `createdAt`
  (`backend/src/routes/kgb.routes.ts:92-100`), lalu hanya memakai `effectiveDate`
  bila record terbaru kebetulan `COMPLETED/ARCHIVED` (baris 105-110).
  Jika KGB final lama ada tetapi draft baru ada, `nextKgbDate` salah jatuh ke `joinDate`.
- Reminder masih `status === 'COMPLETED'` saja (baris 158), rentang `0..3` (baris 164),
  tanpa `isOverdue`.
- `git status` hanya menunjukkan skrip Python untracked:
  `fix-monitoring.py`, `fix-monitoring2.py`, `scripts/fix-reminders.py`, dll.
- `scripts/fix-reminders.py:91` memakai `items` yang tidak didefinisikan → akan crash
  bila dijalankan. `scripts/fix-structure.py` berpotensi merusak file.
- E2E `backend/scripts/e2e-kgb.ps1` hanya mengecek `meta.total`, tidak mengecek
  kebenaran `nextKgbDate`/overdue.

**Rekomendasi:** hapus skrip Python tersebut, patch manual, lalu tambah e2e:
- pegawai punya KGB COMPLETED 2024 + DRAFT 2026 → `nextKgbDate` harus 2026 dari KGB final;
- KGB COMPLETED 2023 → `monthsUntil < 0`, `isOverdue=true`, masuk reminder;
- pegawai hanya punya draft → basis `joinDate`, bukan draft.

### B-2. `GET /letters?status=PARAF` selalu 422 **SELESAI**

Status: `PARAF` sudah ditambahkan ke `LETTER_STATUS`; filter dan dashboard Camat kembali normal.

Catatan di bawah adalah temuan sebelum perbaikan (historis).

`LETTER_STATUS` tidak memuat `PARAF` (`backend/src/routes/letter.routes.ts:16`),
padahal aksi `paraf` menulis status `PARAF` (baris 331). Akibatnya:
- filter “Diparaaf” di frontend error;
- dashboard Camat memanggil `/letters?status=PARAF` (`frontend/src/app/page.tsx:163`) → “—”.

**Fix:** tambahkan `'PARAF'` ke `LETTER_STATUS`.

### B-3. KGB tidak mengirim notifikasi transisi **SELESAI**

Status: `notifyKgbTransition` sudah dipanggil pada setiap transisi. Notifikasi bertipe
`KGB`, `referenceType: "kgb_request"`, `referenceId: <id KGB>`, dikirim ke pemegang
tahap berikut + pemohon (kecuali aktor).

Catatan di bawah adalah temuan sebelum perbaikan (historis).

Hanya reminder yang membuat notifikasi (`kgb.routes.ts:182`). `submit/verify/paraf/approve/
register/...` tidak memberi notifikasi ke pemegang tahap berikut. Bandingkan
`notifyLeaveTransition` di `leave.routes.ts:78-110`.

**Fix:** tambahkan helper serupa untuk KGB.

### B-4. Buku Register KGB memakai field yang salah **SELESAI**

Status: nomor/tanggal SK diambil dari approval `REGISTER` (note + waktu register),
`gol` memakai golongan baru dan `pangkat` dipetakan dari golongan, serta `lama` memakai
KGB sebelumnya (bukan catatan pembuatan). Tidak perlu migrasi schema.

Catatan di bawah adalah temuan sebelum perbaikan (historis).

`backend/src/routes/kgb.routes.ts:57-58,62`:

- `nomorSk: k.note ?? k.requestNumber` → `note` adalah catatan pembuatan, bukan nomor
  surat hasil `register`.
- `gol: k.oldRank`, `pangkat: k.newRank` → kolom “Gol/Pangkat” mencampur golongan lama
  dan pangkat baru.
- `tanggalSk`/`tglSk` memakai `effectiveDate` (TMT), bukan tanggal SK.

**Fix:** simpan nomor/tanggal SK saat `register` (field terstruktur), dan pisahkan
golongan vs pangkat.

### B-5. `PATCH /leave-requests/:id` mengabaikan `leaveTypeCode` **SELESAI**

Status: schema menerima `leaveTypeCode`, memvalidasi jenis cuti aktif, dan meng-update
`leaveTypeId`. Frontend tidak perlu mengubah halaman edit.

Catatan di bawah adalah temuan sebelum perbaikan (historis).

Frontend mengirim `leaveTypeCode` (`frontend/src/app/cuti/[id]/edit/page.tsx:69`),
tetapi schema backend tidak memuat field itu (`leave.routes.ts:246-252`). Zod membuang
field unknown, jadi pengguna merasa berhasil mengganti jenis cuti padahal tidak.

**Pilih:** terima `leaveTypeCode` dan update `leaveTypeId`, atau hapus pilihan jenis
dari halaman edit. Jangan biarkan silent no-op.

### B-6. Keterbatasan alur cuti **BELUM**

- `POSTPONED` hanya bisa `submit` ulang; tidak bisa `PATCH` (hanya DRAFT/REVISION,
  `leave.routes.ts:244`). Bila penangguhan perlu ubah tanggal, backend harus mengizinkan.
- Tidak ada endpoint hapus dokumen; revisi berkas tidak bisa mengganti file lama.
- `register` cuti tidak mewajibkan `note`, padahal surat pengantar memakai note itu
  sebagai nomor surat. Samakan dengan KGB yang mewajibkan note.

### B-7. KGB `submit` tidak memvalidasi berkas **BELUM**

Frontend mewajibkan 3 berkas (`kgb/baru/page.tsx:46-50`), tetapi `submit` backend tidak
memeriksa dokumen (`kgb.routes.ts:413-478`). Panggilan API langsung bisa lolos dengan
berkas kosong.

**Fix:** validasi minimal `KGB_REQUIRED_DOCS` saat `submit`, seperti cuti.

### B-8. Dokumen surat: tidak ada endpoint unduh + `storedPath` bocor **BELUM**

`includeDetail` memuat `documents` (`letter.routes.ts:33`) dan `toDetail` menyebarkan
seluruh objek (`baris 54`), sehingga `storedPath` ikut terkirim. Tidak ada route unduh.
Sama untuk surat keluar.

**Fix:** map dokumen menjadi `{id, originalName, mimeType, sizeBytes, downloadUrl}` dan
tambah route unduh.

### B-9. Dokumentasi kontrak **SELESAI**

Status: `docs/02-api-contract.md` sudah diperbarui untuk basis KGB final, `isOverdue`,
meta `overdue`, reminder terlambat, notifikasi transisi KGB, register-book, dan
`leaveTypeCode` pada PATCH cuti.

`docs/02-api-contract.md:321-322` belum menjelaskan basis KGB final, `isOverdue`, dan
perubahan bentuk monitoring. Perbarui bersamaan dengan patch B-1 agar frontend tidak
menebak.

---

## Kontrak yang sudah tersedia (dipakai frontend)

```jsonc
// GET /kgb-requests/monitoring (tambahan, kompatibel)
{
  "employee": { "...": "..." },
  "lastKgb": { "...": "hanya KGB final terakhir" },
  "nextKgbDate": "2026-01-15",
  "monthsUntil": -2,
  "dueSoon": false,
  "isOverdue": true,
  "requiredDocs": ["SK_CPNS_TERAKHIR", "..."]
}

// POST /kgb-requests/reminders/generate
[
  {
    "employee": "Nama",
    "nextKgbDate": "2026-01-15",
    "monthsUntil": -2,
    "isOverdue": true,
    "notified": 4
  }
]
```

Field terstruktur untuk nomor surat (pilih salah satu):

```jsonc
// detail cuti/KGB
"registerNumber": "800/001/KT/XI/2026",
"registerDate": "2026-11-01"
```

---

## Matriks penerimaan per role

| Role | Skenario | Hasil yang diharapkan |
|---|---|---|
| EMPLOYEE | Buat cuti, simpan draft tanpa berkas, unggah, ajukan | Draft tersimpan; submit hanya lolos setelah 2 berkas + SK |
| EMPLOYEE | Ajukan KGB, dapat revisi, perbaiki | Bisa edit nilai + unggah berkas + submit ulang |
| VERIFIER | Dashboard setelah Camat approve | Angka “siap registrasi” bertambah; filter APPROVED benar |
| VERIFIER | Buka cuti APPROVED, catat surat jawaban, terima hasil | Status maju ke COMPLETED; dokumen bisa diunduh |
| SUPERVISOR (Kasi) | Beri pertimbangan | Hanya melihat antrean SUBMITTED; tidak melihat tombol create |
| SUPERVISOR (Kasubag) | Verifikasi | Antrean REVIEWED; bisa minta revisi/tangguhkan |
| LEADER (Sekcam) | Paraf cuti/KGB | Antrean VERIFIED; tidak bisa approve |
| LEADER (Camat) | Approve + tanda tangan | Status APPROVED; surat final; tanda tangan tercatat di timeline |
| Semua | Buka file PDF/foto | Terunduh utuh, nama file benar |
| Semua | Diamkan 20 menit lalu simpan form | Tetap berhasil (refresh otomatis) |
