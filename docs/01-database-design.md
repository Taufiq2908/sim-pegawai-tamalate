# SIMPEG-TAMALATE — Database Design v1 (Foundation + Cuti)

> Scope MVP 2 hari: Foundation (auth/RBAC) + Cuti workflow end-to-end.
> DB: PostgreSQL 15+. PK: UUID. Waktu: `timestamptz`. Uang/file-size: integer.

## 1. ER Ringkas

```text
organizational_units (self-ref parent_id)
        ↑               ↑
    employees        users
     ↑  ↑              ↑
     │  └────┬────────┘
     │       │
leave_requests    role_permissions
     │       │      ↑  ↑
     │       │    roles permissions
     ├── leave_documents
     └── leave_approvals → users (actor)
```

* `users.employee_id` UNIQUE NULLABLE (1 user ↔ 1 employee, tapi SUPER_ADMIN boleh tanpa employee).
* `users.role` = 1 dari 4: `SUPER_ADMIN|VERIFIER|LEADER|EMPLOYEE`.
* `users.position` + `user_permission_overrides` = pembeda Camat/Sekcam/Lurah/Kasi.
* `leave_requests.employee_id` → pengaju. `leave_approvals.actor_user_id` → pelaku aksi.

## 2. Tabel Foundation

### 2.1 organizational_units

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| code | varchar(20) UNIQUE NOT NULL | ex: `KEC-TAMALATE`, `KEL-MANNURUKI` |
| name | varchar(150) NOT NULL | |
| type | varchar(30) NOT NULL | `KECAMATAN\|KELURAHAN\|SEKSI\|SUBBAG` |
| parent_id | uuid NULL | FK → organizational_units.id ON DELETE RESTRICT |
| leader_user_id | uuid NULL | FK → users.id (diisi belakangan, nullable agar tidak circular) |
| is_active | boolean NOT NULL | default true |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now() |

Index: `parent_id`, `type`.

### 2.2 roles

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| code | varchar(30) UNIQUE NOT NULL | `SUPER_ADMIN\|VERIFIER\|LEADER\|EMPLOYEE` |
| name | varchar(100) NOT NULL | |
| description | text NULL | |
| created_at | timestamptz | |

Seed tetap 4 baris. Jangan tambah `ROLE_CAMAT` dll.

### 2.3 permissions

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| code | varchar(60) UNIQUE NOT NULL | format `resource.action`, ex: `leave.approve` |
| resource | varchar(30) NOT NULL | `leave\|user\|employee\|master` |
| action | varchar(30) NOT NULL | `view\|create\|submit\|verify\|paraf\|approve\|sign\|reject\|revise\|manage` |
| description | text NULL | |

Seed MVP (minimal):

```text
auth.me
user.view, user.manage
employee.view, employee.manage
master.view
leave.view, leave.create, leave.submit
leave.verify, leave.revise
leave.paraf
leave.approve, leave.reject, leave.sign
leave.document.upload
```

### 2.4 role_permissions

| kolom | tipe | constraint |
|---|---|---|
| role_id | uuid NOT NULL | FK → roles.id ON DELETE CASCADE |
| permission_id | uuid NOT NULL | FK → permissions.id ON DELETE CASCADE |
| created_at | timestamptz | |

PK komposit `(role_id, permission_id)`.

Default mapping:

| role | permissions |
|---|---|
| SUPER_ADMIN | semua (`*`) |
| VERIFIER | `auth.me, employee.view, leave.view, leave.verify, leave.revise, leave.document.upload` |
| LEADER | `auth.me, employee.view, leave.view, leave.paraf, leave.approve, leave.reject, leave.sign` (dipangkas per-user via overrides) |
| EMPLOYEE | `auth.me, leave.view(own), leave.create, leave.submit, leave.document.upload` |

### 2.5 employees

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| nip | varchar(30) UNIQUE NULL | PNS/PPPK wajib isi; paruh waktu boleh null tapi `employee_number` wajib |
| employee_number | varchar(30) UNIQUE NOT NULL | nomor internal fallback jika NIP null |
| name | varchar(150) NOT NULL | |
| gender | char(1) NOT NULL | `L\|P` |
| birth_place | varchar(100) NULL | |
| birth_date | date NULL | |
| employment_status | varchar(20) NOT NULL | `PNS\|PPPK\|PPPK_PARUH_WAKTU\|HONORER` |
| position | varchar(50) NOT NULL | `CAMAT\|SEKCAM\|LURAH\|KASI\|KASUBAG\|STAF\|...` bebas, bukan role |
| rank | varchar(20) NULL | golongan ex: `III/a` |
| org_unit_id | uuid NOT NULL | FK → organizational_units.id |
| phone | varchar(20) NULL | |
| address | text NULL | |
| join_date | date NULL | |
| is_active | boolean NOT NULL default true | |
| created_at / updated_at | timestamptz | |

