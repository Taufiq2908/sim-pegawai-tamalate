# 14 — Revisi Alur Surat Masuk, Surat Keluar, dan Arsip

Tanggal: 5 November 2026
Status: **backend selesai; migration/seed sudah diterapkan ke Supabase.
Frontend belum diimplementasikan; checklist pada §7 dipakai sebagai handoff.**

Dokumen ini menggantikan keputusan “tanpa status baru” pada `docs/13`.
Spesifikasi terbaru memakai status workflow eksplisit.

## 1. Status final

### Surat masuk

`DRAFT_TU → REVIEW_SEKCAM → DISPOSISI_CAMAT → DITERUSKAN → PROSES →
MENUNGGU_ARSIP → DIARSIPKAN`

| Status | Aktor | Aksi | Efek |
| --- | --- | --- | --- |
| `DRAFT_TU` | Pelaksana/TU (`VERIFIER`) | Simpan draft / unggah file | Surat belum dikirim |
| `DRAFT_TU` | Pelaksana/TU | Kirim ke Sekcam | `REVIEW_SEKCAM`, notifikasi Sekcam |
| `REVIEW_SEKCAM` | Sekcam | Teruskan ke Camat | `DISPOSISI_CAMAT`, notifikasi Camat |
| `DISPOSISI_CAMAT` | Camat | Isi instruksi + pilih target | `DITERUSKAN`, notifikasi target |
| `DITERUSKAN` | Penerima disposisi | Terima & Baca | `PROSES`, timestamp ekspedisi dibuat |
| `PROSES` | Penerima disposisi | Selesai & Ajukan Arsip | `MENUNGGU_ARSIP` jika **semua** target selesai |
| `MENUNGGU_ARSIP` | Sekcam/Camat | Setujui & Arsipkan | `DIARSIPKAN` + `ArchiveRecord` |
| `MENUNGGU_ARSIP` | Sekcam/Camat | Tolak/revisi | `PROSES`, disposisi target `DONE` dibuka kembali ke `ACCEPTED` (catatan Sekcam tidak diubah) |

Catatan multi-target: status `PROSES` muncul saat target pertama menerima.
Surat baru masuk `MENUNGGU_ARSIP` setelah **semua** disposisi berstatus `DONE`.
Satu surat tidak boleh diarsipkan sebelum seluruh target menyelesaikan tindak
lanjut.

### Surat keluar

`RESERVED → TERKIRIM → DIARSIPKAN`, dengan `CANCELLED` untuk reservasi yang
dibatalkan.

- `RESERVED`: nomor sudah dibooking, data surat belum lengkap.
- `TERKIRIM`: surat sudah diterbitkan dan otomatis masuk antrean arsip.
- `DIARSIPKAN`: `ArchiveRecord` sudah dibuat.
- Antrean arsip surat keluar memakai `TERKIRIM` + belum punya `ArchiveRecord`
  + `archiveRejectedAt = null`. `MENUNGGU_ARSIP` khusus surat masuk.
- Reject surat keluar tetap memakai flag `archiveRejectedAt` +
  `archiveRejectionNote`; status tetap `TERKIRIM`.
- Setelah staf memperbaiki, `POST /outgoing-letters/:id/resubmit-archive`
  membersihkan flag dan mengirim notifikasi ulang ke Sekcam/Camat.

## 2. Form surat masuk

Wajib:

- File PDF/JPG/PNG maksimal 10 MB.
- Nomor surat, pengirim, tanggal surat, perihal.
- Sifat, prioritas, klasifikasi arsip, ringkasan isi.

Tipe surat:

- `BIASA`
- `UNDANGAN` — wajib tanggal kegiatan, waktu mulai/selesai, tempat, dan
  minimal satu petugas agenda.

Validasi file/ringkasan/klasifikasi dilakukan saat **kirim ke Sekcam**.
Draft `DRAFT_TU` boleh disimpan belum lengkap, lalu dilengkapi dan dikirim.

