# 08 — Requirement Pengajuan Pensiun PNS

> Sumber: SOP Pengajuan Pensiun PNS Kecamatan Tamalate (8 langkah).
> Status: backend selesai; frontend belum diubah (lihat `09-frontend-pensiun-handoff.md`).
> Tanggal acuan: 1 November 2026.

## 1. Keputusan desain

| Keputusan | Alasan |
|---|---|
| Satu **berkas usulan** (`PensionBatch`) berisi banyak PNS (`PensionItem`) | SOP berbicara tentang daftar nominatif/berkas usulan, bukan satu surat per pegawai. Paraf, tanda tangan, nomor surat, ekspedisi, dan tanda terima cukup sekali per berkas. |
| Nomor usulan `PENSIUN-YYYY-NNNN` | Mudah dicari dan tidak bergantung pada nomor surat keluar. |
| BUP default **58 tahun**, dapat diubah lewat `PENSION_BUP_AGE` | Regulasi umum PNS; beberapa jabatan dapat berbeda. Nilai juga bisa dikirim per request `bupAge`. |
| Checklist dokumen bersifat **human-in-the-loop** | Jenis dokumen dapat berbeda per kasus. Petugas melihat checklist, mengunggah dokumen, lalu mencentang “dokumen lengkap” saat verifikasi. |
| Surat keluar dapat dibuat otomatis saat langkah 6 | Memakai modul surat keluar + aturan buffer 3 nomor yang sudah ada. Frontend juga boleh memilih surat keluar yang sudah dibuat. |
| Tidak menambah role | Kasubag tetap `SUPERVISOR` + GRANT; Sekcam/Camat tetap `LEADER`; pendistribusi tetap `VERIFIER`. |

## 2. Pemetaan SOP ke status dan endpoint

| Langkah SOP | Pelaksana | Aksi sistem | Status setelah aksi |
|---|---|---|---|
| 1. Pendataan PNS memasuki BUP | Kasubag Umum & Kepegawaian | `GET /pension-requests/bup` | — |
| 2. Membuat draf daftar usulan + buku register | Kasubag | `POST /pension-requests`, `POST /pension-requests/:id/items`, `GET /pension-requests/nominative` | `DRAFT` |
| 3. Verifikasi dokumen kelengkapan | Kasubag | upload dokumen per item, lalu `POST /pension-requests/:id/verify` dengan `documentsComplete: true` | `VERIFIED` |
| 4. Verifikasi dan paraf draf usulan | Sekcam | `POST /pension-requests/:id/paraf` | `PARAF` |
| 5. Validasi dan tanda tangan surat pengusulan | Camat | `POST /pension-requests/:id/approve` | `APPROVED` |
| 6. Catat buku agenda surat keluar, beri nomor + stempel | Kasubag | `POST /pension-requests/:id/register` | `REGISTERED` |
| 7. Catat buku ekspedisi, serahkan ke pendistribusi | Kasubag | `POST /pension-requests/:id/expedite` | `EXPEDITED` |
| 8. Kirim ke BKPSDMD + tanda terima | Pendistribusi/operator | `POST /pension-requests/:id/send` | `SENT` |
| Penutupan opsional | Kasubag | `POST /pension-requests/:id/complete`, lalu `.../archive` | `COMPLETED` / `ARCHIVED` |

Jalur kembali:

- `POST /pension-requests/:id/revise` — dari `VERIFIED`/`PARAF` ke `REVISION`; catatan wajib.
- `POST /pension-requests/:id/reject` — dari `VERIFIED`/`PARAF` ke `REJECTED`; catatan wajib.
- Dari `REVISION`, Kasubag dapat menambah item/dokumen lalu `verify` lagi.

## 3. Aktor dan permission

| Permission | VERIFIER | SUPERVISOR | KASUBAG (grant) | LEADER | EMPLOYEE |
|---|---:|---:|---:|---:|---:|
| `pension.view` | ya | ya | ya | ya | ya (hanya miliknya) |
| `pension.create` | ya | - | ya | - | - |
| `pension.document.upload` | ya | - | ya | - | - |
| `pension.verify` | - | - | ya | - | - |
| `pension.revise` | - | - | ya | ya | - |
| `pension.paraf` | - | - | - | ya (khusus SEKCAM) | - |
| `pension.approve` | - | - | - | ya (khusus CAMAT) | - |
| `pension.reject` | - | - | ya | ya | - |
| `pension.register` | - | - | ya | - | - |
| `pension.expedite` | - | - | ya | - | - |
| `pension.send` | ya | - | - | - | - |

Catatan:

- `LEADER` memegang `paraf` dan `approve`, tetapi backend menolak `paraf` bila jabatan bukan `SEKCAM`, dan menolak `approve` bila jabatan bukan `CAMAT`.
- `register` dan `expedite` hanya untuk user `orgUnit = KEC-TAMALATE`.
- Pegawai hanya dapat melihat usulan yang memuat dirinya; daftar BUP, register, nominatif, dan ekspedisi hanya untuk petugas.

## 4. Aturan BUP

- Tanggal pensiun = tanggal lahir + `bupAge` (default 58), tepat pada hari ulang tahun.
- `GET /pension-requests/bup?year=2026` memakai rentang 1 Januari–31 Desember 2026.
- Bisa memakai `from`/`to` (YYYY-MM-DD) dan `bupAge` (50–65).
- Pegawai tanpa `birthDate` tidak dimasukkan ke daftar; jumlahnya muncul di `meta.missingBirthDate`.
- `existingItem` menunjukkan PNS sudah ada di usulan lain yang belum `REJECTED/ARCHIVED`.
- `yearsOfService` dihitung pada tanggal pensiun.

## 5. Checklist dokumen

Dokumen yang ditampilkan:

1. `SK_CPNS`
2. `SK_PNS`
3. `SK_PANGKAT_TERAKHIR`
4. `SK_JABATAN_TERAKHIR`
5. `KTP`
6. `KK`
7. `NPWP`
8. `REKENING_GAJI`
9. `PAS_FOTO`
10. `SKP_2_TAHUN`
11. `SURAT_KETERANGAN_SEHAT`
12. `SURAT_PERNYATAAN`
13. `LAINNYA` (dokumen tambahan)

Upload: `POST /pension-requests/:id/items/:itemId/documents` (`multipart/form-data`, field `file`, field `docType`). Jika `docType` sama diunggah lagi, dokumen lama diganti. Upload hanya saat `DRAFT/REVISION`.

## 6. Buku dan kolom

### Buku register usulan

`GET /pension-requests/register?year=2026`

Kolom: nomor usulan, periode, jumlah pegawai, daftar pegawai, nomor surat keluar, tanggal surat, nomor agenda, nomor ekspedisi, tanggal ekspedisi, nomor tanda terima, tanggal tanda terima, status.

### Daftar nominatif

`GET /pension-requests/nominative?year=2026&month=11`

Kolom: nomor, nomor usulan, nama, NIP, golongan, jabatan, unit kerja, tanggal lahir, tanggal pensiun, usia BUP, masa kerja, jenis pensiun, status item, checklist dokumen, nomor surat, nomor agenda, tanda terima.

### Buku ekspedisi

`GET /pension-requests/expedition-book?year=2026`

Kolom: tanggal ekspedisi, nomor ekspedisi, nomor surat, tujuan, penerima/pendistribusi, jumlah pegawai, status, catatan.

## 7. Penomoran dan surat keluar

Saat `register`, backend dapat:

1. Memakai `outgoingLetterId` dari surat keluar yang sudah ada; atau
2. Memakai `outgoingLetterNumber`/`agendaNumber` manual; atau
3. Membuat surat keluar otomatis (default bila tidak ada ID/nomor):
   - klasifikasi default `800.1.6.6` (Pensiun ASN),
   - tujuan default `BKPSDMD Kota Makassar`,
   - perihal default `Usulan Pensiun PNS <periode>`,
   - nomor memakai `allocateOutgoingSequence` dan buffer backdate 3 nomor yang sudah ada.

Frontend **tidak perlu** menekan tombol “reservasi 3 nomor”; buffer dibuat otomatis oleh service penomoran saat tanggal surat berganti.

## 8. Notifikasi

Setiap transisi membuat notifikasi `type = PENSIUN`, `referenceType = pension_batch`, `referenceId = <id usulan>` untuk:

- pemegang tahap berikutnya (Sekcam saat `verify`, Camat saat `paraf`, Kasubag saat `approve`, dan seterusnya),
- user pegawai yang tercantum di usulan.

Aktor yang melakukan aksi tidak dikirimi notifikasi.

## 9. Batasan / asumsi yang perlu dikonfirmasi

- Usia BUP default 58; jika instansi memakai 60 untuk jabatan tertentu, ubah `PENSION_BUP_AGE` atau kirim `bupAge` saat membuat/melihat BUP.
- Satu periode dapat memiliki lebih dari satu berkas usulan; belum ada unique constraint `(periodYear, periodMonth)`.
- Verifikasi dokumen tidak memblokir jika checklist belum lengkap; petugas wajib mencentang `documentsComplete`.
- Tanda tangan masih berupa pencatatan status (`APPROVED`), belum integrasi TTE.
- Arsip pensiun belum otomatis membuat `ArchiveRecord`; bila diperlukan, gunakan modul arsip yang sudah ada.