Index: `org_unit_id`, `employment_status`, `position`.

### 2.6 users

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| username | varchar(50) UNIQUE NOT NULL | lowercase, ex: `ahmad.camat` |
| password_hash | varchar(255) NOT NULL | bcrypt/argon2, tidak pernah ke frontend |
| employee_id | uuid UNIQUE NULL | FK → employees.id ON DELETE RESTRICT |
| role | varchar(20) NOT NULL | FK logis → roles.code (`SUPER_ADMIN\|VERIFIER\|LEADER\|EMPLOYEE`) |
| position | varchar(50) NULL | duplikasi dari employee untuk akses cepat (CAMAT/SEKCAM/...) |
| org_unit_id | uuid NULL | FK → organizational_units.id |
| is_active | boolean NOT NULL default true | |
| last_login_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | |

Index: `role`, `org_unit_id`, `employee_id`.

### 2.7 user_permission_overrides

Untuk memangkas/menambah permission per Leader tanpa bikin role baru.

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | FK → users.id ON DELETE CASCADE |
| permission_id | uuid NOT NULL | FK → permissions.id ON DELETE CASCADE |
| effect | varchar(10) NOT NULL | `GRANT\|DENY`, DENY menang atas GRANT |
| reason | varchar(255) NULL | ex: "Camat saja yang boleh sign" |
| created_at | timestamptz | |

UNIQUE `(user_id, permission_id)`.

Contoh:

```text
Camat  (LEADER): GRANT leave.approve, GRANT leave.sign, DENY leave.verify
Sekcam (LEADER): GRANT leave.paraf, DENY leave.approve, DENY leave.sign
Lurah  (LEADER): GRANT leave.verify (untuk staf kelurahan), DENY leave.approve
```

Resolusi efektif backend: `role_permissions + GRANT - DENY`.

## 3. Tabel Cuti

### 3.1 leave_types (master kecil)

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| code | varchar(30) UNIQUE NOT NULL | `TAHUNAN\|SAKIT\|MELAHIRKAN\|BESAR\|ALASAN_PENTING\|DILUAR_TANGGUNGAN` |
| name | varchar(100) NOT NULL | |
| max_days | integer NULL | batas per tahun, null = tidak dibatasi sistem |
| requires_document | boolean default false | sakit > X hari wajib surat dokter |
| is_active | boolean default true | |

### 3.2 leave_requests

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| request_number | varchar(40) UNIQUE NOT NULL | format `CUTI-2026-0001`, generate backend |
| employee_id | uuid NOT NULL | FK → employees.id |
| leave_type_id | uuid NOT NULL | FK → leave_types.id |
| start_date | date NOT NULL | |
| end_date | date NOT NULL | CHECK end_date >= start_date |
| total_days | integer NOT NULL | dihitung backend (hari kalender, v1) |
| reason | text NOT NULL | |
| address_during_leave | varchar(255) NULL | |
| contact_during_leave | varchar(30) NULL | |
| status | varchar(20) NOT NULL | `DRAFT\|SUBMITTED\|REVISION\|VERIFIED\|PARAF\|APPROVED\|SIGNED\|COMPLETED\|REJECTED` default DRAFT |
| submitted_at | timestamptz NULL | |
| current_holder_role | varchar(20) NULL | hint frontend: `VERIFIER\|LEADER\|EMPLOYEE\|DONE` |
| rejection_reason | text NULL | diisi saat REJECT |
| revision_note | text NULL | diisi saat REVISION |
| created_by | uuid NOT NULL | FK → users.id (pengaju login) |
| created_at / updated_at | timestamptz | |

Index: `(employee_id, status)`, `status`, `start_date`.

### 3.3 leave_documents

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| leave_request_id | uuid NOT NULL | FK → leave_requests.id ON DELETE CASCADE |
| doc_type | varchar(50) NOT NULL | `FORM_CUTI\|SK_TERAKHIR\|SURAT_DOKTER\|KK\|LAINNYA` |
| original_name | varchar(255) NOT NULL | |
| stored_path | varchar(500) NOT NULL | path internal, jangan expose langsung |
| mime_type | varchar(100) NOT NULL | whitelist: pdf/jpg/jpeg/png |
| size_bytes | integer NOT NULL | CHECK <= 5_000_000 (5MB) |
| uploaded_by | uuid NOT NULL | FK → users.id |
| created_at | timestamptz | |