## 3. Endpoint baru/berubah

### Surat masuk

| Method | Path | Permission | Keterangan |
| --- | --- | --- | --- |
| POST | `/letters` | `letter.create` | Membuat `DRAFT_TU`; `submit=true` langsung ke `REVIEW_SEKCAM` |
| POST | `/letters/:id/submit` | `letter.create` | Kirim draft ke Sekcam; validasi file/ringkasan/klasifikasi |
| POST | `/letters/:id/documents` | `letter.document.upload` | Hanya saat `DRAFT_TU` |
| POST | `/letters/:id/forward` | `letter.paraf` + posisi `SEKCAM` | `REVIEW_SEKCAM → DISPOSISI_CAMAT` |
| POST | `/letters/:id/paraf` | `letter.paraf` + posisi `SEKCAM` | Alias lama untuk `forward` |
| POST | `/letters/:id/dispose` | `letter.dispose` + posisi `CAMAT` | Disposisi satu target |
| POST | `/letters/:id/dispositions` | `letter.dispose` + posisi `CAMAT` | Disposisi banyak target (9 tujuan) |
| POST | `/letters/dispositions/:dispId/accept` | `letter.followup` | Terima & Baca; membuat tanda terima ekspedisi |
| POST | `/letters/dispositions/:dispId/followup` | `letter.followup` | Selesai per disposisi |
| POST | `/letters/:id/complete` | `letter.followup` | Selesai untuk disposisi milik user; mendukung `dispositionId` |
| GET | `/letters/archive-queue` | `archive.approve` | Antrean `MENUNGGU_ARSIP` |
| POST | `/letters/archive-approvals/batch` | `archive.approve` | Maksimal 15, partial success |
| POST | `/letters/archive-approvals/reject` | `archive.reject` | Kembali ke `PROSES` |

### Surat keluar

| Method | Path | Permission | Keterangan |
| --- | --- | --- | --- |
| POST | `/outgoing-letters/reserve` | `outgoing.reserve` | Booking satu nomor |
| POST | `/outgoing-letters/reserve-bulk` | `outgoing.reserve` | Body `{ count, reason, letterDate, classificationCode, ... }`; maksimal 50 |
| POST | `/outgoing-letters/:id/issue` | `outgoing.issue` | `RESERVED → TERKIRIM` |
| GET | `/outgoing-letters/archive-queue` | `archive.approve` | Antrean `TERKIRIM` |
| POST | `/outgoing-letters/archive-approvals/batch` | `archive.approve` | Maksimal 15, partial success |
| POST | `/outgoing-letters/archive-approvals/reject` | `archive.reject` | Set flag reject + notifikasi staf |
| POST | `/outgoing-letters/:id/resubmit-archive` | `outgoing.issue` | Ajukan ulang setelah revisi |

### Arsip

- `POST /archives` dan `GET /archives/candidates` tetap dihapus.
- `PATCH /archives/:id` hanya untuk `SUPER_ADMIN`; staf tidak boleh mengubah
  metadata arsip yang sudah `DIARSIPKAN`.
- `physicalLocation` (`lokasi_fisik`) opsional untuk hardcopy.
- Filter daftar arsip: tahun, `classificationCode`, `q` (nomor/uraian/kode/
  pengirim/tujuan/kata kunci).
- Batch approval surat masuk dan surat keluar dipisah, maksimal 15 per request,
  hasil `approved[]` / `skipped[]`.

## 4. Permission dan role

Tidak ada role baru; tetap 5 role: `EMPLOYEE`, `VERIFIER`, `SUPERVISOR`,
`LEADER`, `SUPER_ADMIN`.

- `letter.create`: `VERIFIER` (termasuk submit draft).
- `letter.paraf`: `LEADER`; route `forward` dibatasi posisi `SEKCAM`.
- `letter.dispose`: `LEADER`; route disposisi dibatasi posisi `CAMAT`.
- `letter.followup`: `EMPLOYEE`, `SUPERVISOR`, `LEADER`; route tetap
  memeriksa apakah user adalah penerima disposisi.
