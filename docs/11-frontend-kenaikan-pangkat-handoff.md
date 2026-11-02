# 11 — Handoff Frontend: Pengajuan Kenaikan Pangkat ASN

> Backend sudah tersedia di `/api/v1/promotion-requests`.
> **Jangan mengubah folder `frontend/` dari sesi backend ini.** Dokumen ini adalah
> instruksi kerja untuk sesi/frontend terpisah.
> Gunakan `apiFetch`/`apiUpload` dari `frontend/src/lib/api.ts`.
>
> **Penting soal path:** backend memakai `/api/v1`; helper frontend sudah menambahkan
> `/api` lalu proxy Next menambahkan `/api/v1`. Jadi panggil `apiFetch("/promotion-requests")`,
> **bukan** `apiFetch("/v1/promotion-requests")`. Path di dokumen ini adalah path backend
> setelah `/api/v1`.

## 1. Hasil yang harus dibuat

Menu baru **Kenaikan Pangkat** dengan halaman:

1. `/kenaikan-pangkat` — daftar berkas usulan.
2. `/kenaikan-pangkat/calon` — daftar calon ASN + pilih untuk membuat draf.
3. `/kenaikan-pangkat/[id]` — workspace usulan (stepper 8 langkah, item, dokumen, timeline).
4. `/kenaikan-pangkat/register` — buku register usulan.
5. `/kenaikan-pangkat/nominatif` — daftar nominatif ASN.
6. `/kenaikan-pangkat/arsip` — buku arsip usulan.

Tambahkan item menu hanya jika user memiliki `promotion.view`. Untuk `EMPLOYEE`,
sembunyikan halaman calon/register/nominatif/arsip (backend juga menolak 403);
EMPLOYEE hanya melihat daftar/detail usulan yang memuat dirinya, tanpa tombol aksi.

Ikuti pola halaman KGB yang sudah ada: `AppShell`, `StatusBadge`, `EmptyState`,
`ErrorBox`, `Skeleton`, tabel responsif, dan tombol aksi dari `availableActions`.

## 2. Tipe TypeScript yang perlu ditambahkan

Tambahkan ke `frontend/src/lib/types.ts` (nama boleh disesuaikan, field harus sama):

```ts
export type PromotionStatus =
  | "DRAFT" | "LEGALIZED" | "VERIFIED" | "PARAF"
  | "APPROVED" | "REGISTERED" | "ARCHIVED"
  | "REVISION" | "REJECTED";

export type PromotionItemStatus =
  | "PENDING" | "LEGALIZED" | "VERIFIED" | "PARAF" | "APPROVED"
  | "REGISTERED" | "ARCHIVED" | "REVISION" | "REJECTED";

export interface PromotionChecklistItem {
  code: string;
  label: string;
  uploaded: boolean;
  documentId: string | null;
  originalName: string | null;
  uploadedAt: string | null;
}

export interface PromotionDocument {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string; // berisi /api/v1/...; lihat helper unduh di bawah
}

export interface PromotionItem {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string | null;
  employeeNumber: string;
  currentRank: string | null;
  currentRankTmt: string | null;
  targetRank: string;
  effectiveDate: string;
  yearsInCurrentRank: number | null;
  position: string;
  orgUnitName: string | null;
  status: PromotionItemStatus;
  statusLabel: string;
  note: string | null;
  legalizedAt: string | null;
  verifiedAt: string | null;
  documents: PromotionDocument[];
  documentsChecklist: PromotionChecklistItem[];
  missingDocuments: string[];
}

export interface PromotionBatch {
  id: string;
  batchNumber: string;
  periodYear: number;
  periodMonth: number | null;
  status: PromotionStatus;
  statusLabel: string;
  currentHolderRole: string | null;
  note: string | null;
  legalizationNote: string | null;
  stampNumber: string | null;
  verificationNote: string | null;
  parafNote: string | null;
  approvalNote: string | null;
  revisionNote: string | null;
  rejectionReason: string | null;
  outgoingLetterId: string | null;
  outgoingLetterNumber: string | null;
  outgoingLetterDate: string | null;
  agendaNumber: string | null;
  legalizedAt: string | null;
  verifiedAt: string | null;
  parafAt: string | null;
  approvedAt: string | null;
  registeredAt: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  items: PromotionItem[];
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
  canEdit: boolean;
  signers: {
    camat: { name: string; nip: string | null; position: string } | null;
    sekcam: { name: string; nip: string | null; position: string } | null;
  };
  outgoingLetter?: {
    id: string;
    letterNumber: string;
    subject: string;
    letterDate: string;
    recipient: string | null;
    signerName?: string | null;
    classification: { code: string; name: string } | null;
    archiveRecord: {
      id: string;
      archiveNumber: string;
      archiveDate: string;
      category: string;
      location: string;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCandidate {
  employee: {
    id: string;
    nip: string | null;
    employeeNumber: string;
    name: string;
    gender: string;
    rank: string | null;
    rankTmt: string | null;
    position: string;
    employmentStatus: string;
    orgUnit: { id: string; code: string; name: string } | null;
  };
  currentRank: string | null;
  currentRankTmt: string | null;
  suggestedTargetRank: string | null;
  yearsInRank: number | null;
  minYears: number;
  dueDate: string | null;
  eligible: boolean | null;
  missingRankTmt: boolean;
  existingItem: {
    id: string;
    batchId: string;
    batchNumber: string;
    batchStatus: string;
    periodYear: number;
    itemStatus: string;
  } | null;
}
```