### 3.4 leave_approvals (audit trail, append-only)

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| leave_request_id | uuid NOT NULL | FK → leave_requests.id ON DELETE CASCADE |
| actor_user_id | uuid NOT NULL | FK → users.id |
| actor_role | varchar(20) NOT NULL | snapshot role saat aksi |
| actor_position | varchar(50) NULL | snapshot position (CAMAT/...) |
| from_status | varchar(20) NOT NULL | |
| to_status | varchar(20) NOT NULL | |
| action | varchar(20) NOT NULL | `CREATE\|SUBMIT\|VERIFY\|REVISE\|PARAF\|APPROVE\|REJECT\|SIGN\|COMPLETE` |
| note | text NULL | wajib untuk REVISE/REJECT |
| created_at | timestamptz | |

Jangan UPDATE/DELETE baris ini dari API. Hanya INSERT.

### 3.5 attendances (presensi apel)

| kolom | tipe | constraint |
|---|---|---|
| id | uuid PK | |
| employee_id | uuid NOT NULL | FK → employees.id |
| date | date NOT NULL | tanggal apel (WITA) |
| check_in_at | timestamptz NULL | null untuk IZIN/SAKIT/ALPA |
| check_out_at | timestamptz NULL | presensi pulang |
| status | varchar(20) NOT NULL | `HADIR\|TERLAMBAT\|IZIN\|SAKIT\|ALPA` |
| method | varchar(20) NOT NULL | `SELF\|MANUAL` |
| note | text NULL | |
| recorded_by | uuid NOT NULL | FK → users.id |
| created_at / updated_at | timestamptz | |

UNIQUE `(employee_id, date)`. Aturan jam (WITA, berlaku semua status kepegawaian):
masuk ≤ `APEL_DEADLINE_TIME` (default 08:00) → HADIR, lewat → TERLAMBAT;
pulang minimal `CHECKOUT_TIME_WEEKDAY` (default 16:00), Jumat `CHECKOUT_TIME_FRIDAY` (default 16:30) — pulang lebih awal tetap tercatat + flag `early`.

**`warning_letters`**: id, letter_number UNIQUE (`TEGURAN-2026-0001`), employee_id FK, week_start/week_end (Senin–Jumat), absence_count, content (dummy), created_by FK. UNIQUE `(employee_id, week_start)`.
Pegawai bermasalah: ≥5 hari kerja dalam sepekan tanpa HADIR/TERLAMBAT (IZIN/SAKIT resmi tidak dihitung absen).

### 3.6 Surat masuk & disposisi

**`incoming_letters`**: id, agenda_number UNIQUE (`AGENDA-2026-0001`, generate backend), letter_number (nomor dari pengirim), sender, subject, summary (ringkasan isi), letter_date, received_date, resolution_date (tanggal penyelesaian, diisi saat complete), priority (`BIASA|SEGERA|SANGAT_SEGERA`), secrecy (`SR|R|B`), addressed_to (instansi yang ditujukan), pic (penanggung jawab), remarks (ket), classification_id FK opsional, status (`RECEIVED|DISPOSED|COMPLETED|ARCHIVED`), completed_at/completion_note, archived_at, created_by FK.

**`letter_dispositions`**: id, letter_id FK CASCADE, from_user_id FK, to_user_id FK, target_code/target_name (1 dari 9 tujuan tetap: SEKCAM, KASI_PEM, KASI_TRANTIB, KASI_PMK, KASI_EKBANG, KASI_BERSIH, KASUBAG_UMUM, KASUBAG_RENKEU, BENDAHARA), instruction, deadline (date, opsional), status (`PENDING|DONE`), response_note, responded_at. Rantai disposisi sekaligus audit trail. Setiap disposisi baru membuat baris `notifications` untuk penerima.

**`letter_documents`**: mirip leave_documents (max 10MB, pdf/jpg/png), FK ke letter CASCADE.

**`archive_classifications`**: code UNIQUE (Permendagri 83/2022, mis. `000.5.3.1`), name, is_active. Dasar penomoran surat keluar.

**`outgoing_letters`**: id, letter_number UNIQUE (format SE: `klasifikasi / seq / KT / romawi / tahun`), sequence_number + year (UNIQUE gabungan; nomor tidak dipakai ulang), classification_id FK, subject, recipient, letter_date (tanggal surat, boleh < tanggal catat), priority, secrecy, signer_name, status (`RESERVED|ISSUED|CANCELLED`), reservation_reason, cancel_reason, reserved_by/at, issued_at, cancelled_at, created_by (created_at = tanggal pencatatan).

