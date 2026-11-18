# 09 — Handoff Frontend: Pengajuan Pensiun PNS

> Backend sudah tersedia di `/api/v1/pension-requests`.
> **Jangan mengubah folder `frontend/` dari sesi backend ini.** Dokumen ini adalah
> instruksi kerja untuk sesi/frontend terpisah.
> Gunakan `apiFetch` / `apiUpload` dari `frontend/src/lib/api.ts`; jangan memanggil
> backend langsung dari browser.
>
> **Penting soal path:** contoh endpoint di dokumen ini ditulis sebagai path backend
> (`/v1/...`). Helper frontend sudah menambahkan `/api` dan proxy Next menambahkan
> `/api/v1`. Saat memanggil helper, hilangkan `/v1`: contoh
> `apiFetch("/pension-requests/bup?year=2026")`, **bukan**
> `apiFetch("/v1/pension-requests/bup?year=2026")`.

## 1. Hasil yang harus dibuat

Menu baru **Pensiun PNS** dengan halaman:

1. `/pensiun` — daftar berkas usulan.
2. `/pensiun/bup` — daftar PNS memasuki BUP + pilih untuk membuat draf.
3. `/pensiun/[id]` — workspace usulan (stepper 8 langkah, item, dokumen, timeline).
4. `/pensiun/register` — buku register usulan.
5. `/pensiun/nominatif` — daftar nominatif PNS.
6. `/pensiun/ekspedisi` — buku ekspedisi surat keluar.

Tambahkan item menu hanya jika user memiliki `pension.view`. Untuk `EMPLOYEE`,
sembunyikan halaman BUP/register/nominatif/ekspedisi (backend juga menolak 403);
EMPLOYEE hanya melihat daftar/detail usulan yang memuat dirinya.

## 2. Tipe TypeScript yang perlu ditambahkan

Tambahkan ke `frontend/src/lib/types.ts` (nama boleh disesuaikan dengan konvensi
frontend, tetapi field harus sama):

```ts
export type PensionStatus =
  | "DRAFT" | "VERIFIED" | "PARAF" | "APPROVED"
  | "REGISTERED" | "EXPEDITED" | "SENT"
  | "COMPLETED" | "ARCHIVED" | "REVISION" | "REJECTED";

export type PensionItemStatus =
  | "PENDING" | "VERIFIED" | "REVISION" | "REJECTED";

export interface PensionChecklistItem {
  code: string;
  label: string;
  uploaded: boolean;
  documentId: string | null;
  originalName: string | null;
  uploadedAt: string | null;
}

export interface PensionDocument {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string; // sudah siap dipakai, jangan susun URL sendiri
}

export interface PensionItem {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string | null;
  employeeNumber: string;
  rank: string | null;
  position: string;
  orgUnitName: string | null;
  birthDate: string;
  retirementDate: string;
  bupAge: number;
  yearsOfService: number | null;
  pensionType: "BUP" | "APS" | "UDZUR" | "JANDA" | "DUDA" | string;
  status: PensionItemStatus;
  note: string | null;
  documents: PensionDocument[];
  documentsChecklist: PensionChecklistItem[];
  missingDocuments: string[];
}

export interface PensionBatch {
  id: string;
  batchNumber: string;
  periodYear: number;
  periodMonth: number | null;
  bupAge: number;
  status: PensionStatus;
  statusLabel: string;
  note: string | null;
  outgoingLetterId: string | null;
  outgoingLetterNumber: string | null;
  outgoingLetterDate: string | null;
  agendaNumber: string | null;
  expeditionNumber: string | null;
  expeditionDate: string | null;
  courierName: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  receivedBy: string | null;
  items: PensionItem[];
  timeline: Array<{
    action: string;
    fromStatus: string;
    toStatus: string;
    actorName: string | null;
    actorRole: string;
    actorPosition: string | null;
    note: string | null;
    createdAt: string;
  }>;
  availableActions: string[];
  signers: {
    camat: { name: string; nip: string | null; position: string } | null;
    sekcam: { name: string; nip: string | null; position: string } | null;
  };
  createdAt: string;
  updatedAt: string;
}
```