Tambahkan juga `rankTmt?: string | null` pada `EmployeeRef` di `types.ts` agar data
dari `/auth/me` bisa dipakai.

`availableActions` adalah sumber kebenaran tombol aksi. Jangan menebak dari role.
Tetap tangani 403/409 dari backend.

## 3. Kontrak endpoint yang dipakai frontend

Semua contoh memakai `apiFetch`/`apiUpload` tanpa prefix `/v1`.

### Daftar calon — langkah 1

```ts
GET /promotion-requests/candidates?periodYear=2026
// opsional: &asOf=2026-11-01&minYears=4&includeAll=true
// opsional: &orgUnit=KEC-TAMALATE&q=andi&employmentStatus=PNS
```

Default hanya menampilkan ASN yang sudah memenuhi masa jabatan. `includeAll=true`
menampilkan juga yang belum jatuh tempo dan yang belum punya `rankTmt`.
Gunakan `employee.rankTmt`, `currentRankTmt`, `yearsInRank`, `dueDate`,
`suggestedTargetRank`, dan `existingItem` untuk tabel.

Response `data[]` berbentuk `PromotionCandidate`. Meta berisi
`{ total, asOf, minYears, employmentStatus, missingRankTmt, notDue, alreadyInBatch }`.

### Checklist dokumen

```ts
GET /promotion-requests/required-docs
```

Response: `{ required: [{code,label}], otherDocType: "LAINNYA", acceptedTypes }`.

### Daftar berkas usulan

```ts
GET /promotion-requests?status=&year=2026&q=&page=1&limit=10
```

Response `data[]` berisi batch (items diringkas) dan `meta {page,limit,total}`.
Untuk `EMPLOYEE`, backend otomatis memfilter usulan yang memuat dirinya.

### Buat draf usulan — langkah 2

```ts
POST /promotion-requests
{
  "periodYear": 2026,
  "periodMonth": 11,
  "note": "Usulan kenaikan pangkat periode November 2026",
  "items": [
    {
      "employeeId": "uuid",
      "targetRank": "III/c",
      "currentRankTmt": "2022-04-01", // hanya bila master kosong/ingin dikoreksi
      "effectiveDate": "2026-10-01",
      "note": "Usulan reguler"
    }
  ]
}
```

- Minimal satu item.
- `targetRank` opsional; jika kosong backend memakai golongan berikutnya.
- `effectiveDate` opsional; jika kosong backend memakai tanggal 1 bulan `periodMonth`
  (atau 1 April bila bulan kosong). **Sebaiknya frontend selalu mengirim tanggal.**
- `currentRankTmt` wajib bila `employee.rankTmt` kosong. Backend juga menyimpan nilai
  ini ke master pegawai.
- Jika `targetRank` tidak lebih tinggi dari golongan saat ini, backend menolak 422.

Response `201` berisi detail batch.

### Ubah draf / item

```ts
PATCH /promotion-requests/:id
{ "note": "...", "periodMonth": 11 }

POST /promotion-requests/:id/items
{ "items": [{ "employeeId": "uuid", "targetRank": "III/c", "effectiveDate": "2026-10-01" }] }

PATCH /promotion-requests/:id/items/:itemId
{ "targetRank": "III/c", "currentRankTmt": "2022-04-01", "effectiveDate": "2026-10-01", "note": "..." }

DELETE /promotion-requests/:id/items/:itemId
DELETE /promotion-requests/:id
```

