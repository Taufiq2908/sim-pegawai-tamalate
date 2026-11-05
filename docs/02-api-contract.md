# SIMPEG-TAMALATE — API Contract v1 (untuk Frontend)

> Base URL dev: `http://localhost:3000/api/v1`
> Auth: `Authorization: Bearer <accessToken>` (JWT, expiry 15 mnt) + `refreshToken` via httpOnly cookie atau body.
> Semua response JSON envelope:
```json
{ "success": true, "message": "ok", "data": {}, "meta": null, "errors": null }
```
> Error: `{ "success": false, "message": "...", "errors": { "field": ["msg"] } }` dengan status 400/401/403/404/409/422/500.
> Waktu: ISO8601 UTC. File upload: `multipart/form-data`, max 5MB, pdf/jpg/jpeg/png.

## 1. Auth

### POST /auth/login
```json
// request
{ "username": "pegawai1", "password": "Pegawai123!" }
// response 200 data:
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "username": "pegawai1",
    "role": "EMPLOYEE",
    "position": "STAF",
    "orgUnit": { "id": "uuid", "code": "KEC-TAMALATE", "name": "Kecamatan Tamalate" },
    "employee": { "id": "uuid", "nip": "198...", "name": "Ahmad", "position": "STAF", "rank": "III/a", "joinDate": "2022-03-01", "employmentStatus": "PNS", "orgUnit": { "code": "KEC-TAMALATE", "name": "Kecamatan Tamalate" } },
    "permissions": ["auth.me","leave.view","leave.create","leave.submit","leave.document.upload"]
  }
}
```
401 jika username/password salah. 403 jika `is_active=false`.

### POST /auth/refresh
```json
{ "refreshToken": "..." }
```

### POST /auth/logout
Header Bearer wajib. Body: `{ "refreshToken": "..." }` (opsional, untuk revoke).

### GET /auth/me
Header Bearer wajib. Response = objek `user` sama seperti di login (tanpa token).

Frontend: simpan `permissions` di memory, gunakan untuk show/hide tombol. Tapi tetap handle 403 dari backend.
DATA PEGAWAI form cuti langsung dari `user.employee` di atas
(nama, NIP, jabatan=`position`, masa kerja=hitung dari `joinDate`, unit kerja=`orgUnit`)
— frontend tidak perlu fetch tambahan. Daftar 6 jenis cuti dari `GET /leave-types`:
TAHUNAN, BESAR, SAKIT, MELAHIRKAN, ALASAN_PENTING, LUAR_TANGGUNGAN.

## 2. Cuti — Daftar & Detail

### GET /leave-requests?status=SUBMITTED&page=1&limit=10&q=ahmad
Query: `status, leaveType, startFrom, startTo, q, page, limit, sort`.
Visibility:
* EMPLOYEE → hanya miliknya.
* VERIFIER/LEADER/SUPER_ADMIN → semua (v1, filter org belakangan).
```json
// data:
{
  "items": [
    {
      "id": "uuid", "requestNumber": "CUTI-2026-0001",
      "employee": { "id": "uuid", "name": "Ahmad", "nip": "198..." },
      "leaveType": { "code": "TAHUNAN", "name": "Cuti Tahunan" },
      "startDate": "2026-10-20", "endDate": "2026-10-22", "totalDays": 3,
      "status": "SUBMITTED", "currentHolderRole": "VERIFIER",
      "submittedAt": "2026-10-07T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1 }
}
```

### GET /leave-requests/:id
```json
{
  "id": "uuid", "requestNumber": "CUTI-2026-0001", "status": "SUBMITTED",
  "employee": {}, "leaveType": {},
  "startDate": "2026-10-20", "endDate": "2026-10-22", "totalDays": 3,
  "reason": "Acara keluarga", "addressDuringLeave": "Makassar", "contactDuringLeave": "081...",
  "revisionNote": null, "rejectionReason": null,
  "documents": [
    { "id": "uuid", "docType": "FORM_CUTI", "originalName": "form.pdf", "mimeType": "application/pdf", "sizeBytes": 12345, "downloadUrl": "/api/v1/leave-requests/:id/documents/:docId/download" }
  ],
  "timeline": [
    { "action": "CREATE", "fromStatus": "-", "toStatus": "DRAFT", "actor": "Ahmad (EMPLOYEE)", "note": null, "createdAt": "..." },
    { "action": "SUBMIT", "fromStatus": "DRAFT", "toStatus": "SUBMITTED", "actor": "Ahmad", "note": null, "createdAt": "..." }
  ],
  "availableActions": ["verify","revise","reject"]
}
```
`availableActions` dihitung backend dari (status + permission user login) — frontend cukup render tombol dari field ini.

### POST /leave-requests
Perm: `leave.create`. Body JSON (buat DRAFT dulu), lalu upload dokumen, lalu submit.
```json
{
  "leaveTypeCode": "TAHUNAN",
  "startDate": "2026-10-20",
  "endDate": "2026-10-22",
  "reason": "Acara keluarga",
  "addressDuringLeave": "Makassar",
  "contactDuringLeave": "08123456789"
}
// 201 → objek detail dengan status DRAFT, availableActions: ["submit"]
```
Validasi 422: tanggal terbalik, reason kosong, leaveType tidak aktif.

