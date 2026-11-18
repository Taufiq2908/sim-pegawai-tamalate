# 08 — Requirement Pengajuan Pensiun PNS

> Sumber: SOP Pengajuan Pensiun PNS Kecamatan Tamalate (8 langkah).
> Status: backend + frontend selesai; ekspedisi memakai Buku Ekspedisi Surat Keluar bersama.
> Tanggal acuan: 1 November 2026; revisi ekspedisi 16 November 2026.

## 1. Keputusan desain

| Keputusan | Alasan |
|---|---|
| Satu **berkas usulan** (`PensionBatch`) berisi banyak PNS (`PensionItem`) | SOP berbicara tentang daftar nominatif/berkas usulan, bukan satu surat per pegawai. Paraf, tanda tangan, nomor surat, ekspedisi, dan tanda terima cukup sekali per berkas. |
| Nomor usulan `PENSIUN-YYYY-NNNN` | Mudah dicari dan tidak bergantung pada nomor surat keluar. |
| BUP default **58 tahun**, dapat diubah lewat `PENSION_BUP_AGE` | Regulasi umum PNS; beberapa jabatan dapat berbeda. Nilai juga bisa dikirim per request `bupAge`. |
| Checklist dokumen bersifat **human-in-the-loop** | Jenis dokumen dapat berbeda per kasus. Petugas melihat checklist, mengunggah dokumen, lalu mencentang “dokumen lengkap” saat verifikasi. |
| Surat keluar dapat dibuat otomatis saat langkah 6 | Memakai modul surat keluar + aturan buffer 3 nomor yang sudah ada. Frontend juga boleh memilih surat keluar yang sudah dibuat. |
| Ekspedisi memakai `ekspedisi_surat_keluar` bersama | Buku ekspedisi surat keluar adalah buku tersendiri, bukan tabel khusus pensiun. `register` menyiapkan baris `BELUM_DIKIRIM`; `expedite` mencatat serah terima caraka; `send` mencatat bukti terima BKPSDMD. |
| Tidak menambah role | Kasubag tetap `SUPERVISOR` + GRANT; Sekcam/Camat tetap `LEADER`; pendistribusi tetap `VERIFIER`. |

## 2. Pemetaan SOP ke status dan endpoint

| Langkah SOP | Pelaksana | Aksi sistem | Status setelah aksi |
|---|---|---|---|
| 1. Pendataan PNS memasuki BUP | Staf Kepegawaian | `GET /pension-requests/bup` | — |
| 2. Membuat draf daftar usulan + buku register | Staf Kepegawaian | `POST /pension-requests`, `POST /pension-requests/:id/items`, `GET /pension-requests/nominative` | `DRAFT` |
| 3. Verifikasi dokumen kelengkapan | Staf Kepegawaian mengunggah; Kasubag memverifikasi | upload dokumen per item, lalu `POST /pension-requests/:id/verify` dengan `documentsComplete: true` | `VERIFIED` |
| 4. Verifikasi dan paraf draf usulan | Sekcam | `POST /pension-requests/:id/paraf` | `PARAF` |
| 5. Validasi dan tanda tangan surat pengusulan | Camat | `POST /pension-requests/:id/approve` | `APPROVED` |
| 6. Catat buku agenda surat keluar, beri nomor + stempel | Staf Kepegawaian | `POST /pension-requests/:id/register` — membuat/memilih surat keluar, mencatat agenda, dan menyiapkan baris ekspedisi `BELUM_DIKIRIM` | `REGISTERED` |
| 7. Catat buku ekspedisi, serahkan ke pendistribusi | Staf Kepegawaian | `POST /pension-requests/:id/expedite` — mengisi tanggal serah terima + nama caraka pada `ekspedisi_surat_keluar` | `EXPEDITED` |
| 8. Kirim ke BKPSDMD + tanda terima | Pendistribusi/Staf Kepegawaian | `POST /pension-requests/:id/send` — mencatat nomor/tanggal bukti terima dan nama penerima; status ekspedisi menjadi `DITERIMA` | `SENT` |
| Penutupan opsional | Staf Kepegawaian | `POST /pension-requests/:id/complete`, lalu `.../archive` | `COMPLETED` / `ARCHIVED` |

Jalur kembali:

- `POST /pension-requests/:id/revise` — dari `VERIFIED`/`PARAF` ke `REVISION`; catatan wajib.
- `POST /pension-requests/:id/reject` — dari `VERIFIED`/`PARAF` ke `REJECTED`; catatan wajib.
- Dari `REVISION`, Staf Kepegawaian memperbaiki/menambah dokumen, lalu Kasubag `verify` lagi.

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
| `pension.register` | ya | - | - | - | - |
| `pension.expedite` | ya | - | - | - | - |
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

Dokumen yang ditampilkan dan diminta untuk demo:

1. `DPCP` — Data Perorangan Calon Penerima Pensiun
2. `SK_PNS`
3. `SK_PANGKAT_TERAKHIR`
4. `SK_JABATAN_TERAKHIR`

Dokumen lama (`SK_CPNS`, `KTP`, `KK`, `NPWP`, `REKENING_GAJI`, `PAS_FOTO`,
`SKP_2_TAHUN`, `SURAT_KETERANGAN_SEHAT`, `SURAT_PERNYATAAN`) tetap disimpan di
database bila sudah pernah diunggah, tetapi tidak lagi ditampilkan, tidak
dihitung sebagai kekurangan, dan tidak perlu diunggah.

