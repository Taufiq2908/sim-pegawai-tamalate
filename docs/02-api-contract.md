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
Tanggal terkunci → 409.

### GET /attendances/today
Perm: `attendance.view`. Catatan apel saya hari ini + jam server + deadline.

### GET /attendances?from=2026-10-01&to=2026-10-31&status=TERLAMBAT
Perm: `attendance.view`. EMPLOYEE otomatis hanya miliknya. Default rentang = bulan berjalan.

### GET /attendances/summary?from=&to=&orgUnit=KEC-TAMALATE
Perm: `attendance.summary`. Rekap per pegawai: `{ no, employee, kantor, counts: {HADIR,TERLAMBAT,IZIN,SAKIT,DL,ALPA}, rekapitulasi (=ALPA+IZIN+DL), recorded }`.

### GET /attendances/report?date=2026-10-07
Perm: `attendance.view`. Format tabel: `[{nomor, nama, nip, gol, jabatan, jamHadir, jamPulang, status}]` (jam WITA HH:MM, `-` bila kosong). EMPLOYEE hanya barisnya sendiri. Meta menyertakan `locked` (kunci Kasubag).

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
POST /letters (JSON, atau multipart + file)          → RECEIVED   (letter.create)
POST /letters/:id/documents (multipart, max 10MB)                 (letter.document.upload)
POST /letters/:id/dispose {toUserId, instruction, deadline?}      (letter.dispose)
POST /letters/dispositions/:dispId/followup {note}   → DONE       (letter.followup, hanya penerima)
POST /letters/:id/complete {note?}                   → COMPLETED  (letter.complete, wajib semua disposisi DONE)
POST /letters/:id/archive                            → ARCHIVED   (letter.archive)
GET  /letters?status=&q=                  → scoped: admin/verifier semua, lainnya hanya yang melibatkan dirinya
GET  /letters/:id                        → detail + dispositions[] + availableActions + canFollowUp per disposisi
GET  /letters/classifications            → kode klasifikasi arsip aktif (letter.view)
GET  /letters/disposition-targets        → 9 tujuan disposisi tetap (letter.dispose)

### Buku agenda, lembar disposisi, ekspedisi (format siap tampil)

```text
GET /letters/register-book?from=&to=  → [{nomor, instansiDitujukan, noSurat, tanggalSurat, perihal, penanggungJawab, ket}]
GET /letters/:id/disposition-sheet    → {nomorAgenda, sifatSurat, tanggalPenerimaan, tanggalSurat, tanggalPenyelesaian,
                                          nomorSurat, asalSurat, ringkasanIsi, klasifikasi, disposisi[]}
POST /letters/:id/expedition {receiverName, signatureName?, note?}  → {regNumber, ...} (letter.expedition)
GET /letters/expedition-book          → [{tanggalHariIni, nomorRegis, tanggalSurat, penerimaSurat, paraf, asalSurat}]
```

### Surat keluar + reservasi nomor (format `klasifikasi / seq / KT / romawi / tahun`)

```text
POST /outgoing-letters {classificationCode, subject, recipient, letterDate?, priority?, secrecy?, signerName?}
  → ISSUED langsung, nomor dari sequence tahun berjalan            (outgoing.create)
POST /outgoing-letters/reserve {classificationCode, letterDate, reason, signerName?}
  → RESERVED, nomor diamankan (letterDate ≤ hari ini)             (outgoing.reserve)
POST /outgoing-letters/:id/issue {recipient, subject?, ...} → ISSUED, nomor TETAP (outgoing.issue)
POST /outgoing-letters/:id/cancel {reason} → CANCELLED, nomor tidak dipakai ulang (outgoing.cancel)
POST /outgoing-letters/:id/documents (multipart, 10MB)
GET  /outgoing-letters?status=&q=  |  GET /outgoing-letters/:id
GET  /outgoing-letters/register-book?year= → buku agenda keluar per nomor urut
```

Aturan: tanggal surat tidak boleh masa depan; tanggal surat boleh < tanggal catat (backdate via reservasi);
CANCELLED terminal; sequence dilindungi UNIQUE(year, sequence_number).

### Notifikasi (milik sendiri, cukup login)

```text
GET /notifications?unread=true  |  GET /notifications/unread-count  |  PATCH /notifications/:id/read
```
Disposisi baru otomatis membuat notifikasi untuk penerima.
```

## 6. KGB (pola sama seperti cuti, prefix `kgb.`)

```text
POST /kgb-requests {oldRank, newRank, oldSalary, newSalary, effectiveDate, note?} → DRAFT
PATCH /kgb-requests/:id                        (DRAFT/REVISION, pemilik)
POST /kgb-requests/:id/documents (multipart)   docType: SK_TERAKHIR|SKP|KP4|LAINNYA
GET  /kgb-requests/:id/documents/:docId/download
POST /kgb-requests/:id/submit|verify|revise|paraf|approve|reject|complete {note?}
GET  /kgb-requests?status=&q=   → detail berisi availableActions + timeline
```

Aturan khusus: `newSalary > oldSalary` (422 bila tidak), tanpa tahap SIGNED.

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