### PATCH /leave-requests/:id
Hanya saat DRAFT/REVISION dan hanya pemilik. Body sama seperti create (parsial boleh).
Mengganti jenis cuti: kirim `leaveTypeCode`; backend memvalidasi jenis aktif dan meng-update `leaveTypeId`.

### POST /leave-requests/:id/documents (multipart)
Perm: `leave.document.upload`. Hanya DRAFT/REVISION + pemilik (atau verifier nambah? v1: tidak).
Form fields: `docType=FORM_CUTI`, `file=<binary>`.
Response 201: objek dokumen.

### GET /leave-requests/:id/documents/:docId/download
Redirect/file stream. Tetap cek Bearer + `leave.view`.

## 3. Cuti — Workflow Actions

Semua POST JSON `{ "note": "..." }`. `note` wajib untuk revise/reject, opsional lainnya.
Setiap sukses → 200 dengan objek detail baru (status berubah) + timeline bertambah.

| endpoint | perm | dari status | ke status |
|---|---|---|---|
| POST /leave-requests/:id/submit | leave.submit | DRAFT,REVISION,POSTPONED | SUBMITTED (pemilik; ≥2 dokumen + SK_TERAKHIR; SAKIT wajib SURAT_DOKTER) |
| POST /leave-requests/:id/review | leave.review | SUBMITTED | REVIEWED (hanya atasan langsung; Camat/Sekcam/Lurah/kelurahan lewat) |
| POST /leave-requests/:id/verify | leave.verify | REVIEWED (atau SUBMITTED khusus pemohon Camat/Sekcam/Lurah/kelurahan) | VERIFIED (Kasubag — `kasubag1`) |
| POST /leave-requests/:id/revise | leave.verify/review | SUBMITTED (atasan langsung), REVIEWED (Kasubag) | REVISION |
| POST /leave-requests/:id/postpone | mengikuti wewenang tahap berjalan | SUBMITTED,REVIEWED,VERIFIED,PARAF | POSTPONED (DITANGGUHKAN; ajukan ulang via submit) |
| POST /leave-requests/:id/paraf | leave.paraf | VERIFIED | PARAF |
| POST /leave-requests/:id/approve | leave.approve | PARAF (atau VERIFIED khusus pemohon SEKCAM) | APPROVED (= setujui + tandatangani) |
| POST /leave-requests/:id/register | leave.register | APPROVED | REGISTERED (staf kecamatan saja) |
| POST /leave-requests/:id/tobkpsdm | leave.register | REGISTERED | SUBMITTED_BKPSDMD (staf kecamatan saja) |
| POST /leave-requests/:id/receiveresult | leave.register | SUBMITTED_BKPSDMD (wajib sudah ada SURAT_JAWABAN_BKPSDM) | COMPLETED (hasil BKPSDMD diterima + diserahkan) |
| POST /leave-requests/:id/complete | leave.sign | FORWARDED (jalur Camat→Sekda) | COMPLETED |
| POST /leave-requests/:id/archive | leave.register | COMPLETED | ARCHIVED (staf kecamatan saja) |
| POST /leave-requests/:id/forward | leave.forward | VERIFIED (khusus pemohon CAMAT) | FORWARDED |
| POST /leave-requests/:id/reject | leave.reject | SUBMITTED,VERIFIED,PARAF | REJECTED |

Pengecualian jabatan: pemohon SEKCAM lompat-paraf (`approve` langsung dari VERIFIED,
`paraf` ditolak 422); pemohon CAMAT diteruskan ke Sekda via `forward` (bukan `approve`);
penerusan BKPSDMD/arsip hanya staf kecamatan (403 bila operator kelurahan).
`availableActions` sadar jabatan pemohon: `forward` disembunyikan kecuali pemohon
CAMAT; `approve` pada VERIFIED disembunyikan kecuali pemohon SEKCAM; `paraf`
disembunyikan untuk pemohon SEKCAM; `review` disembunyikan bila melewati REVIEWED;
`verify` pada SUBMITTED disembunyikan bila masih menunggu REVIEWED.

Contoh:
```http
POST /api/v1/leave-requests/uuid/verify
{ "note": "Berkas lengkap" }
```
Error tipikal:
* 403 `{"message":"Forbidden: butuh permission leave.verify"}`
* 409 `{"message":"Status harus SUBMITTED, saat ini VERIFIED"}` (balapan klik / sudah diproses orang lain)
* 422 `{"message":"note wajib untuk revise"}`

Frontend wajib: disable tombol setelah klik, tampilkan `availableActions` ulang dari response, tampilkan 409 sebagai "data sudah berubah, refresh".

### 3a. Cuti — endpoint pendukung (05/06)