Upload backend tetap per berkas: `POST /pension-requests/:id/items/:itemId/documents`
(`multipart/form-data`, field `file`, field `docType`). Frontend menyediakan
pemilih beberapa berkas sekaligus dan satu tombol **Unggah semua**; frontend
mengirim berkas yang dipilih satu per satu ke endpoint tersebut. Jika `docType`
sama diunggah lagi, dokumen lama diganti. Upload hanya saat `DRAFT/REVISION`.

## 6. Buku dan kolom

### Buku register usulan

`GET /pension-requests/register?year=2026`

Kolom: nomor usulan, periode, jumlah pegawai, daftar pegawai, nomor surat keluar, tanggal surat, nomor agenda, nomor ekspedisi, tanggal ekspedisi, nomor tanda terima, tanggal tanda terima, status.

### Daftar nominatif

`GET /pension-requests/nominative?year=2026&month=11`

Kolom: nomor, nomor usulan, nama, NIP, golongan, jabatan, unit kerja, tanggal lahir, tanggal pensiun, usia BUP, masa kerja, jenis pensiun, status item, checklist dokumen, nomor surat, nomor agenda, tanda terima.

### Buku ekspedisi

`GET /pension-requests/expedition-book?year=2026&from=&to=`

Tampilan terfilter dari `ekspedisi_surat_keluar` untuk surat usulan pensiun.
Kolom: nomor registrasi, tanggal diserahkan, nomor surat, tanggal surat, tujuan,
caraka/pendistribusi, jumlah pegawai, status ekspedisi (`BELUM_DIKIRIM`/`DIKIRIM`/
`DITERIMA`), nomor + tanggal bukti terima, penerima, catatan.

Baris ini sama dengan yang tampil di **Buku Ekspedisi Surat Keluar** umum
(`GET /outgoing-letters/expedition-book`); halaman pensiun hanya memfilternya.

## 7. Penomoran dan surat keluar

Saat `register`, backend dapat:

1. Memakai `outgoingLetterId` dari surat keluar yang sudah ada; atau
2. Memakai `outgoingLetterNumber`/`agendaNumber` manual; atau
3. Membuat surat keluar otomatis (default bila tidak ada ID/nomor):
   - klasifikasi default `800.1.6.6` (Pensiun ASN),
   - tujuan default `BKPSDMD Kota Makassar`,
   - perihal default `Usulan Pensiun PNS <periode>`,
   - nomor memakai `allocateOutgoingSequence` dan buffer backdate 3 nomor yang sudah ada.

Bila surat keluar tersedia (dibuat atau dipilih), backend juga memanggil
`ensureOutgoingExpedition` untuk membuat baris `ekspedisi_surat_keluar` dengan
nomor `EXK-YYYY-NNNN` dan status `BELUM_DIKIRIM`. Body `expedite`:

```json
{
  "expeditionDate": "2026-11-16",
  "courierName": "Caraka Kecamatan",
  "note": "Diserahkan ke pendistribusi"
}
```

Body `send`:

```json
{
  "receiptNumber": "123/BKPSDMD/XI/2026",
  "receiptDate": "2026-11-16",
  "receivedByName": "Petugas BKPSDMD",
  "note": "Bukti terima sudah diterima"
}
```

Frontend **tidak perlu** menekan tombol “reservasi 3 nomor”; buffer dibuat otomatis oleh service penomoran saat tanggal surat berganti. Frontend juga tidak perlu mengisi nomor ekspedisi secara manual; nomor registrasi berasal dari service ekspedisi.

## 8. Notifikasi

Saat seluruh dokumen inti selesai diunggah, Kasubag menerima notifikasi
`PENSIUN_READY` untuk meminta verifikasi kelengkapan. Notifikasi ini dikirim sekali
per draf/revisi dan dikirim lagi setelah batch dikembalikan untuk revisi.

Setiap transisi membuat notifikasi `type = PENSIUN`, `referenceType = pension_batch`,
`referenceId = <id usulan>` untuk:

- pemegang tahap berikutnya: Sekcam saat `verify`, Camat saat `paraf`, lalu Staf
  Kepegawaian saat `approve`, `register`, dan `expedite`,
- user pegawai yang tercantum di usulan.

Notifikasi pensiun di halaman `/notifikasi` memiliki tombol **Buka pengajuan pensiun**
yang langsung menuju detail usulan. Aktor yang melakukan aksi tidak dikirimi notifikasi.

## 9. Batasan / asumsi yang perlu dikonfirmasi

- Usia BUP default 58; jika instansi memakai 60 untuk jabatan tertentu, ubah `PENSION_BUP_AGE` atau kirim `bupAge` saat membuat/melihat BUP.
- Satu periode dapat memiliki lebih dari satu berkas usulan; belum ada unique constraint `(periodYear, periodMonth)`.
- Verifikasi dokumen tidak memblokir jika checklist belum lengkap; petugas wajib mencentang `documentsComplete`.
- Tanda tangan masih berupa pencatatan status (`APPROVED`), belum integrasi TTE.
- Arsip pensiun belum otomatis membuat `ArchiveRecord`; bila diperlukan, gunakan modul arsip yang sudah ada.