**`outgoing_documents`**, **`numbering_sequences`** (year → last_number), **`expedition_receipts`** (reg_number UNIQUE, letter_id FK, receipt_date, receiver_name, signature_name/paraf, note), **`notifications`** (user_id FK, type, title, body, reference, is_read).

Alur: `RECEIVED → DISPOSED → COMPLETED → ARCHIVED`. Disposisi boleh berantai (Camat→Sekcam→staf). `complete` mensyaratkan ≥1 disposisi dan semuanya DONE. Visibilitas: SUPER_ADMIN/VERIFIER semua; lainnya hanya surat yang melibatkan dirinya (pencatat/pemberi/penerima).

### 3.7 KGB (mirip pola cuti)

**`kgb_requests`**: id, request_number UNIQUE (`KGB-2026-0001`), employee_id FK, old_rank, new_rank, old_salary INT (rupiah), new_salary INT (wajib > old_salary), effective_date (TMT), note, status (`DRAFT|SUBMITTED|REVISION|VERIFIED|PARAF|APPROVED|COMPLETED|REJECTED`), submitted_at, current_holder_role, rejection_reason, revision_note, created_by FK.

**`kgb_documents`**: doc_type (`SK_TERAKHIR|SKP|KP4|LAINNYA`), dst. mirip leave_documents (5MB).

**`kgb_approvals`**: audit trail append-only seperti leave_approvals.

Alur: `DRAFT → SUBMITTED → VERIFIED → PARAF → APPROVED → COMPLETED` (+REVISION/REJECTED). Tanpa tahap SIGNED — selesai langsung setelah approve.

## 4. Workflow & State Machine

```text
DRAFT → SUBMITTED → VERIFIED → PARAF → APPROVED → SIGNED → COMPLETED
           ↓           ↓                          ↓
        REJECTED    REVISION → (kembali SUBMITTED)  REJECTED
```

| dari → ke | endpoint | permission wajib | role tipikal |
|---|---|---|---|
| DRAFT → SUBMITTED | POST /leave-requests/:id/submit | leave.submit | EMPLOYEE (pemilik) |
| SUBMITTED → VERIFIED | POST .../verify | leave.verify | VERIFIER |
| SUBMITTED → REVISION | POST .../revise | leave.verify | VERIFIER |
| SUBMITTED → REJECTED | POST .../reject | leave.reject | VERIFIER/LEADER |
| REVISION → SUBMITTED | POST .../submit | leave.submit | EMPLOYEE (pemilik) |
| VERIFIED → PARAF | POST .../paraf | leave.paraf | LEADER (Sekcam) |
| VERIFIED → REJECTED | POST .../reject | leave.reject | LEADER |
| PARAF → APPROVED | POST .../approve | leave.approve | LEADER (Camat) |
| PARAF → REJECTED | POST .../reject | leave.reject | LEADER |
| APPROVED → SIGNED | POST .../sign | leave.sign | LEADER (Camat) |
| SIGNED → COMPLETED | auto/sistem | — | sistem (atau Camat sign langsung complete v1) |

Aturan backend (wajib dicek tiap aksi, jangan percaya frontend):

1. User aktif + token valid.
2. Punya permission (setelah GRANT/DENY).
3. Status saat ini = yang diharapkan (optimistic: tolak jika status berubah).
4. Ownership: EMPLOYEE hanya `own` (employee_id miliknya); VERIFIER/LEADER boleh lintas employee dalam org-nya (v1: semua, filter belakangan).
5. `note` wajib jika REVISE/REJECT.
6. Setiap transisi sukses → INSERT leave_approvals + UPDATE leave_requests.status.

## 5. DDL Siap Pakai (ringkas)

Lihat `backend/db/schema.sql` untuk SQL lengkap. Intinya: `pgcrypto` untuk UUID, semua FK bernama, CHECK status via `CHECK (status IN (...))` agar tanpa extension enum.

## 6. Seed Minimal untuk Login & Demo Cuti

```text
roles: 4 baris
permissions: ±15 baris di atas
role_permissions: mapping tabel §2.4
organizational_units: KEC-TAMALATE
employees+users:
  superadmin / Admin123!      → SUPER_ADMIN
  verifier1  / Verifier123!   → VERIFIER
  sekcam1    / Sekcam123!      → LEADER + position SEKCAM + GRANT paraf
  camat1     / Camat123!       → LEADER + position CAMAT + GRANT approve,sign
  pegawai1   / Pegawai123!     → EMPLOYEE
leave_types: TAHUNAN, SAKIT, MELAHIRKAN, ALASAN_PENTING
```

Kredensial di atas hanya untuk dev, wajib diganti via env saat staging.