```text
POST /leave-requests/:id/answer-letter (multipart file) → catat SURAT_JAWABAN_BKPSDM (B1)
  perm leave.document.upload; hanya APPROVED/REGISTERED/SUBMITTED_BKPSDMD;
  pengunggah = pelaksana (bukan pemohon); status tidak berubah;
  receiveresult mensyaratkan dokumen ini ada. Unduh surat pengantar = link
  dokumen biasa, tanpa ubah status.
DELETE /leave-requests/:id → hapus DRAFT milik sendiri (409 bila bukan DRAFT).
GET /leave-requests?leaveType=&unit=&startFrom=&to=&q= → q mencari nama/NIP/nomor.
GET /employees/:id/supervisor → { direct, chain[], note } (B3; chain = nama+NIP+jabatan).
GET /employees/:id/leave-history?year=&status= → [{requestNumber, year, leaveType, days, status}] (B6).
GET /employees/:id/leave-balance?year= → {entitlement, used, remaining} cuti tahunan (B6).
  Aturan v1: hak = maxDays TAHUNAN aktif; terpakai = hari TAHUNAN berstatus
  APPROVED/SIGNED/REGISTERED/SUBMITTED_BKPSDMD/COMPLETED pada tahun tsb.
```

Notifikasi cuti (B8): setiap transisi menulis `notifications` tipe `LEAVE` untuk
pemegang tahap berikut (di-resolve dari permission tahap) + pemohon. Baca via
`GET /notifications` yang sudah ada. Timeline detail menyertakan snapshot
persetujuan digital (B11): `actorName/actorNip/actorPosition/createdAt`.

## 4. Presensi Apel

Jam (WITA, semua status kepegawaian): masuk ≤ `APEL_DEADLINE_TIME` (08:00) → HADIR;
pulang minimal `CHECKOUT_TIME_WEEKDAY` (16:00), Jumat `CHECKOUT_TIME_FRIDAY` (16:30).

### POST /attendances/check-in
Perm: `attendance.checkin` (semua role berpegawai: EMPLOYEE, VERIFIER, SUPERVISOR, LEADER).
Body `{}`. → 201 `{ record, serverTime, deadline, late }`, 409 bila sudah presensi.

### POST /attendances/check-out
Perm: `attendance.checkin`. Wajib sudah check-in; 409 bila sudah pulang.
→ `{ record, serverTime, requiredCheckout, early }`.

### POST /attendances
Perm: `attendance.manage` (staf operator + Kasubag). Input untuk orang lain/backdate
(tidak boleh masa depan; tanggal terkunci → 409).
Status: `HADIR|TERLAMBAT|IZIN|SAKIT|DL|ALPA` (`ALPA`=TK; `DL`=Dinas Luar,
memaafkan kedua sesi seperti IZIN/SAKIT).
```json
{ "employeeId": "uuid", "date": "2026-10-06", "status": "SAKIT", "note": "demam" }
// HADIR/TERLAMBAT wajib + "checkInTime": "07:05" (opsional + "checkOutTime": "16:05" untuk backdate pulang)
```

### PATCH /attendances/:id
Perm: `attendance.manage` (staf operator + Kasubag). Koreksi status/note/jam.
Tanggal terkunci → 409. Setiap PATCH mencatat `correctedBy/correctedAt`
(jejak "diubah Kasubag"); response record menyertakan `recorder` + `corrector`
(`{id, username, employee:{name}}`).

### GET /attendances/today
Perm: `attendance.view`. Catatan apel saya hari ini + jam server + deadline.

### GET /attendances?from=2026-10-01&to=2026-10-31&status=TERLAMBAT
Perm: `attendance.view`. EMPLOYEE otomatis hanya miliknya. Default rentang = bulan berjalan.

### GET /attendances/summary?from=&to=&orgUnit=KEC-TAMALATE
Perm: `attendance.summary`. Rekap per pegawai: `{ no, employee, kantor, counts: {HADIR,TERLAMBAT,IZIN,SAKIT,DL,ALPA}, rekapitulasi (=ALPA+IZIN+DL), recorded }`.

### GET /attendances/report?date=2026-10-07
Perm: `attendance.view`. Format tabel: `[{nomor, nama, nip, gol, jabatan, jamHadir, jamPulang, status, diisiOleh, koreksi}]` (jam WITA HH:MM, `-` bila kosong; tanpa catatan = `Tanpa keterangan`). `diisiOleh` = nama pengisi bila bukan mandiri, else null. `koreksi` = `{oleh, pada}` bila pernah dikoreksi operator/Kasubag, else null. EMPLOYEE hanya barisnya sendiri. Meta menyertakan `locked` (kunci Kasubag).

### GET /attendances/weekly-recap?weekStart=2026-09-28
Perm: `attendance.summary`. Rekapitulasi Daftar Hadir Per Pekan: satu baris per
pegawai dengan kolom `no, employee, kantor, jabatan, status, tk, izin, dl,`
`rekapitulasi (=tk+izin+dl), counts, absenceCount, isProblematic, days[]`
(matriks 5 hari `{pagi, sore}`). Meta: `totalEmployees, problematic`.

### POST /attendances/lock {date, note?}
Perm: `attendance.manage`, HANYA position KASUBAG (superadmin bypass).
"Simpan & Validasi": syarat foto PAGI+SORE; tanpa catatan → ALPA (SYSTEM);
hari terkunci (check-in/out, input, koreksi → 409).