- `letter.complete` tidak lagi dipakai untuk menyelesaikan surat; penyelesaian
  memakai `letter.followup`. Grant lama `letter.complete` untuk `VERIFIER`
  dihapus dari seed.
- `archive.approve`/`archive.reject`: `LEADER` + posisi `SEKCAM`/`CAMAT`
  (atau `SUPER_ADMIN`). Permission saja tidak cukup; route antrean, batch,
  reject, dan resubmit tetap memeriksa posisi/role.
- `archive.update` tidak memberi akses edit metadata; `PATCH /archives/:id`
  tetap dibatasi `SUPER_ADMIN`.

## 5. Notifikasi

Semua notifikasi masuk ke tabel `notifikasi`; frontend memakai polling/badge
refresh (bukan WebSocket).

| Tipe | Penerima | Trigger |
| --- | --- | --- |
| `LETTER_REVIEW` | user posisi `SEKCAM` | surat dikirim ke Sekcam |
| `LETTER_DISPOSITION` | user posisi `CAMAT` | Sekcam meneruskan ke Camat |
| `DISPOSITION` | target disposisi | Camat mengirim disposisi |
| `ARCHIVE_APPROVAL` | user posisi `SEKCAM`/`CAMAT` | surat masuk `MENUNGGU_ARSIP`, surat keluar `TERKIRIM`, resubmit |
| `LETTER_REVISION` | penerima disposisi | arsip surat masuk ditolak |
| `ARCHIVE_REJECTED` | pembuat surat keluar | arsip surat keluar ditolak |

## 6. Migration dan data lama (sudah diterapkan)

Migration baru: `20261105010000_surat_workflow_revision`.

- Tambah `surat_masuk.jenis_surat`, `surat_masuk.diajukan_pada`.
- Tambah `disposisi_surat.diterima_pada`.
- Tambah `surat_keluar.diarsipkan_pada`.
- Tambah `arsip.lokasi_fisik`.
- Backfill status lama:
  - `RECEIVED → REVIEW_SEKCAM`
  - `PARAF → DISPOSISI_CAMAT`
  - `DISPOSED → DITERUSKAN`
  - `COMPLETED → MENUNGGU_ARSIP`
  - `ARCHIVED → DIARSIPKAN`
  - surat keluar `ISSUED → TERKIRIM`; yang sudah punya `ArchiveRecord` →
    `DIARSIPKAN`

Migration `20261105000000_arsip_reject_outgoing` dan
`20261105010000_surat_workflow_revision` sudah diterapkan ke Supabase.
`npm run prisma:seed` juga sudah dijalankan; permission `archive.approve`/
`archive.reject` aktif untuk `LEADER`.

Untuk environment baru, jalankan:

```bash
cd backend
npx prisma migrate deploy
npm run prisma:seed
```

Pipeline deploy wajib menjalankan migrasi dan generate Prisma sebelum build:

```bash
npm ci
npm run prisma:deploy   # prisma migrate deploy
npm run prisma:generate
npm run build
npm start
```

`postinstall` dan `prebuild` sudah memanggil `prisma generate`, tetapi migrasi
tetap harus menjadi langkah eksplisit. Jangan hanya mengandalkan Prisma Client
lokal; schema baru tanpa `prisma generate` akan membuat endpoint 500.

## 7. Handoff frontend

Bagian ini adalah instruksi implementasi, bukan sekadar checklist bisnis.
Frontend tidak boleh mengubah backend; kontrak di bawah sudah final.

### 7.1 Breaking change status dan tipe

Surat masuk:

`DRAFT_TU → REVIEW_SEKCAM → DISPOSISI_CAMAT → DITERUSKAN → PROSES →
MENUNGGU_ARSIP → DIARSIPKAN`

