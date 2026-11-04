# 12 — Tindak Lanjut Frontend → Backend

Tanggal: 4 November 2026
Status: perbaikan frontend selesai; tindak lanjut backend sudah diterapkan
(lihat bagian **Resolusi backend** di bawah).
Catatan: bagian awal dokumen ini adalah audit dari frontend; perubahan backend
dicatat pada bagian resolusi.

## Sudah diperbaiki di frontend

### Dari pesan backend (kontrak buku kenaikan pangkat)

- **P0 — buku register/arsip/nominatif crash.** Ketiga halaman sekarang memakai
  tipe dan response flat:
  - `PromotionRegisterRow` → `jumlahPegawai`, `pegawai[].name`, `nomorSurat`,
    `nomorAgenda`, `nomorArsip`, `tanggalArsip`, `periodLabel`.
  - `PromotionArchiveRow` → `jumlahPegawai`, `pegawai[].employeeName`,
    `tanggalArsip`, `nomorArsip`, `kategori`, `lokasi`, `tujuan`.
  - `PromotionNominativeRow` → satu baris per item, memakai `itemStatus` /
    `itemStatusLabel` (bukan `status`), `currentRankTmt`, `effectiveDate`,
    `documentsChecklist`, `missingDocuments`.
  - Tidak ada lagi akses `r.items.length`, `r.items.map`, atau `batch.items.map`.
- **P0 — textarea revisi/penolakan tidak muncul.** Syarat `note &&` dihapus;
  textarea sekarang muncul selama aksi `revise`/`reject` tersedia.
- **P1 — edit item.** Ditambahkan input `type="date"` untuk TMT Pangkat,
  nilai `currentRankTmt` dikirim sebagai `YYYY-MM-DD` (`.slice(0, 10)`),
  error 422 ditampilkan lewat toast, tombol Simpan dinonaktifkan saat menyimpan.
- **P1 — kolom TMT.** Tabel item memisahkan **TMT Pangkat**
  (`currentRankTmt`) dan **TMT Kenaikan** (`effectiveDate`).
- **P1 — halaman calon.** Ada checkbox per ASN, select-all, panel periode
  (tahun/bulan/catatan), tombol **Buat Draf Usulan**, redirect ke detail,
  dan `existingItem` menjadi tautan ke `/kenaikan-pangkat/{batchId}`.
  Checkbox dinonaktifkan bila `existingItem`, `missingRankTmt`, atau
  `eligible !== true`.
- **P2 — akses & akun demo.** Tautan petugas (Daftar Calon, Buku Register,
  Nominatif, Buku Arsip) disembunyikan untuk `EMPLOYEE`. Tombol demo
  `pangkat1` dan `pensiun1` tersedia di halaman login.

### Tambahan dari audit hak akses

- Menu dan halaman **KGB Monitoring**, **KGB Buku Register**,
  **Surat Masuk Buku Agenda**, dan **Surat Masuk Buku Ekspedisi**
  disembunyikan untuk `EMPLOYEE` (guard `denyForEmployee`), termasuk tombol
  pintasan di halaman daftar.
- Halaman buku pensiun dan kenaikan pangkat sudah memakai guard yang sama,
  konsisten dengan `employeeOnlyBooks()` di backend.

## Perlu tindakan backend

### P0 — data KGB seluruh pegawai terbuka untuk EMPLOYEE

- Endpoint:
  - `GET /api/v1/kgb-requests/monitoring`
  - `GET /api/v1/kgb-requests/register-book`
- Bukti: login `pegawai1` (EMPLOYEE) → keduanya **200**, masing-masing
  mengembalikan **9** dan **13** baris seluruh pegawai.
- Frontend sudah menyembunyikan menu/halaman, tetapi API masih bisa dipanggil
  langsung.
- Mohon: kembalikan **403** untuk `EMPLOYEE`, atau scope ke `employeeId`
  sendiri. Untuk buku register, pertimbangkan `requirePermission('kgb.register')`.

### P0 — buku surat masuk terbuka untuk EMPLOYEE

- Endpoint:
  - `GET /api/v1/letters/register-book` → **41 baris** sebagai `pegawai1`
  - `GET /api/v1/letters/expedition-book` → **7 baris** sebagai `pegawai1`
- Frontend sudah menyembunyikan menu/halaman untuk `EMPLOYEE`.
- Mohon: **403** untuk `EMPLOYEE`; pertimbangkan `letter.register` untuk
  register-book dan `letter.expedition` untuk expedition-book, atau scope
  sesuai keterlibatan pegawai.