### GET /attendances/problematic?weekStart=2026-09-28
Perm: `attendance.summary`. `weekStart` wajib Senin. Pegawai dengan ≥5 sesi
tidak hadir (IZIN/SAKIT/DL memaafkan kedua sesi; ALPA/tanpa catatan = 2 sesi).

### POST /attendances/warning-letters/generate {weekStart}
Perm: `attendance.manage`. Terbitkan surat teguran per pegawai bermasalah (idempoten per pekan).
Isi: Nama, NIP, Jabatan/Unit, periode, total sesi TK + rincian harian.
Otomatis notifikasi Sekcam + pemegang `attendance.summary` (tipe `ATTENDANCE`).

### POST /attendances/warning-letters/:id/summon → notifikasi pegawai yang dipanggil.
### POST /attendances/warning-letters/:id/forward {note?}
Perm: `attendance.forward` + position SEKCAM. Eskalasi Sekcam → Camat (notifikasi Camat).
### POST /attendances/warning-letters/:id/instruct {instruction}
Perm: `attendance.forward` + position CAMAT. "Tindak Lanjuti" (notifikasi pelaksana).
### GET /attendances/warning-letters/:id/print
Payload cetak/laporan BKPSDM: pegawai lengkap, summon, coaching, eskalasi,
pejabat (Camat/Sekcam/Kasubag), `statusPembinaan` (Menunggu/Diproses/Selesai).

### GET /attendances/warning-letters (+ /:id)

## 5. Surat Masuk & Disposisi

```text
POST /letters (JSON, atau multipart + file)          → DRAFT_TU   (letter.create)
  field: letterType=BIASA|UNDANGAN, submit=true|false, summary, classificationCode,
  activityDate?, activityStartTime?, activityEndTime?, activityLocation?, assignedUserIds[]
  submit=true → langsung REVIEW_SEKCAM; file/ringkasan/klasifikasi wajib
POST /letters/:id/submit                             → REVIEW_SEKCAM (letter.create)
POST /letters/:id/documents (multipart, max 10MB)                 (letter.document.upload, hanya DRAFT_TU)
GET  /letters/:id/documents/:docId/download                       (letter.view, scope surat)
POST /letters/:id/forward {note?}                    → DISPOSISI_CAMAT (letter.paraf, posisi SEKCAM)
POST /letters/:id/paraf {note?}                      → alias forward
POST /letters/:id/dispose {toUserId, instruction, deadline?}      (letter.dispose, posisi CAMAT)
POST /letters/:id/dispositions {instruction, deadline?, targets[]?, targetCodes[]?, toUserIds[]?}
  → disposisi massal; satu baris target = {targetCode?, toUserId?, instruction?, deadline?}
  → targetCodes memakai 9 kode tujuan
  → status DITERUSKAN; setiap penerima mendapat notifikasi DISPOSITION
POST /letters/dispositions/:dispId/accept             → ACCEPTED + buku ekspedisi (letter.followup, penerima)
POST /letters/dispositions/:dispId/followup {note}    → DONE; semua DONE → MENUNGGU_ARSIP
POST /letters/:id/complete {note?, dispositionId?}    → DONE untuk disposisi user; status agregat dihitung
POST /letters/:id/archive                            → DIARSIPKAN (archive.approve, Sekcam/Camat)
PATCH /letters/:id/agenda {activityDate?, activityStartTime?, activityEndTime?,
  activityLocation?, assignedUserIds[]?}                            (letter.register)
GET  /letters?status=&q=                  → scoped: admin/verifier semua, Sekcam tahap REVIEW_SEKCAM,
                                            Camat tahap DISPOSISI_CAMAT, penerima surat terkait
GET  /letters/:id                        → detail + dispositions[] + agendaAssignments[] + availableActions
  → dispositions[] memakai bentuk kanonik `from`/`to` (sama dengan GET /letters)
GET  /letters/classifications            → kode klasifikasi arsip aktif (letter.view)
GET  /letters/disposition-targets        → 9 tujuan disposisi + mappedPosition + recipients[] + available (letter.dispose)
GET  /letters/agenda?date=&from=&to=      → baris register-book + field mentah + assignedStaff[] (letter.view)
GET  /letters/agenda/tomorrow             → bentuk sama, untuk agenda esok hari (letter.view)
```

Status surat masuk:
`DRAFT_TU|REVIEW_SEKCAM|DISPOSISI_CAMAT|DITERUSKAN|PROSES|MENUNGGU_ARSIP|DIARSIPKAN`.
Status surat keluar: `RESERVED|TERKIRIM|DIARSIPKAN|CANCELLED`.
Status disposisi: `PENDING|ACCEPTED|DONE`.

`GET /letters/:id` juga mengembalikan `letterType`, `submittedAt`,
`completedAt`, `completionNote`, `archiveRecord`, dan `documents[].downloadUrl`.
Nilai `availableActions[]`: `submit`, `forward`, `dispose`, `accept`,
`complete`, `archive`, `upload` (bukan `paraf`). Setiap item `dispositions[]`
memiliki `acceptedAt`, `canAccept`, `canComplete`, dan `canFollowUp`.
Catatan Sekcam adalah disposisi dengan `from.id === to.id`; jangan dihitung
sebagai target/progres.