Surat keluar:

`RESERVED → TERKIRIM → DIARSIPKAN`, dengan `CANCELLED` untuk reservasi batal.

Disposisi:

`PENDING → ACCEPTED → DONE`

Yang wajib diubah:

- `LetterStatus` frontend: buang `RECEIVED`, `PARAF`, `DISPOSED`, `COMPLETED`,
  `ARCHIVED`; pakai 7 status surat masuk di atas.
- `OutgoingLetter.status`: ganti `ISSUED` menjadi `TERKIRIM`; tambahkan
  `DIARSIPKAN`.
- `Disposition.status`: tambahkan `ACCEPTED`.
- `StatusBadge`: tambahkan label/warna `DRAFT_TU`, `REVIEW_SEKCAM`,
  `DISPOSISI_CAMAT`, `DITERUSKAN`, `PROSES`, `MENUNGGU_ARSIP`, `DIARSIPKAN`,
  `TERKIRIM`, dan `ACCEPTED`.
- Jangan menghapus mapping `PARAF`, `COMPLETED`, atau `ARCHIVED` dari
  `StatusBadge`; status itu masih dipakai modul cuti/KGB.
- Hapus filter dan asumsi status lama hanya di modul surat/arsip.

Label tampilan yang disarankan:

| Status | Label |
| --- | --- |
| `DRAFT_TU` | Draft TU |
| `REVIEW_SEKCAM` | Menunggu Sekcam |
| `DISPOSISI_CAMAT` | Menunggu Disposisi Camat |
| `DITERUSKAN` | Diteruskan |
| `PROSES` | Diproses |
| `MENUNGGU_ARSIP` | Menunggu Arsip |
| `DIARSIPKAN` | Diarsipkan |
| `RESERVED` | Dipesan |
| `TERKIRIM` | Terkirim |
| `CANCELLED` | Dibatalkan |

### 7.2 Peta halaman dan pekerjaan

| Halaman | Pekerjaan |
| --- | --- |
| `/surat-masuk/baru` | Form dinamis `BIASA`/`UNDANGAN`; upload; tombol **Simpan Draft** dan **Simpan & Kirim ke Sekcam**; field kegiatan hanya untuk undangan; minimal satu petugas agenda untuk undangan |
| `/surat-masuk` | Filter 7 status baru; tampilkan status, target disposisi, jumlah disposisi |
| `/surat-masuk/[id]` | Badge status baru, jenis surat, timeline, PDF preview; tombol Sekcam **Teruskan ke Camat**; form disposisi Camat 9 target; **Terima & Baca** dan **Selesai & Ajukan Arsip** per disposisi |
| `/surat-masuk/agenda` | Kolom nomor agenda, pengirim, nomor/tanggal surat, perihal, penanggung jawab, instruksi Camat; default status `REVIEW_SEKCAM` sampai `DIARSIPKAN` |
| `/surat-masuk/ekspedisi` | Kolom tanggal, nomor agenda, tanggal surat, penerima, jam terima, asal surat; otomatis dari **Terima & Baca**, bukan input manual |
| `/surat-keluar` | Filter `RESERVED`, `TERKIRIM`, `DIARSIPKAN`, `CANCELLED` |
| `/surat-keluar/baru` | Mode **Langsung Terbit** dan **Booking Nomor**; booking memakai `POST /outgoing-letters/reserve-bulk` dengan input jumlah |
| `/surat-keluar/[id]` | **Terbitkan** untuk `RESERVED`; tampilkan catatan reject; tombol **Ajukan ulang** |
| `/arsip` | Hapus tombol/menu arsip manual; tambah filter `classificationCode`; tampilkan `physicalLocation`; sembunyikan edit metadata untuk non-`SUPER_ADMIN` |
| `/arsip/[id]` | Tampilkan `physicalLocation`; edit metadata hanya untuk `SUPER_ADMIN` |
| `/arsip/daftar`, `/arsip/daftar/[id]` | Tetap dipakai untuk daftar arsip (`POST /archives/lists`); jangan dihapus |
| `/notifikasi` | Tangani tipe baru dan deep link; badge memakai polling |