Semua hanya saat batch `DRAFT`/`REVISION` (kecuali `DELETE /:id` juga hanya dua status
itu). Jangan tampilkan tombol edit bila `canEdit === false`.

### Dokumen

```ts
POST /promotion-requests/:id/items/:itemId/documents
// multipart/form-data: file, docType
```

Upload hanya saat `DRAFT`/`REVISION`. Jika `docType` sama diunggah lagi, dokumen lama
diganti. `docType` harus salah satu dari daftar checklist atau `LAINNYA`.

```ts
DELETE /promotion-requests/:id/items/:itemId/documents/:docId
```

Untuk unduh, **jangan** memakai `href={\`/api${d.downloadUrl}\`}` (akan dobel).
Backend mengembalikan `downloadUrl` lengkap `/api/v1/...`; buat helper:

```ts
const downloadHref = (url: string) => `/api${url.replace(/^\/api\/v1/, "")}`;
// <a href={downloadHref(d.downloadUrl)} target="_blank" rel="noreferrer">Unduh</a>
```

### Detail + aksi alur

```ts
GET /promotion-requests/:id
```

Response detail berisi `items`, `documentsChecklist`, `missingDocuments`, `timeline`,
`availableActions`, `canEdit`, `signers`, dan `outgoingLetter.archiveRecord`.

Aksi (semua `POST`; catatan wajib untuk `revise`/`reject`):

```ts
POST /promotion-requests/:id/legalize
{ "stampNumber": "STAMP-001", "legalizedAt": "2026-11-01", "note": "Cap pengesahan sudah dibubuhkan" }
// DRAFT/REVISION -> LEGALIZED; hanya Staf Kepegawaian/KEC-TAMALATE

POST /promotion-requests/:id/verify
{ "documentsComplete": true, "note": "Berkas lengkap" }
// LEGALIZED -> VERIFIED; hanya Kasubag; documentsComplete wajib true

POST /promotion-requests/:id/paraf
{ "note": "Paraf Sekcam" }
// VERIFIED -> PARAF; hanya jabatan SEKCAM

POST /promotion-requests/:id/approve
{ "note": "Disetujui Camat" }
// PARAF -> APPROVED; hanya jabatan CAMAT

POST /promotion-requests/:id/revise
{ "note": "Perbaiki SKP dan urutan berkas" } // minimal 5 karakter
// LEGALIZED/VERIFIED/PARAF -> REVISION

POST /promotion-requests/:id/reject
{ "note": "Tidak memenuhi syarat" } // minimal 5 karakter
// LEGALIZED/VERIFIED/PARAF -> REJECTED

POST /promotion-requests/:id/register
{
  "outgoingLetterDate": "2026-11-01",
  "sentAt": "2026-11-01",
  "note": "Registrasi dan kirim ke BKPSDM"
}
// APPROVED -> REGISTERED; hanya Staf Kepegawaian/KEC-TAMALATE
// Bila tidak memilih surat, backend membuat surat keluar otomatis.

POST /promotion-requests/:id/archive
{
  "archiveDate": "2026-11-01",
  "category": "AKTIF", // AKTIF|INAKTIF|PENTING
  "code": "800.1.3.2",
  "bundleCode": "PANGKAT-2026",
  "retentionUntil": "2031-11-01",
  "notes": "Berkas diarsipkan per golongan"
}
// REGISTERED -> ARCHIVED; hanya Staf Kepegawaian/KEC-TAMALATE
// Bila surat keluar ada dan belum punya arsip, backend membuat ArchiveRecord otomatis.
```

`register` juga menerima `outgoingLetterId`, `outgoingLetterNumber`, `agendaNumber`,
`createOutgoingLetter`, `classificationCode`, `letterCode`, `subject`, `recipient`,
`signerName`, dan `personInCharge` bila frontend ingin memilih/mengisi manual.
**Jangan membuat tombol “reservasi 3 nomor” khusus kenaikan pangkat.** Backend memakai
aturan buffer nomor yang sudah ada.

### Buku register / nominatif / arsip

```ts
GET /promotion-requests/register?year=2026&status=&q=
GET /promotion-requests/nominative?year=2026&month=11&status=&q=
GET /promotion-requests/archive-book?year=2026&q=
```

Ketiganya ditolak 403 untuk `EMPLOYEE`.

## 4. Rancangan halaman

### 4.1 `/kenaikan-pangkat`