`availableActions` adalah sumber kebenaran tombol aksi. Jangan menebak dari role.
Tetap tangani 403/409 dari backend.

## 3. Kontrak endpoint yang dipakai frontend

Semua path di bawah ditulis sebagai path backend (`/v1/...`). Saat memanggil
`apiFetch`/`apiUpload`, hilangkan prefix `/v1` (contoh:
`apiFetch("/pension-requests?year=2026")`).

### Daftar BUP — langkah 1

```ts
GET /v1/pension-requests/bup?year=2026
// opsional: &from=2026-01-01&to=2026-12-31&bupAge=58
```

Response `data[]`:

```json
{
  "employee": {
    "id": "uuid", "nip": "...", "employeeNumber": "EMP-008",
    "name": "Siti Pensiun", "gender": "P", "rank": "III/d",
    "position": "STAF", "employmentStatus": "PNS",
    "orgUnit": { "id": "uuid", "code": "KEC-TAMALATE", "name": "Kecamatan Tamalate" }
  },
  "birthDate": "1968-02-10",
  "age": { "years": 58, "months": 8 },
  "retirementDate": "2026-02-10",
  "bupAge": 58,
  "yearsOfService": 35,
  "monthsUntil": -8,
  "daysUntil": -264,
  "existingItem": null
}
```

`existingItem` bila tidak null:

```json
{
  "id": "uuid", "batchId": "uuid", "batchNumber": "PENSIUN-2026-0001",
  "batchStatus": "DRAFT", "periodYear": 2026, "itemStatus": "PENDING"
}
```

Tampilkan peringatan “sudah masuk usulan” dan nonaktifkan checkbox bila
`existingItem` ada. `meta` berisi `{ total, from, to, bupAge, missingBirthDate,
alreadyInBatch }`.

### Buat draf — langkah 2

```ts
POST /v1/pension-requests
{
  "periodYear": 2026,
  "periodMonth": 11,          // opsional
  "bupAge": 58,               // opsional
  "note": "Usulan periode November 2026",
  "items": [
    { "employeeId": "uuid", "pensionType": "BUP", "note": "" }
  ]
}
```

Boleh juga mengirim `employeeIds: ["uuid"]` bila tidak perlu `pensionType`.
Response = detail `PensionBatch` dengan `status: "DRAFT"`, `batchNumber:
"PENSIUN-2026-0001"`, dan `availableActions: ["verify"]`.

### Tambah/hapus PNS dari draf

```ts
POST   /v1/pension-requests/:id/items
{ "employeeIds": ["uuid"] }

DELETE /v1/pension-requests/:id/items/:itemId
```

Hanya saat `DRAFT/REVISION`. Minimal satu PNS harus tersisa.

### Upload dokumen — langkah 3

```ts
const form = new FormData();
form.append("file", file);               // file apa pun, max 5MB
form.append("docType", "SK_PANGKAT_TERAKHIR");
await apiUpload(`/v1/pension-requests/${id}/items/${itemId}/documents`, form);
```

Download: `file.downloadUrl` sudah berupa path `/api/v1/pension-requests/.../download`.
Gunakan link tersebut; jangan menyusun URL dari `storedPath` (tidak dikirim).

`docType` yang diminta untuk demo: `DPCP`, `SK_PNS`, `SK_PANGKAT_TERAKHIR`,
`SK_JABATAN_TERAKHIR`. Checklist bisa diambil dari
`GET /v1/pension-requests/required-docs`; UI juga dapat menampilkan `LAINNYA`
bila suatu saat dibutuhkan. Jenis lama tetap ada di database untuk data historis,
tetapi tidak ditampilkan dan tidak perlu diunggah.