Halaman `/arsip/baru` harus dihapus beserta link/menu-nya karena
`POST /archives` dan `GET /archives/candidates` sudah dihapus. Jangan menghapus
`/arsip/daftar/baru`; halaman itu membuat **daftar arsip**, bukan arsip manual.

### 7.3 Kontrak respons dan aksi

`GET /letters/:id` mengembalikan:

- `letterType`, `submittedAt`, `completedAt`, `completionNote`, `archiveRecord`,
  `documents[].downloadUrl`;
- `dispositions[]` dengan `acceptedAt`, `canAccept`, `canComplete`,
  `canFollowUp`;
- `availableActions[]` berisi nilai `submit`, `forward`, `dispose`, `accept`,
  `complete`, `archive`, atau `upload`.

`GET /letters` dan `GET /letters/:id` sama-sama mengembalikan `dispositions[]`
dengan bentuk kanonik `from`/`to` (bukan `fromUser`/`toUser`). Frontend tidak
perlu lagi menangani dua bentuk.

`GET /outgoing-letters/:id` dan response mutasi surat keluar mengembalikan
`availableActions[]`: `issue`, `cancel`, `upload`, dan `resubmit_archive`.
Gunakan field ini sebagai sumber tombol, bukan kombinasi status + permission.
Aksi `upload` hanya muncul jika user punya `outgoing.create`; `issue`/`cancel`
hanya untuk status `RESERVED`; `resubmit_archive` hanya saat
`archiveRejectedAt` terisi.

Catatan penting:

- Backend mengirim `forward`, bukan `paraf`. Jangan cek
  `availableActions.includes("paraf")`.
- Gunakan `canAccept` untuk tombol **Terima & Baca**, dan `canComplete`/
  `canFollowUp` untuk tombol **Selesai & Ajukan Arsip**. Jangan memakai
  `status === "PENDING"` untuk tombol selesai.
- Catatan Sekcam disimpan sebagai disposisi dengan `from.id === to.id`.
  Jangan hitung sebagai target/progres dan tampilkan sebagai “Catatan Sekcam”.

`GET /letters/disposition-targets` mengembalikan 9 target aktif dengan
`mappedPosition`, `recipients[]`, dan `available`. Target `available=false`
tidak boleh dipilih.

`POST /letters/:id/dispositions` menerima:

```json
{
  "instruction": "wajib, minimal 5 karakter",
  "deadline": "YYYY-MM-DD (opsional)",
  "targetCodes": ["SEKCAM", "KASI_PEM"]
}
```

`targetCodes` maksimal 9. Satu target dapat menghasilkan beberapa disposisi
jika ada beberapa user aktif di jabatan yang sama. Instruksi per target juga
didukung lewat `targets[]`.

Aksi penerima:

- `POST /letters/dispositions/:id/accept` tanpa body → `ACCEPTED` + buku
  ekspedisi otomatis + surat `PROSES`.
- `POST /letters/dispositions/:id/followup` body `{ "note": "..." }` minimal
  3 karakter → `DONE`.
- `POST /letters/:id/complete` body `{ note?, dispositionId? }` adalah
  alternatif; untuk multi-target gunakan endpoint `followup` per disposisi.

### 7.4 Upload, form, dan validasi

- `POST /letters` menerima JSON atau `multipart/form-data`.
- `submit=false` → `DRAFT_TU`; file boleh belum ada.
- `submit=true` → `REVIEW_SEKCAM`; file, ringkasan, dan klasifikasi wajib.
- `POST /letters/:id/documents` memakai field `file`; hanya saat `DRAFT_TU`.
  Setelah dikirim ke Sekcam, file tidak dapat diganti lewat endpoint ini.
