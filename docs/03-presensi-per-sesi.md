# Presensi per-sesi (Opsi A) — usulan untuk backend

> Status: disepakati dengan tim frontend. Backend belum mengimplementasikan.
> Kontrak lama (`docs/02-api-contract.md` §4 + `docs/01-database-design.md` §3.5) menghitung **per hari**.

## 1. Aturan hitung yang disepakati

- 1 hari kerja (Senin–Jumat) = **2 sesi**: PAGI (apel masuk) dan SORE (apel pulang).
- 1 sesi tidak hadir = **1 ketidakhadiran**.
- **Pegawai bermasalah: ≥5 sesi tidak hadir dalam 1 minggu (Senin–Jumat).**
- Sesi PAGI "hadir" = ada `checkInAt` dengan status HADIR/TERLAMBAT.
- Sesi SORE "hadir" = ada `checkOutAt` (pulang cepat tetap dihitung hadir + flag `early` seperti sekarang).
- Status IZIN/SAKIT sehari penuh = **kedua sesi dimaafkan** (0 ketidakhadiran). ALPA/tanpa catatan = 2 ketidakhadiran.
- Batas waktu tetap: pagi 08:00, sore 16:00, Jumat sore 16:30 (env yang ada).

## 2. Yang perlu berubah

### 2.1 `GET /attendances/problematic` — hitung per sesi
- `absenceCount` = jumlah sesi yang tidak hadir (maks 10/minggu), threshold `>= 5`.
- Response tiap pegawai ditambah rincian per hari, contoh:
```json
{
  "employee": { "id": "uuid", "nip": "...", "name": "...", "position": "STAF" },
  "weekStart": "2026-09-28", "weekEnd": "2026-10-02",
  "absenceCount": 6,
  "days": [
    { "date": "2026-09-28", "pagi": "HADIR", "sore": "HADIR" },
    { "date": "2026-09-29", "pagi": "ABSEN", "sore": "ABSEN" }
  ]
}
```
Nilai sesi yang disarankan: `HADIR | TERLAMBAT | IZIN | SAKIT | ABSEN`.

### 2.2 `GET /employees` — baru (dibutuhkan juga oleh disposisi surat & input manual)
```text
GET /employees?q=&orgUnit=&employmentStatus=&page=&limit=
→ [{ id, nip, employeeNumber, name, position, rank, employmentStatus, orgUnit }]
```
Perm: `employee.view`. Tanpa ini halaman operator (checklist + disposisi) tidak bisa jadi dropdown.

### 2.3 Foto dokumentasi apel per sesi — baru
Proses manual memakai foto apel sebagai bukti. Usulan minimal:
```text
POST /attendances/session-photos (multipart: date, session=PAGI|SORE, file)
  → 201 { id, date, session, photoUrl, uploadedBy }   (perm: attendance.manage)
GET  /attendances/session-photos?from=&to=
```
Max 5MB, jpg/png saja. 1 foto per sesi per tanggal (upsert atau 409 bila sudah ada).

### 2.4 Pembinaan dalam fitur presensi — baru, minimal
SOP: bermasalah → lapor Sekcam → koordinasi Kasubag → verifikasi Camat →
surat panggilan → pembinaan → teruskan BKPSDM bila perlu. Usulan kontrak minimal:
```text
POST  /attendances/warning-letters/:id/summon { scheduledAt, note? }
  → surat panggilan (perm: attendance.manage)
PATCH /attendances/warning-letters/:id/coaching { result, followUp: NONE|BKPSDM, note? }
  → catat hasil pembinaan (perm: attendance.manage)
GET   /attendances/warning-letters (tambah filter followUp=BKPSDM)
```

## 3. Catatan untuk frontend (sudah dikerjakan / menunggu)

- Rekap mingguan per-sesi (tabel Pagi|Sore) sudah dihitung sisi klien sebagai tampilan sementara.
- Checklist operator, upload foto, dan UI pembinaan menunggu endpoint §2.2–§2.4.
- Keamanan: `GET /leave-requests/:id` masih membocorkan `approvals[].actor.passwordHash` — mohon dihapus dari response.

## 4. Status backend v2 (commit `bf60109`, sudah diimplementasikan teman backend)
- §2.1 problematic per sesi + `days[]` ✅ — frontend pakai `days[]`, label "sesi".
- §2.2 `GET /employees` (+ `GET /users`) ✅ — dropdown pegawai & penerima disposisi.
- §2.3 foto sesi ✅ (`POST/GET /attendances/session-photos`) — galeri + upload di `/presensi`.
- §2.4 pembinaan minimal ✅ (`summon` + `coaching`, filter `followUp`) — UI di detail teguran.
- passwordHash dihapus dari response ✅.
