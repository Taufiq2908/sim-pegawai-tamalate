# 10 — Requirement Pengajuan Kenaikan Pangkat ASN

> Sumber: SOP Pengusulan Kenaikan Pangkat ASN Kecamatan Tamalate (8 langkah).
> Status: backend selesai dan sudah diuji end-to-end; frontend belum diubah.
> Dokumen instruksi frontend: `11-frontend-kenaikan-pangkat-handoff.md`.
> Tanggal acuan: 1 November 2026.

## 1. Keputusan desain

| Keputusan | Alasan |
|---|---|
| Satu **berkas usulan** (`PromotionBatch`) berisi banyak ASN (`PromotionItem`) | SOP berbicara tentang daftar usulan/berkas, bukan satu surat per pegawai. Paraf, tanda tangan, nomor surat, register, dan arsip cukup sekali per berkas. |
| Nomor usulan `PANGKAT-YYYY-NNNN` | Mudah dicari dan terpisah dari nomor surat keluar. |
| Status mengikuti 8 langkah SOP | `DRAFT → LEGALIZED → VERIFIED → PARAF → APPROVED → REGISTERED → ARCHIVED`, plus `REVISION`/`REJECTED`. |
| `rankTmt` (TMT pangkat terakhir) ditambahkan ke `Employee` | Diperlukan untuk menghitung masa jabatan dan daftar calon. Bila data master kosong, petugas dapat mengirim `currentRankTmt` saat membuat/mengubah item; backend menyimpannya ke master. |
| Masa jabatan minimal default **4 tahun** | Aturan umum kenaikan pangkat reguler. Dapat diubah dengan `PROMOTION_MIN_YEARS` atau query `minYears` pada daftar calon. |
| TMT kenaikan default tanggal 1 bulan periode | Bila `effectiveDate` tidak dikirim, backend memakai tanggal 1 pada `periodMonth`; jika bulan kosong dipakai 1 April. Frontend sebaiknya tetap mengirim `effectiveDate` eksplisit. |
| Checklist dokumen **human-in-the-loop** | Jenis/kelengkapan dokumen dapat berbeda per berkas. Sistem menampilkan checklist dan menyimpan unggahan; Kasubag tetap mencentang “dokumen lengkap” sebelum `verify`. |
| Surat keluar dapat dibuat otomatis saat langkah 7 | Memakai modul surat keluar, klasifikasi `800.1.3.2`, penomoran, dan buffer backdate 3 nomor yang sudah ada. Frontend tidak boleh membuat reservasi nomor sendiri. |
| Arsip dibuat otomatis saat langkah 8 | Jika sudah ada surat keluar, backend membuat `ArchiveRecord` dan menghubungkannya ke surat keluar. Frontend tetap dapat memakai modul arsip untuk mengubah kategori/lokasi. |
| Tidak menambah role | Staf Kepegawaian = `VERIFIER`; Kasubag = `SUPERVISOR` + GRANT; Sekcam/Camat = `LEADER`; pegawai = `EMPLOYEE`. |

## 2. Pemetaan SOP ke status dan endpoint

| Langkah SOP | Pelaksana | Aksi sistem | Status setelah aksi |
|---|---|---|---|
| 1. Mendata dan mengusulkan ASN yang akan naik pangkat | Staf Kepegawaian | `GET /promotion-requests/candidates` | — |
| 2. Membuat daftar usulan kenaikan pangkat | Staf Kepegawaian | `POST /promotion-requests`, `POST /promotion-requests/:id/items`, `PATCH .../items/:itemId` | `DRAFT` |
| 3. Menyiapkan berkas lampiran yang akan dilegalisasi + cap/stempel | Staf Kepegawaian | unggah dokumen, lalu `POST /promotion-requests/:id/legalize` | `LEGALIZED` |
| 4. Verifikasi dan validasi draf + kelengkapan berkas legalisasi | Kasubag Umum & Kepegawaian | `POST /promotion-requests/:id/verify` dengan `documentsComplete: true` | `VERIFIED` |
| 5. Verifikasi, validasi, dan paraf draf usulan | Sekretaris Camat | `POST /promotion-requests/:id/paraf` | `PARAF` |
| 6. Verifikasi dan tanda tangan berkas usulan | Camat | `POST /promotion-requests/:id/approve` | `APPROVED` |
| 7. Registrasi surat dan kirim ke BKPSDM | Staf Kepegawaian | `POST /promotion-requests/:id/register` | `REGISTERED` |
| 8. Arsipkan surat usulan | Staf Kepegawaian | `POST /promotion-requests/:id/archive` | `ARCHIVED` |