UI detail usulan menyediakan pemilih beberapa berkas sekaligus (multi-select)
dan satu tombol **Unggah semua**. Frontend memetakan berkas ke empat slot
dokumen berdasarkan nama berkas, lalu mengirim satu request per berkas. Tidak
ada dropdown jenis dokumen. Upload ulang dengan `docType` yang sama akan
mengganti dokumen lama.

### Aksi alur

```ts
POST /v1/pension-requests/:id/verify
{ "documentsComplete": true, "note": "Dokumen lengkap" }

POST /v1/pension-requests/:id/revise
{ "note": "SK pangkat terakhir belum dilegalisir" }

POST /v1/pension-requests/:id/reject
{ "note": "Berkas tidak memenuhi syarat" }

POST /v1/pension-requests/:id/paraf
{ "note": "Paraf koordinasi" }

POST /v1/pension-requests/:id/approve
{ "note": "Disetujui dan ditandatangani" }

POST /v1/pension-requests/:id/register
{
  // Opsi A: biarkan backend membuat surat keluar otomatis
  "createOutgoingLetter": true,
  "outgoingLetterDate": "2026-11-01",
  "classificationCode": "800.1.6.6",
  "note": "Dicatat di buku agenda keluar"

  // Opsi B: pilih surat keluar yang sudah ada
  // "outgoingLetterId": "uuid"

  // Opsi C: catat nomor manual
  // "outgoingLetterNumber": "800.1.6.6 / 32 / KT / XI / 2026",
  // "agendaNumber": "800.1.6.6 / 32 / KT / XI / 2026"
}

POST /v1/pension-requests/:id/expedite
{
  "expeditionDate": "2026-11-01",
  "courierName": "Petugas Ekspedisi",
  "note": "Diserahkan ke pendistribusi"
}

POST /v1/pension-requests/:id/send
{
  "receiptNumber": "TT-PENSIUN-001",
  "receiptDate": "2026-11-01",
  "receivedByName": "Petugas BKPSDMD",
  "note": "Diterima"
}

POST /v1/pension-requests/:id/complete
{ "note": "Selesai" }

POST /v1/pension-requests/:id/archive
{ "note": "Diarsipkan" }
```

Catatan:

- `verify` **wajib** `documentsComplete: true`; backend menolak 422 bila tidak.
- `revise`/`reject` wajib catatan minimal 5 karakter.
- `paraf` hanya berhasil untuk user `position = SEKCAM`.
- `approve` hanya berhasil untuk user `position = CAMAT`.
- `register`/`expedite`/`send` adalah porsi Staf Kepegawaian (`VERIFIER`,
  jabatan `STAF_KEPEGAWAIAN`). Kasubag hanya memverifikasi kelengkapan.
- `register` tanpa `outgoingLetterId`/`outgoingLetterNumber` dan tanpa
  `createOutgoingLetter: false` akan membuat surat keluar otomatis dengan nomor
  dari service penomoran (buffer backdate 3 nomor sudah ditangani backend), lalu
  menyiapkan baris `ekspedisi_surat_keluar` berstatus `BELUM_DIKIRIM`.
- `expedite` mengisi `ekspedisi_surat_keluar` menjadi `DIKIRIM`; `send` mencatat
  bukti terima dan menjadikannya `DITERIMA`. Detail batch memuat
  `outgoingLetter.outgoingExpedition` dan `expeditionStatus`.
- Jangan menambahkan tombol “reservasi 3 nomor” untuk pensiun.

### Daftar, detail, dan buku

```ts
GET /v1/pension-requests?status=&year=&q=&page=1&limit=10
GET /v1/pension-requests/:id
GET /v1/pension-requests/register?year=2026
GET /v1/pension-requests/nominative?year=2026&month=11
GET /v1/pension-requests/expedition-book?year=2026
GET /v1/pension-requests/required-docs
```

- List `EMPLOYEE` otomatis hanya berisi batch yang memuat dirinya.
- Detail `EMPLOYEE` hanya mengembalikan item miliknya.
- Buku register/nominatif/ekspedisi 403 untuk `EMPLOYEE`.
- `GET /:id` mengembalikan `items[].documentsChecklist` dan
  `items[].missingDocuments`; gunakan untuk panel kelengkapan.