`POST /letters/:id/dispositions` menerima `instruction` (wajib, minimal 5
karakter), `deadline?`, `targetCodes?` (maksimal 9), `targets[]?`, atau
`toUserIds[]?`. Satu target dapat menghasilkan beberapa disposisi jika ada
beberapa user aktif pada jabatan yang sama.

`POST /letters/dispositions/:dispId/accept` tidak memakai body dan otomatis
membuat buku ekspedisi. `POST /letters/dispositions/:dispId/followup`
mewajibkan `{note}` minimal 3 karakter. Untuk multi-target, gunakan endpoint
`followup` per disposisi, bukan `POST /letters/:id/complete` tanpa
`dispositionId`.

### Buku agenda, lembar disposisi, ekspedisi (format siap tampil)

```text
GET /letters/register-book?from=&to=&q=&status=
  → [{nomor, nomorAgenda, instansiDitujukan, instansiAsal, noSurat, nomorSurat, tanggalSurat,
      tanggalDiterima, perihal, penanggungJawab, klasifikasi, ket, keterangan, status, petugasAgenda[]}]
GET /letters/:id/disposition-sheet    → {nomorAgenda, sifatSurat, tanggalPenerimaan, tanggalSurat, tanggalPenyelesaian,
                                          nomorSurat, asalSurat, ringkasanIsi, klasifikasi, disposisi[]}
POST /letters/:id/expedition {receiverName, signatureName?, note?}  → {regNumber, ...} (letter.expedition; legacy manual)
GET /letters/expedition-book?from=&to=&q=&letterId=
  → [{tanggalHariIni, nomorRegis, nomorAgenda, nomorSurat, tanggalSurat, perihal, penerimaSurat,
      paraf, jamTerima, waktuTerima, asalSurat, catatan}]
```

`GET /letters/agenda` dan `/letters/agenda/tomorrow` memakai kolom yang sama
dengan `register-book`, ditambah field mentah surat (mis. `sender`, `subject`,
`letterDate`, `activityDate`) dan `assignedStaff[]`. `nomor` adalah urutan hasil
query, bukan nomor agenda.

### Surat keluar + reservasi nomor (format `kode surat / seq / KT / romawi / tahun`)

```text
POST /outgoing-letters {classificationCode, subject, recipient, letterDate?, priority?, secrecy?,
  signerName?, letterCode?, destinationNumber?, personInCharge?, remarks?}
  → JSON atau multipart + file; langsung TERKIRIM                   (outgoing.create)
POST /outgoing-letters/reserve {classificationCode, letterDate, reason, signerName?,
  letterCode?, destinationNumber?, personInCharge?, remarks?}
  → RESERVED, nomor diamankan (letterDate ≤ hari ini)             (outgoing.reserve)
POST /outgoing-letters/reserve-bulk {count, classificationCode, letterDate, reason, ...}
  → maksimal 50 nomor RESERVED                                     (outgoing.reserve)
POST /outgoing-letters/:id/issue {recipient, subject?, letterCode?, destinationNumber?,
  personInCharge?, remarks?, ...} → TERKIRIM, nomor TETAP          (outgoing.issue)
POST /outgoing-letters/:id/cancel {reason} → CANCELLED, nomor tidak dipakai ulang (outgoing.cancel)
POST /outgoing-letters/:id/documents (multipart, 10MB)
GET  /outgoing-letters/:id/documents/:docId/download            (outgoing.view)
GET  /outgoing-letters?status=&q=  |  GET /outgoing-letters/:id
  → detail dan response mutasi memuat availableActions[]: issue, cancel, upload, resubmit_archive
GET  /outgoing-letters/register-book?year=&from=&to=&q=&status=
  → [{nomor, nomorUrut, instansiDituju, nomorTujuan, nomorSurat, tanggalSurat, tanggalCatat,
      perihal, penanggungJawab, kodeSurat, klasifikasi, penandatangan, ket, status}]
GET  /outgoing-letters/numbering?year= → status nomor terakhir + buffer backdate
```

Dokumen pada response surat memakai `downloadUrl`; `storedPath` tidak lagi
dikirim ke frontend. Contohnya
`/api/v1/outgoing-letters/:id/documents/:docId/download`. Di frontend, normalisasi
lewat helper `fileUrl(url)`/`downloadHref(url)` yang membuang prefix `/api/v1`
sebelum memanggil proxy `/api` (jangan menempel `/api` langsung ke `downloadUrl`).

### Arsip

```text
GET /archives/stats?year=2026                                      (archive.view)
  → {year, total, unlisted, signedLists, byCategory, bySource}
GET /archives?year=&sourceType=&category=&classificationCode=&q=&page=&limit= (archive.view)
GET /archives/:id                                                  (archive.view; termasuk physicalLocation)
PATCH /archives/:id {..., physicalLocation?}                        (archive.update, hanya SUPER_ADMIN)
POST /archives/lists | GET /archives/lists | POST /archives/lists/:id/records
POST /archives/lists/:id/sign
```