Jalur kembali:

- `POST /promotion-requests/:id/revise` — dari `LEGALIZED`/`VERIFIED`/`PARAF` ke `REVISION`; catatan wajib.
- `POST /promotion-requests/:id/reject` — dari `LEGALIZED`/`VERIFIED`/`PARAF` ke `REJECTED`; catatan wajib.
- Revisi/penolakan pada `LEGALIZED` hanya oleh Kasubag, pada `VERIFIED` hanya oleh Sekcam, pada `PARAF` hanya oleh Camat.
- Dari `REVISION`, Staf Kepegawaian dapat memperbaiki item/dokumen lalu menjalankan `legalize` lagi.

## 3. Aktor dan permission

| Permission | VERIFIER | SUPERVISOR | KASUBAG (grant) | LEADER | EMPLOYEE |
|---|---:|---:|---:|---:|---:|
| `promotion.view` | ya | ya | ya | ya | ya (hanya miliknya) |
| `promotion.create` | ya | - | - | - | - |
| `promotion.document.upload` | ya | - | - | - | - |
| `promotion.legalize` | ya | - | - | - | - |
| `promotion.verify` | - | - | ya | - | - |
| `promotion.revise` | - | - | ya | ya | - |
| `promotion.paraf` | - | - | - | ya (khusus SEKCAM) | - |
| `promotion.approve` | - | - | - | ya (khusus CAMAT) | - |
| `promotion.reject` | - | - | ya | ya | - |
| `promotion.register` | ya | - | - | - | - |
| `promotion.archive` | ya | - | - | - | - |

Catatan:

- `legalize`, `register`, dan `archive` hanya untuk user dengan `orgUnit = KEC-TAMALATE`.
- `paraf` ditolak backend bila jabatan bukan `SEKCAM`; `approve` ditolak bila jabatan bukan `CAMAT`.
- Pegawai hanya dapat melihat usulan yang memuat dirinya. Daftar calon, register, nominatif, dan buku arsip hanya untuk petugas.
- `availableActions` dari detail adalah sumber kebenaran tombol aksi. Tetap tangani 403/409.

## 4. Aturan daftar calon

`GET /promotion-requests/candidates?periodYear=2026`

- Default `employmentStatus=PNS`, hanya pegawai aktif.
- Default hanya menampilkan ASN yang sudah memenuhi `minYears` (default 4) pada `asOf` (default hari ini).
- `includeAll=true` menampilkan juga yang belum jatuh tempo dan yang belum punya `rankTmt`.
- `asOf=YYYY-MM-DD` untuk simulasi tanggal; `minYears` 0–15; `orgUnit=KEC-TAMALATE` untuk filter unit.
- `dueDate = rankTmt + minYears`; `eligible = dueDate <= asOf`.
- `existingItem` menandakan ASN sudah ada di usulan lain yang belum `REJECTED/ARCHIVED`.
- `suggestedTargetRank` dihitung dari urutan golongan `I/a` sampai `IV/e`.
- Pegawai tanpa `rankTmt` tetap dapat diusulkan dengan mengirim `currentRankTmt` saat membuat item; backend akan menyimpan koreksi tersebut ke master pegawai.

## 5. Checklist dokumen

Checklist mutu baku SOP:

1. `DAFTAR_USUL` — Daftar Usul Mulai Kenaikan Pangkat ASN
2. `SK_CPNS` — SK CPNS
3. `SK_PNS` — SK PNS/ASN
4. `SK_TERAKHIR` — SK Terakhir
5. `SKP_3_TAHUN` — SKP 3 Tahun Terakhir
6. `KARPEG_NIP_BARU` — Karpeg + NIP Baru
7. `IJAZAH_TRANSKRIP` — Ijazah Terakhir + Transkrip Nilai yang Telah Disahkan
8. `SK_MUTASI` — SK Mutasi
9. `SK_KENAIKAN_PANGKAT_TERAKHIR` — SK Kenaikan Pangkat Terakhir
10. `SK_JABATAN_ATASAN` — SK Jabatan Atasan
11. `LAINNYA` — dokumen tambahan

Upload: `POST /promotion-requests/:id/items/:itemId/documents` (`multipart/form-data`, field `file`, field `docType`). Jika `docType` sama diunggah lagi, dokumen lama diganti. Upload/hapus hanya saat `DRAFT/REVISION`.

## 6. Buku dan kolom

### Buku register

`GET /promotion-requests/register?year=2026`

Kolom: nomor usulan, periode, jumlah pegawai, daftar pegawai (nama, NIP, golongan saat ini → golongan diusulkan, TMT, status item), nomor surat, tanggal surat, nomor agenda, nomor arsip, tanggal arsip, status.

### Daftar nominatif

`GET /promotion-requests/nominative?year=2026&month=11`

Kolom: nomor, nomor usulan, nama, NIP, golongan saat ini, TMT pangkat saat ini, golongan diusulkan, TMT kenaikan, masa jabatan, jabatan, unit kerja, status item, checklist dokumen, nomor surat, nomor agenda, nomor arsip.

### Buku arsip

`GET /promotion-requests/archive-book?year=2026`

Kolom: tanggal arsip, nomor arsip, nomor usulan, nomor surat, tujuan, kategori, lokasi, jumlah pegawai, daftar pegawai, status.

## 7. Penomoran, surat keluar, dan arsip

Saat `register`, backend dapat:

1. Memakai `outgoingLetterId` dari surat keluar yang sudah ada; atau
2. Memakai `outgoingLetterNumber`/`agendaNumber` manual; atau
3. Membuat surat keluar otomatis (default bila tidak ada ID/nomor):
   - klasifikasi default `800.1.3.2` (Kenaikan pangkat/golongan),
   - tujuan default `BKPSDMD Kota Makassar`,
   - perihal default `Usulan Kenaikan Pangkat ASN <periode>`,
   - penandatangan default Camat aktif,
   - nomor memakai `allocateOutgoingSequence` dan buffer backdate 3 nomor yang sudah ada.

`registeredAt` dan `sentAt` diisi saat `register`. Jika `sentAt` tidak dikirim, dipakai waktu server.

Saat `archive`, jika ada surat keluar dan belum punya arsip, backend membuat `ArchiveRecord`:

- `sourceType = OUTGOING`,
- judul = perihal surat keluar,
- nomor dokumen = nomor surat keluar,
- kategori default `AKTIF` (bisa `PENTING`/`INAKTIF`),
- kode default dari klasifikasi surat,
- `retentionUntil` opsional dan tidak boleh sebelum tanggal arsip.

## 8. Batasan yang perlu diketahui

- Belum ada endpoint admin untuk mengubah `Employee.rankTmt`; koreksi dapat dikirim per item (`currentRankTmt`) dan akan disimpan ke master.
- Belum ada perhitungan otomatis kenaikan gaji pokok setelah pangkat naik; modul KGB tetap terpisah.
- Belum ada generator dokumen/PDF “Surat Pengusulan Kenaikan Pangkat”; yang dibuat adalah data surat keluar + nomor + arsip. Cetak dokumen mengikuti pola surat keluar yang sudah ada.
- `SKP` dinilai manual oleh petugas; sistem hanya menyimpan checklist unggahan dan keputusan verifikasi.