- Filter status: Semua, Draf, Legalisasi, Terverifikasi, Paraf, Disetujui,
  Diregistrasi, Diarsipkan, Perlu revisi, Ditolak.
- Pencarian nomor usulan/nama/NIP/nomor surat.
- Tombol `+ Buat Usulan` hanya untuk `promotion.create`.
- Tombol `Daftar Calon`, `Buku Register`, `Nominatif`, `Buku Arsip` hanya untuk petugas
  (bukan `EMPLOYEE`).
- Kolom tabel: nomor usulan, periode, jumlah ASN, ringkasan nama, nomor surat,
  nomor arsip, status, aksi “Detail”.
- Gunakan `StatusBadge`; tambahkan label `LEGALIZED: "Berkas legalisasi"` dan tone
  info di `frontend/src/components/ui.tsx`.

### 4.2 `/kenaikan-pangkat/calon`

- Tabel calon: nama, NIP, unit, golongan saat ini, TMT pangkat, masa jabatan,
  jatuh tempo, golongan diusulkan, status kelayakan, status usulan.
- Default panggil `candidates?periodYear=<tahun>`.
- Sediakan toggle “Tampilkan yang belum jatuh tempo / belum ada TMT” yang mengirim
  `includeAll=true`.
- Baris dengan `existingItem` disable; tampilkan link ke batch yang sudah ada.
- Baris tanpa `rankTmt` tampilkan badge “TMT belum ada” dan input TMT di form.
- Form pilih beberapa calon, isi `targetRank` (default `suggestedTargetRank`),
  `effectiveDate`, dan `currentRankTmt` bila perlu, lalu `POST /promotion-requests`.
- Setelah sukses, redirect ke detail batch.

### 4.3 `/kenaikan-pangkat/[id]`

Workspace utama. Susun:

1. Header: nomor usulan, periode, status, pemegang saat ini, tombol kembali.
2. Stepper 8 langkah:
   - 1 Data calon, 2 Draf usulan, 3 Legalisasi, 4 Verifikasi Kasubag,
     5 Paraf Sekcam, 6 TTD Camat, 7 Registrasi & Kirim, 8 Arsip.
   - Mapping: `DRAFT` langkah 1–2, `LEGALIZED` 3, `VERIFIED` 4, `PARAF` 5,
     `APPROVED` 6, `REGISTERED` 7, `ARCHIVED` 8.
   - `REVISION` tandai langkah yang perlu diperbaiki + tampilkan catatan revisi;
     `REJECTED` hentikan stepper dan tampilkan alasan.
3. Panel aksi: render dari `availableActions`; jangan hardcode role.
4. Tabel item: nama/NIP, golongan saat ini → diusulkan, TMT, masa jabatan,
   status item, jumlah dokumen, tombol edit/hapus bila `canEdit`.
5. Checklist dokumen per item: 10 dokumen wajib + `LAINNYA`; tombol unggah,
   unduh, hapus. Tampilkan `missingDocuments` sebagai peringatan, bukan blokir.
6. Panel surat keluar: nomor, tanggal, agenda, perihal, tujuan, penandatangan,
   nomor arsip.
7. Timeline: aktor, jabatan, aksi, catatan, waktu.
8. Signers: Camat/Sekcam dari backend.

Modal aksi:

- **Legalisasi**: tanggal (default hari ini), nomor stempel (opsional), catatan.
  Kirim `legalize`.
- **Verifikasi**: tampilkan checklist semua item; checkbox “Dokumen lengkap”
  wajib dicentang; catatan. Kirim `documentsComplete: true`.
- **Revisi/Penolakan**: textarea catatan minimal 5 karakter.
- **Paraf**: catatan opsional.
- **Tanda tangan**: catatan opsional.
- **Registrasi**: tanggal surat (default hari ini, tidak boleh masa depan), tanggal
  kirim, catatan; opsi “buat surat keluar otomatis” aktif secara default.
- **Arsip**: tanggal arsip, kategori, kode, kode berkas, retensi, catatan.
  Tampilkan nomor arsip setelah sukses.

Setelah setiap aksi: refresh detail; jika 409 tampilkan pesan dan muat ulang;
jika 403 tampilkan toast “Tidak punya akses”.

### 4.4 Buku register

`GET /promotion-requests/register?year=...`

Kolom: nomor usulan, periode, jumlah ASN, daftar ASN (nama, NIP, golongan),
nomor surat, tanggal surat, nomor agenda, nomor arsip, tanggal arsip, status.
Sediakan filter tahun dan pencarian.