### P0 — Prisma client stale menyebabkan 500 kenaikan pangkat

- Gejala: `GET /api/v1/promotion-requests` → **500** untuk semua role;
  `prisma.promotionBatch` undefined.
- Penyebab: generated client di `backend/src/generated/prisma` (gitignored)
  belum memuat model Promotion.
- Tindakan sementara: `npx prisma generate` sudah dijalankan; endpoint kembali
  normal. Ini bukan perubahan source backend.
- Mohon: pastikan `prisma generate` berjalan otomatis pada `predev`,
  `prebuild`, atau `postinstall`, dan pada pipeline deploy, agar kejadian ini
  tidak berulang.

## Perlu konfirmasi / P1

1. **Operator belum bisa membuat cuti/KGB untuk pegawai lain.**
   `VERIFIER` tidak memiliki `leave.create` dan `kgb.create` pada
   `backend/prisma/seed.ts` (ROLE_MAP), padahal `docs/07-frontend-handoff.md`
   P1-1 menyebut operator perlu membuat untuk orang lain. Frontend otomatis
   menampilkan tombol bila permission tersedia; saat ini tombol tersebut tidak
   muncul untuk `VERIFIER`. Mohon grant permission atau konfirmasi policy.
2. **Scope buku surat untuk SUPERVISOR/LEADER.**
   `register-book` dan `expedition-book` memakai `letter.view` tanpa scope,
   sehingga SUPERVISOR/LEADER melihat seluruh surat. Frontend menampilkan
   sesuai permission saat ini. Mohon konfirmasi apakah perlu scope unit.
3. **Konsistensi status item vs status batch di nominatif.**
   Frontend sudah memakai `itemStatus`; mohon pastikan field itu tetap
   dipertahankan pada response `GET /promotion-requests/nominative`.

## Yang tidak diubah oleh frontend

- Tidak ada perubahan pada `backend/src/routes/*`, `backend/prisma/*`, atau
  `backend/package.json` pada tindak lanjut frontend ini.
- Tidak ada commit/push dari frontend.

---

## Resolusi backend (4 November 2026)

- **KGB monitoring & register-book**: `EMPLOYEE` sekarang mendapat `403`.
  `VERIFIER`, `SUPERVISOR`, dan `LEADER` tetap `200` karena buku ini masih
  dipakai sebagai laporan read-only. Guard ada di
  `backend/src/routes/kgb.routes.ts`.
- **Buku surat masuk & ekspedisi**: `EMPLOYEE` sekarang mendapat `403`.
  `VERIFIER`, `SUPERVISOR`, dan `LEADER` tetap `200`. Guard ada di
  `backend/src/routes/letter.routes.ts`.
- **Prisma generate**: `backend/package.json` sekarang menjalankan
  `prisma generate` lewat `predev`, `prebuild`, dan `postinstall`. Pipeline
  deploy harus menjalankan `npm ci` (termasuk devDependencies) lalu
  `npm run build` sebelum `npm start`, dengan environment `DIRECT_URL`
  tersedia karena `prisma.config.ts` membacanya. Jika pipeline memakai
  `npm ci --omit=dev`, generate harus dilakukan di build stage atau
  `prisma` dipindahkan ke dependencies.
- **Operator cuti/KGB**: `VERIFIER` sudah diberi `leave.create` dan
  `kgb.create`. `leave.submit`/`kgb.submit` sengaja tetap milik `EMPLOYEE`;
  operator menyiapkan draf + dokumen, lalu pegawai mengajukan. Jika operator
  juga harus mengajukan, perlu keputusan policy dan grant tambahan.
- **Scope buku surat**: untuk saat ini tidak perlu scope unit karena
  deployment hanya satu unit (`KEC-TAMALATE`) dan `IncomingLetter` belum
  memiliki `orgUnitId`. Jika sistem menjadi multi-unit, scope unit perlu
  ditambahkan bersama perubahan schema.
- **Nominatif kenaikan pangkat**: field `itemStatus` dan `itemStatusLabel`
  dipertahankan pada response `GET /promotion-requests/nominative`.

Verifikasi: `npm run typecheck`, `npm run build`, `npm run prisma:seed`, dan
smoke test API (`EMPLOYEE` 403; `VERIFIER`, `SUPERVISOR`, `LEADER` 200)
lulus. Tidak ada commit/push.