## 4. Komponen UI yang disarankan

### Halaman BUP

- Filter: tahun, bulan/periode (opsional), `bupAge` (default 58).
- Tabel: checkbox, nama, NIP, golongan, jabatan, unit, tanggal lahir, usia,
  tanggal pensiun, masa kerja, status usulan.
- Tombol **Buat Draf Usulan** aktif bila minimal satu dipilih.
- Setelah POST, arahkan ke `/pensiun/[id]`.

### Halaman daftar usulan

- Filter status/tahun/pencarian (nama, NIP, nomor usulan, nomor surat).
- Kolom: nomor usulan, periode, jumlah PNS, status, nomor surat, nomor agenda,
  ekspedisi, tanda terima, aksi “Buka”.
- Badge status memakai `statusLabel` dari backend.

### Workspace detail

- Header: nomor usulan, periode, status, tombol aksi dari `availableActions`.
- Stepper 8 langkah:
  1. Pendataan BUP
  2. Draf daftar nominatif
  3. Verifikasi dokumen
  4. Paraf Sekcam
  5. Tanda tangan Camat
  6. Buku agenda + nomor + stempel
  7. Buku ekspedisi
  8. Kirim + tanda terima
- Tabel item: nama, NIP, golongan, jabatan, unit, tanggal pensiun, masa kerja,
  status item, kelengkapan dokumen.
- Per item: tombol upload per `docType`, daftar dokumen, checklist (centang/
  silang), tombol hapus (hanya DRAFT/REVISION).
- Panel kanan: `signers`, ringkasan surat keluar, agenda, ekspedisi, tanda terima.
- Timeline dari `timeline` (aktor, jabatan, catatan, waktu).

### Modal aksi

- **Verifikasi**: checklist dokumen + checkbox “Dokumen lengkap” + catatan.
  Kirim `documentsComplete: true` hanya jika checkbox dicentang.
- **Revisi/Penolakan**: textarea wajib (min. 5 karakter).
- **Paraf/Setujui**: catatan opsional.
- **Register** (panel inline): tanggal surat keluar (default hari ini). Backend
  otomatis membuat surat keluar, mencatat Buku Agenda Surat Keluar, dan
  menyiapkan baris Buku Ekspedisi Surat Keluar. UI tidak meminta nomor manual.
- **Ekspedisi** (panel inline): tanggal diserahkan ke caraka dan nama
  pendistribusi/caraka (wajib), catatan opsional. Nomor registrasi ekspedisi
  dibuat backend (`EXK-YYYY-NNNN`), bukan input manual.
- **Kirim** (panel inline): nomor tanda terima (wajib), tanggal tanda terima
  (wajib), nama penerima, catatan. Aksi ini menandai ekspedisi `DITERIMA`.

### Halaman buku

- **Register**: tabel batch + nomor surat/agenda/ekspedisi/tanda terima.
- **Nominatif**: tabel per PNS, urut nomor; tampilkan checklist dokumen.
- **Ekspedisi**: tabel tanggal, nomor ekspedisi, nomor surat, tujuan, penerima,
  jumlah pegawai, status, catatan.
- Semua halaman buku punya filter tahun dan tombol cetak/unduh CSV.

## 5. Label status yang disarankan

| Status | Label UI |
|---|---|
| `DRAFT` | Draf daftar usulan |
| `VERIFIED` | Berkas terverifikasi |
| `PARAF` | Sudah diparaf Sekcam |
| `APPROVED` | Disetujui/ditandatangani Camat |
| `REGISTERED` | Tercatat di buku agenda |
| `EXPEDITED` | Tercatat di buku ekspedisi |
| `SENT` | Dikirim ke BKPSDMD |
| `COMPLETED` | Selesai |
| `ARCHIVED` | Diarsipkan |
| `REVISION` | Perlu revisi berkas |
| `REJECTED` | Ditolak |