### 4.5 Daftar nominatif

`GET /promotion-requests/nominative?year=...&month=...`

Kolom: nomor, nomor usulan, nama, NIP, golongan saat ini, TMT pangkat saat ini,
golongan diusulkan, TMT kenaikan, masa jabatan, jabatan, unit kerja, status item,
checklist dokumen, nomor surat, nomor agenda, nomor arsip.

### 4.6 Buku arsip

`GET /promotion-requests/archive-book?year=...`

Kolom: tanggal arsip, nomor arsip, nomor usulan, nomor surat, tujuan, kategori,
lokasi, jumlah ASN, daftar ASN, status.

## 5. Perubahan kecil di frontend yang wajib

1. `frontend/src/lib/types.ts`: tipe di atas + `rankTmt` pada `EmployeeRef`.
2. `frontend/src/components/ui.tsx`: tambahkan label/tone `LEGALIZED` (dan status item
   bila memakai `StatusBadge` untuk item).
3. `frontend/src/components/shell.tsx`: menu `Kenaikan Pangkat` dengan
   `perm: "promotion.view"`; tambahkan title/subtitle untuk route baru.
4. Jangan mengubah `api.ts`; pola `apiFetch("/promotion-requests...")` sudah benar.

## 6. Edge case dan larangan

- **Jangan** menghitung kelayakan/pangkat di frontend sebagai sumber kebenaran.
  Tampilkan hasil backend; frontend hanya memberi peringatan.
- **Jangan** menambahkan tombol reservasi nomor. Nomor surat dibuat backend saat
  `register`.
- **Jangan** menampilkan tombol aksi berdasarkan role saja; gunakan
  `availableActions`.
- Pegawai tidak boleh membuka `/calon`, `/register`, `/nominatif`, `/arsip`;
  backend 403.
- Setelah `LEGALIZED`, upload/edit item tidak tersedia; tampilkan `canEdit: false`.
- `documentsComplete` adalah konfirmasi petugas, bukan berarti semua checklist
  terunggah. Jangan disable checkbox hanya karena ada `missingDocuments`.
- `revise`/`reject` wajib catatan minimal 5 karakter.
- Tanggal surat/arsip/legalisasi tidak boleh masa depan; retensi tidak boleh sebelum
  tanggal arsip.
- Jika `rankTmt` kosong, tampilkan peringatan dan minta input `currentRankTmt`.
- Nama field response memakai camelCase; jangan membaca `stored_path` (tidak dikirim).
- File maksimal 5MB, hanya pdf/jpg/jpeg/png.

## 7. Akun demo untuk uji manual

| Tahap | Akun | Password |
|---|---|---|
| Buat/legalisasi/register/arsip | `verifier1` | `Verifier123!` |
| Verifikasi Kasubag | `kasubag1` | `Kasubag123!` |
| Paraf Sekcam | `sekcam1` | `Sekcam123!` |
| Tanda tangan Camat | `camat1` | `Camat123!` |
| Pegawai calon | `pangkat1` | `Pangkat123!` |

`pangkat1` adalah `Andi Pangkat`, NIP `199001012018011009`, golongan `III/b`,
TMT `2022-04-01`, sehingga muncul sebagai calon pada 2026.

## 8. Checklist uji frontend

- [ ] Login `verifier1`, buka calon, `pangkat1` muncul dengan saran `III/c`.
- [ ] Buat usulan dari calon; nomor `PANGKAT-2026-0001`.
- [ ] Edit item (target/TMT/catatan), unggah satu dokumen, hapus/ganti dokumen.
- [ ] `legalize` dengan nomor stempel; status menjadi `LEGALIZED`.
- [ ] Login `kasubag1`, centang dokumen lengkap, `verify`.
- [ ] Login `sekcam1`, `paraf`.
- [ ] Login `camat1`, `approve`.
- [ ] Login `verifier1`, `register`; nomor surat dan agenda muncul.
- [ ] `archive`; nomor arsip muncul dan masuk buku arsip.
- [ ] Cek `/register`, `/nominatif`, `/arsip` berisi data yang sama.
- [ ] Login `pangkat1`: hanya melihat usulan yang memuat dirinya, tanpa tombol aksi.
- [ ] Coba aksi di luar tahap/role: harus 403/409 dan UI memuat ulang detail.
- [ ] Coba buka halaman petugas sebagai `EMPLOYEE`: harus 403/tersembunyi.