- Untuk `multipart`, kirim `assignedUserIds` sebagai JSON string, misalnya
  `["uuid-1","uuid-2"]`, dan `submit` sebagai `"true"`.
- Tipe file: PDF/JPG/PNG, maksimal 10 MB. Backend menolak tipe tidak valid
  dengan `400` (tidak lagi diabaikan diam-diam).
- Surat `UNDANGAN` wajib `activityDate`, `activityStartTime`,
  `activityEndTime`, `activityLocation`, dan minimal satu `assignedUserIds`.
- Tanggal surat keluar tidak boleh masa depan; nomor surat selalu dihitung
  backend.

Preview dokumen:

- Jangan memasang `downloadUrl` langsung di `iframe`; endpoint download memakai
  `Content-Disposition: attachment`.
- Fetch sebagai blob lalu buat `objectURL`, atau minta backend menyediakan
  endpoint inline. JPG dapat ditampilkan langsung sebagai gambar.

### 7.5 Multi-target, reject, dan arsip

- `PROSES` muncul saat target pertama menekan **Terima & Baca**, bukan saat
  target pertama selesai.
- `MENUNGGU_ARSIP` hanya setelah semua disposisi target non-self `DONE`.
- Reject surat masuk:
  - status kembali `PROSES`;
  - disposisi target `DONE` dibuka kembali menjadi `ACCEPTED`;
  - catatan Sekcam tidak diubah;
  - penerima menerima `LETTER_REVISION` dan harus bisa followup ulang.
- Reject surat keluar:
  - status tetap `TERKIRIM`;
  - isi `archiveRejectedAt` + `archiveRejectionNote`;
  - hilang dari antrean sampai `POST /outgoing-letters/:id/resubmit-archive`.
- Antrean surat masuk: `GET /letters/archive-queue` (`MENUNGGU_ARSIP`).
- Antrean surat keluar: `GET /outgoing-letters/archive-queue` (`TERKIRIM`,
  belum punya `ArchiveRecord`, `archiveRejectedAt=null`).
- Baris antrean surat masuk memakai field kanonik `agendaNumber`,
  `letterNumber`, `subject`, `sender`, `receivedDate`, `completedAt`, `status`,
  `classification`; baris surat keluar memakai `letterNumber`, `subject`,
  `recipient`, `letterDate`, `issuedAt`, `status`, `classification`. Alias lama
  (`nomor`, `nomorSurat`, `perihal`, `asalTujuan`, `tanggalSelesai`, dsb.) tetap
  ada untuk kompatibilitas, tetapi field kanonik yang dipakai UI baru.
- `/letters/agenda` dan `/letters/agenda/tomorrow` memakai kolom yang sama
  dengan `/letters/register-book`, ditambah field mentah dan `assignedStaff[]`.
  `nomor` adalah urutan hasil query, bukan nomor agenda.
- `POST /letters/:id/archive` masih tersedia untuk persetujuan satu surat
  (legacy). Alur UI utama tetap memakai antrean dan batch.
- Batch approve/reject maksimal 15 ID; response parsial:
  `approved[]`/`skipped[]` atau `rejected[]`/`skipped[]`. HTTP dapat `200`
  walau sebagian gagal.
- Filter arsip: `year`, `classificationCode`, `q` (nomor/uraian/kode/
  pengirim/tujuan/kata kunci/lokasi fisik), `sourceType`, `category`,
  `dateFrom`, `dateTo`, `listId`, `unlisted`.
- `PATCH /archives/:id` hanya `SUPER_ADMIN`. `archive.update` saja tidak cukup;
  metadata arsip harus read-only untuk staf.
- `physicalLocation` opsional, teks bebas maksimal 200 karakter.

### 7.6 Notifikasi dan polling