`GET /archives` mendukung filter tahun, `classificationCode`, dan `q`
(nomor arsip/uraian/nomor dokumen/kode/berkas/catatan/lokasi fisik/pengirim/
tujuan). `POST /archives` dan `GET /archives/candidates` sudah dihapus.

`/archives/stats` menghitung record berdasarkan `archiveDate` pada tahun yang
diminta. `byCategory` hanya berisi kategori yang punya record (frontend sebaiknya
default ke 0); `unlisted` = record belum masuk daftar arsip; `signedLists` =
jumlah daftar arsip berstatus `SIGNED` pada tahun tersebut.

Aturan: tanggal surat tidak boleh masa depan; tanggal surat boleh < tanggal catat (backdate);
CANCELLED terminal; sequence dilindungi UNIQUE(year, sequence_number).
Buffer backdate: saat tanggal surat berganti, 3 nomor setelah nomor terakhir tanggal lama
dikunci untuk surat menyusul; tanggal baru mulai setelah 3 nomor tersebut. Buffer habis → 409.
Nomor tahun baru dimulai dari 1 (sequence tahunan).

### Persetujuan arsip semi-otomatis

Spesifikasi lengkap ada di `docs/14-surat-workflow-revision.md`. Ringkasan
kontrak final:

```text
GET  /letters/archive-queue?q=&page=&limit=            (archive.approve)
  → surat masuk status MENUNGGU_ARSIP, archiveRecord null
GET  /outgoing-letters/archive-queue?q=&page=&limit=   (archive.approve)
  → surat keluar status TERKIRIM, archiveRecord null, archiveRejectedAt null

POST /letters/archive-approvals/batch
  { ids: ["uuid", "..."] }                             (maks 15)
  → { approved: [{id, archiveNumber}], skipped: [{id, reason}] }

POST /outgoing-letters/archive-approvals/batch
  { ids: ["uuid", "..."] }                             (maks 15)
  → { approved: [{id, archiveNumber}], skipped: [{id, reason}] }

POST /letters/archive-approvals/reject
  { ids: ["uuid"], note: "..." }                       (maks 15)
  → { rejected: [...], skipped: [...] }

POST /outgoing-letters/archive-approvals/reject
  { ids: ["uuid"], note: "..." }                       (maks 15)
  → { rejected: [...], skipped: [...] }

POST /outgoing-letters/:id/resubmit-archive            (outgoing.issue)
  → surat kembali ke antrean, flag reject dibersihkan
```

Baris antrean surat masuk memakai field kanonik `agendaNumber`,
`letterNumber`, `subject`, `sender`, `receivedDate`, `completedAt`, `status`,
dan `classification`. Baris antrean surat keluar memakai `letterNumber`,
`subject`, `recipient`, `letterDate`, `issuedAt`, `status`, dan `classification`.
Keduanya masih menyertakan alias lama (`nomor`, `nomorSurat`, `perihal`,
`asalTujuan`, `tanggalSelesai`, `tanggalDiterima`/`tanggalSurat`, `klasifikasi`)
untuk kompatibilitas UI; field kanonik adalah sumber utama.

Surat masuk memakai `MENUNGGU_ARSIP` sebagai antrean dan `DIARSIPKAN`
setelah disetujui. Surat keluar memakai `TERKIRIM` sebagai antrean dan
`DIARSIPKAN` setelah disetujui; `archiveRejectedAt` menandakan perlu revisi.
Permission `archive.approve`/`archive.reject` tidak cukup: route juga
mensyaratkan posisi `SEKCAM`/`CAMAT` atau role `SUPER_ADMIN`. Approver pertama
menentukan. Batch mendukung partial success, maksimal 15 ID per request. ID memakai UUID, bukan
integer. Approve membuat `ArchiveRecord` otomatis dan menyalin metadata yang
sudah ada. Setiap surat yang masuk antrean mengirim notifikasi tipe
`ARCHIVE_APPROVAL` ke Sekcam/Camat.

### Notifikasi (milik sendiri, cukup login)

```text
GET /notifications?unread=true  |  GET /notifications/unread-count  |  PATCH /notifications/:id/read
PATCH /notifications/read-all   → { updated } semua notifikasi user login
```
Disposisi baru otomatis membuat notifikasi untuk penerima.

## 6. KGB (pola sama seperti cuti, prefix `kgb.`)