Gunakan `statusLabel` dari backend bila tersedia; tabel di atas untuk fallback.

## 6. Format cetak

### Daftar nominatif

Judul: **DAFTAR NOMINATIF USULAN PENSIUN PNS**
Kolom: No, Nama, NIP, Golongan, Jabatan, Unit Kerja, Tanggal Lahir, Tanggal
Pensiun, Usia BUP, Masa Kerja, Jenis Pensiun, Keterangan.

### Surat usulan

Ambil `signers.camat` dan `signers.sekcam`. Tampilkan:

- nomor surat (`outgoingLetterNumber`),
- tanggal surat (`outgoingLetterDate`),
- perihal,
- daftar nominatif,
- ruang paraf Sekcam,
- tanda tangan Camat.

## 7. Edge case yang wajib ditangani

- `422` saat membuat usulan karena `birthDate` kosong: tampilkan nama PNS yang
  bermasalah dan arahkan admin melengkapi data pegawai.
- `409` saat aksi karena status sudah berubah: refetch detail, jangan retry buta.
- `403` untuk aksi jabatan (mis. Camat mencoba paraf): sembunyikan tombol dari
  `availableActions`, tetapi tetap tampilkan pesan dari backend.
- `409` saat upload dokumen karena status bukan DRAFT/REVISION: refetch.
- `existingItem` di BUP: jangan buat duplikat; tampilkan link ke batch lama.
- `missingDocuments` tidak memblokir verify, tetapi tampilkan sebagai peringatan
  sebelum checkbox “Dokumen lengkap” dicentang.
- `outgoingLetterNumber`/`agendaNumber` tidak boleh diisi manual jika memilih
  “buat otomatis”; backend akan mengisinya.
- Jangan menampilkan `storedPath`; gunakan `downloadUrl`.

## 8. Akun demo

- `verifier1 / Verifier123!` — buat draf, unggah dokumen, register/agenda,
  ekspedisi, dan tanda terima BKPSDMD.
- `kasubag1 / Kasubag123!` — verifikasi kelengkapan, revisi, penolakan.
- `sekcam1 / Sekcam123!` — paraf.
- `camat1 / Camat123!` — approve/tanda tangan.
- `pensiun1 / Pensiun123!` — contoh PNS BUP 2026 (Siti Pensiun); hanya melihat
  usulan miliknya.

## 9. Checklist pengujian frontend

1. Login Verifier → halaman BUP 2026 menampilkan Siti Pensiun.
2. Pilih PNS → buat draf → detail menampilkan stepper langkah 1–2 aktif.
3. Unggah empat dokumen inti. Setelah dokumen terakhir, login Kasubag dan buka
   `/notifikasi`; harus ada **Permintaan verifikasi berkas pensiun** dengan tombol
   **Buka pengajuan pensiun**.
4. Kasubag verifikasi dengan checkbox → status `VERIFIED`; Sekcam menerima
   notifikasi dengan tombol **Buka pengajuan pensiun**.
5. Login Sekcam → paraf; login Camat → approve. Keduanya menerima notifikasi
   yang langsung membuka detail usulan.
6. Login Verifier → setelah Camat approve, notifikasi **disetujui/ditandatangani**
   masuk. Register otomatis; cek nomor surat/agenda dan baris `Belum diserahkan`
   di Buku Ekspedisi Surat Keluar.
7. Catat ekspedisi → isi tanggal + nama caraka; cek baris berubah menjadi
   `Sudah diserahkan` di Buku Ekspedisi Pensiun dan Buku Ekspedisi Surat Keluar.
8. Catat bukti terima + nomor tanda terima; cek status `SENT` dan baris ekspedisi
   menjadi `Diterima tujuan`.
9. Login Pensiun1 → hanya melihat usulan sendiri, tanpa tombol aksi.
10. Pastikan `frontend/` tidak berisi perubahan dari sesi backend ini.