| Tipe | Penerima | Deep link |
| --- | --- | --- |
| `LETTER_REVIEW` | Sekcam | `/surat-masuk/:referenceId` |
| `LETTER_DISPOSITION` | Camat | `/surat-masuk/:referenceId` |
| `DISPOSITION` | target disposisi | resolve `dispId` ke `/surat-masuk/:letterId` |
| `ARCHIVE_APPROVAL` | Sekcam/Camat | detail surat sesuai `referenceType` |
| `LETTER_REVISION` | penerima disposisi | `/surat-masuk/:referenceId` |
| `ARCHIVE_REJECTED` | pembuat surat keluar | `/surat-keluar/:referenceId` |

Polling memakai:

- `GET /notifications/unread-count` → `{ unread }`;
- `GET /notifications?unread=true&page=&limit=`;
- `PATCH /notifications/:id/read`;
- `PATCH /notifications/read-all` → `{ updated }` untuk tandai semua dibaca.

Polling saat mount, saat window focus, dan setelah aksi workflow. Tidak perlu
WebSocket.

### 7.7 Temuan baseline frontend yang wajib diperbaiki

1. `LetterStatus`, `OutgoingLetter.status`, dan `StatusBadge` masih status lama.
2. Detail surat mengecek `availableActions.includes("paraf")`; backend memakai
   `forward`.
3. Tombol **Terima & Baca** belum ada.
4. Tombol selesai hanya muncul saat `PENDING`; seharusnya `PENDING` → Terima &
   Baca, `ACCEPTED` → Selesai & Ajukan Arsip.
5. Form ekspedisi manual masih ditampilkan; alur baru otomatis saat Terima &
   Baca.
6. PDF preview belum ada; baru tombol unduh.
7. Halaman arsip masih menautkan `/arsip/baru` yang sudah tidak valid.
8. Filter `classificationCode` dan tampilan `physicalLocation` belum ada.
9. Edit metadata arsip masih memakai `archive.update`, bukan `SUPER_ADMIN`.
10. Surat keluar baru mendukung reservasi satu nomor, belum `reserve-bulk`.
11. Notifikasi belum menangani `incoming_letter`, `outgoing_letter`,
    `ARCHIVE_APPROVAL`, `LETTER_REVISION`, dan `ARCHIVE_REJECTED`.
12. Teks “Unduhan dokumen surat keluar belum tersedia” sudah usang; backend
    mengirim `downloadUrl`.
13. Detail surat keluar belum memakai `availableActions`; masih menebak dari
    status + permission.
14. UI notifikasi belum menyediakan aksi tandai semua dibaca
    (`PATCH /notifications/read-all`).

### 7.8 UAT minimal frontend

1. Draft tanpa file → upload → kirim ke Sekcam.
2. Sekcam meneruskan `REVIEW_SEKCAM → DISPOSISI_CAMAT`.
3. Camat melihat PDF dan mengirim disposisi ke beberapa target.
4. Penerima pertama menerima; status `PROSES`; ekspedisi bertambah otomatis.
5. Penerima menyelesaikan followup; `MENUNGGU_ARSIP` hanya setelah semua target
   selesai.
6. Batch approve menampilkan `approved[]`/`skipped[]`.
7. Reject surat masuk mengembalikan ke `PROSES` dan target bisa followup lagi.
8. Booking beberapa nomor → lengkapi salah satu → `TERKIRIM` → reject →
   ajukan ulang.
9. Non-admin tidak bisa edit metadata arsip; admin bisa mengisi
   `physicalLocation`.
10. Filter arsip tahun, klasifikasi, pengirim/tujuan, dan kata kunci bekerja.
11. Badge notifikasi bertambah, deep link membuka halaman yang benar, dan
    “tandai semua dibaca” menurunkan badge ke 0.
12. Tidak ada lagi link aktif ke `/arsip/baru`.

Catatan data UAT: `AGENDA-2026-0040` berubah dari `DITERUSKAN` menjadi `PROSES`
karena disposisi kasi diuji **Terima & Baca**. Itu data uji, bukan bug kode.