```text
POST /kgb-requests {oldRank, newRank, oldSalary, newSalary, effectiveDate, note?} → DRAFT
PATCH /kgb-requests/:id                        (DRAFT/REVISION, pemilik)
POST /kgb-requests/:id/documents (multipart)   docType: SK_TERAKHIR|SKP|KP4|LAINNYA
GET  /kgb-requests/:id/documents/:docId/download
POST /kgb-requests/:id/submit|verify|revise|paraf|approve|reject {note?}
POST /kgb-requests/:id/register {note}          APPROVED → REGISTERED (catat no. surat keluar; staf kecamatan)
POST /kgb-requests/:id/tobkpsdm {note?}         REGISTERED → SUBMITTED_BKPSDMD (kirim ke BKD)
POST /kgb-requests/:id/complete {note?}         SUBMITTED_BKPSDMD → COMPLETED (hasil diterima)
POST /kgb-requests/:id/archive                  COMPLETED → ARCHIVED (staf kecamatan)
GET  /kgb-requests?status=&q=   → detail berisi availableActions + timeline + camat
GET  /kgb-requests/monitoring   → daftar pegawai + KGB terakhir (step 1 SOP)
  Response menyertakan nextKgbDate, monthsUntil, dueSoon (≤3 bulan), isOverdue, requiredDocs.
  Basis jatuh tempo = KGB final terakhir (COMPLETED/ARCHIVED) + 2 tahun; bila belum ada, tanggal masuk.
  Draf/revisi yang belum final tidak menggeser tanggal. Meta: {total, dueSoon, overdue}.
GET  /kgb-requests/register-book?year= → buku register KGB (step 7 SOP)
  [{tglSk, nama, nip, gol, pangkat, jabatan, unitKerja,
    lama:{nomorSk, tanggalSk, tglMulai, masaKerja, tahun, golMasaKerja, gajiPokok},
    baru:{tglMulai, kgbYad, masaKerja, tahun, golMasaKerja, gajiPokok}]
POST /kgb-requests/reminders/generate → buat notifikasi pengingat KGB
  perm kgb.remind; pegawai yang jatuh tempo ≤3 bulan ATAU terlambat ≤12 bulan; notifikasi ke pegawai + staf kepegawaian + kasubag.
  Response per pegawai: {employee, nextKgbDate, monthsUntil, isOverdue, notified}.
  berisi daftar berkas yang harus disiapkan (SK_CPNS_TERAKHIR, SK_PANGKAT_TERAKHIR, SKP_2_TAHUN, KP4, KTP, NPWP, REKENING_GAJI)
DELETE /kgb-requests/:id        → hapus DRAFT milik sendiri
```

Aturan khusus: `newSalary > oldSalary` (422 bila tidak). Ekor (register→archive) hanya staf kecamatan. `register` mensyaratkan `note` (nomor surat keluar). `complete` mensyaratkan sudah dikirim (SUBMITTED_BKPSDMD). Step 7-9 SOP terintegrasi dengan buku agenda surat keluar + buku ekspedisi (operator mencatat manual via endpoint surat yang ada). Detail menyertakan field `camat` ({name, nip, position}).
Setiap transisi KGB membuat notifikasi `type=KGB`, `referenceType=kgb_request`, `referenceId=<id KGB>` untuk pemegang tahap berikut + pemohon. Buku register memakai nomor/tanggal dari approval REGISTER; kolom `gol`/`pangkat` memakai golongan baru.

## 7. Master & User (untuk dropdown & admin)

```text
GET /leave-types                    → [{code,name,maxDays}]
GET /employees?q=&orgUnit=&page=    → perm employee.view
GET /users/me → sama dengan /auth/me (alias, pilih satu)
```

User/role management full (`POST /users`, `PUT /users/:id/permissions`) dikerjakan setelah cuti stabil — frontend jangan hardcode dulu.

## 8. Contoh Alur Frontend (Cuti)

```text
1. Login → simpan accessToken + user.permissions.
2. GET /auth/me saat reload untuk pulihkan sesi.
3. Halaman list: GET /leave-requests (employee lihat own, verifier lihat SUBMITTED).
4. Form: GET /leave-types → POST /leave-requests → upload docs → POST .../submit.
5. Detail: render timeline + availableActions → tombol verify/paraf/approve panggil endpoint sesuai.
6. Setiap 403 → toast "Tidak punya akses"; 409 → refresh detail.
```

## 9. Yang Backend Jamin vs Yang Frontend Jangan Lakukan

Backend jamin: hitung `totalDays`, generate `requestNumber`, cek permission+status+ownership, tulis `leave_approvals`, tolak file >5MB/bukan pdf-gambar.
Frontend jangan: hitung totalDays sendiri sebagai sumber kebenaran, sembunyikan tombol sebagai satu-satunya proteksi, tebak `availableActions` dari role di sisi klien, expose `stored_path` langsung.

## 10. Pensiun PNS (prefix `pension.`)

Backend tersedia di `/api/v1/pension-requests`. Kontrak lengkap, tipe TypeScript,
dan rancangan halaman ada di `docs/08-pensiun-requirement.md` dan
`docs/09-frontend-pensiun-handoff.md`.

```text
GET  /pension-requests/bup?year=&from=&to=&bupAge=     → daftar PNS memasuki BUP (langkah 1)
GET  /pension-requests/required-docs                   → checklist dokumen + tipe file
POST /pension-requests {periodYear, periodMonth?, note?, items[]} → DRAFT
PATCH /pension-requests/:id                            (DRAFT/REVISION, pemilik)
POST /pension-requests/:id/items {items[]}
DELETE /pension-requests/:id/items/:itemId
POST /pension-requests/:id/items/:itemId/documents (multipart)  docType
GET  /pension-requests/:id/items/:itemId/documents/:docId/download
DELETE /pension-requests/:id/items/:itemId/documents/:docId
POST /pension-requests/:id/verify|revise|reject|paraf|approve {note?}
POST /pension-requests/:id/register                    APPROVED → REGISTERED
POST /pension-requests/:id/expedite                    REGISTERED → EXPEDITED
POST /pension-requests/:id/send                        EXPEDITED → SENT
POST /pension-requests/:id/complete                    SENT → COMPLETED
POST /pension-requests/:id/archive                     COMPLETED → ARCHIVED
GET  /pension-requests?status=&year=&q=&page=&limit=
GET  /pension-requests/:id                            → items, checklist, timeline, availableActions
GET  /pension-requests/register?year=
GET  /pension-requests/nominative?year=&month=
GET  /pension-requests/expedition-book?year=
DELETE /pension-requests/:id                          → hapus DRAFT milik sendiri
```

Aturan khusus: `verify` wajib `documentsComplete: true`; `revise`/`reject` wajib
catatan minimal 5 karakter; `paraf` hanya jabatan `SEKCAM`; `approve` hanya jabatan
`CAMAT`; `register`/`expedite`/`send`/`complete`/`archive` hanya `orgUnit.code =
KEC-TAMALATE`. `register` tanpa surat keluar manual dan tanpa
`createOutgoingLetter: false` akan membuat surat keluar otomatis memakai service
penomoran (buffer backdate 3 nomor ditangani backend). Frontend tidak boleh membuat
tombol reservasi nomor. List/detail `EMPLOYEE` otomatis dibatasi ke usulan yang
memuat dirinya; buku register/nominatif/ekspedisi hanya untuk petugas.

## 11. Kenaikan Pangkat ASN (prefix `promotion.`)

Backend tersedia di `/api/v1/promotion-requests`. Kontrak lengkap, tipe TypeScript,
dan rancangan halaman ada di `docs/10-kenaikan-pangkat-requirement.md` dan
`docs/11-frontend-kenaikan-pangkat-handoff.md`.

Status: `DRAFT → LEGALIZED → VERIFIED → PARAF → APPROVED → REGISTERED → ARCHIVED`,
dengan cabang `REVISION` dan `REJECTED`.

```text
GET  /promotion-requests/candidates?periodYear=&asOf=&minYears=4&includeAll=
GET  /promotion-requests/required-docs                 → 10 dokumen SOP + LAINNYA
GET  /promotion-requests?status=&year=&q=&page=&limit=
POST /promotion-requests {periodYear, periodMonth?, note?, items[]} → DRAFT
PATCH /promotion-requests/:id                          (DRAFT/REVISION)
POST /promotion-requests/:id/items {items[]}
PATCH /promotion-requests/:id/items/:itemId
DELETE /promotion-requests/:id/items/:itemId
DELETE /promotion-requests/:id                         → hapus DRAFT/REVISION
POST /promotion-requests/:id/items/:itemId/documents (multipart)  docType
GET  /promotion-requests/:id/items/:itemId/documents/:docId/download
DELETE /promotion-requests/:id/items/:itemId/documents/:docId
GET  /promotion-requests/:id                          → items, checklist, timeline, availableActions
POST /promotion-requests/:id/legalize                  DRAFT/REVISION → LEGALIZED
POST /promotion-requests/:id/verify                    LEGALIZED → VERIFIED
POST /promotion-requests/:id/paraf                     VERIFIED → PARAF
POST /promotion-requests/:id/approve                   PARAF → APPROVED
POST /promotion-requests/:id/revise|reject             → REVISION/REJECTED
POST /promotion-requests/:id/register                  APPROVED → REGISTERED
POST /promotion-requests/:id/archive                   REGISTERED → ARCHIVED
GET  /promotion-requests/register?year=&status=&q=
GET  /promotion-requests/nominative?year=&month=&status=&q=
GET  /promotion-requests/archive-book?year=&q=
```

Aturan khusus: satu usulan adalah `PromotionBatch` berisi banyak `PromotionItem`
ASN. `targetRank` bila kosong memakai golongan berikutnya; `effectiveDate` bila
kosong memakai tanggal 1 bulan periode (atau 1 April). `currentRankTmt` wajib bila
master `employee.rankTmt` kosong. `verify` wajib `documentsComplete: true` setelah
Kasubag memeriksa berkas. `legalize`/`register`/`archive` hanya `orgUnit.code =
KEC-TAMALATE`; `paraf` hanya jabatan `SEKCAM`; `approve` hanya jabatan `CAMAT`;
`revise`/`reject` mengikuti tahap aktif. `register` otomatis membuat surat keluar
(kode klasifikasi default `800.1.3.2`) memakai service penomoran yang ada, dan
`archive` otomatis membuat `ArchiveRecord` bila surat keluar sudah ada. Frontend
tidak boleh membuat nomor sendiri atau tombol reservasi nomor. `EMPLOYEE` hanya
melihat usulan yang memuat dirinya; halaman calon/register/nominatif/arsip khusus
petugas. Gunakan `availableActions` dari detail sebagai sumber tombol aksi.

> Catatan path frontend: panggil `apiFetch("/pension-requests...")` dan
> `apiFetch("/promotion-requests...")` **tanpa** `/v1`. Untuk tautan unduhan,
> backend mengembalikan `/api/v1/...`; ubah dengan
> `'/api' + url.replace(/^\/api\/v1/, '')` agar tidak dobel `/api`.
