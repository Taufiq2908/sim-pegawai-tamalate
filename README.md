# SIMPEG-TAMALATE

Sistem Informasi Manajemen Kepegawaian & Layanan Administrasi Terintegrasi — Kecamatan Tamalate.

Monorepo: `backend/` (Express + Prisma + Supabase) dan `frontend/` (Next.js, wilayah Taufiqurrahman).
Kontrak integrasi: `docs/02-api-contract.md`. Desain database: `docs/01-database-design.md`.

## Struktur

```text
sim-pegawai-tamalate/
├── backend/        # API (Express), Prisma schema/migrasi, upload
│   ├── prisma/     # schema.prisma, seed.ts, migrations/
│   ├── prisma.config.ts  # datasource via DIRECT_URL (port 5432)
│   ├── src/        # routes, middleware, services
│   ├── db/         # schema.sql, migration.sql, seed.sql (cadangan SQL Editor)
│   ├── scripts/    # e2e-cuti.ps1
│   └── .env        # DATABASE_URL (pooler 6543) + DIRECT_URL (tidak di-commit)
├── frontend/       # Next.js (NEXT_PUBLIC_API_URL → backend)
├── docs/           # database design + API contract (dibaca kedua tim)
└── README.md
```

## Backend — quickstart

```powershell
cd backend
npm install
npx prisma migrate dev   # butuh akses port 5432 ke Supabase
npm run prisma:seed
npm run dev              # :3000
powershell -ExecutionPolicy Bypass -File scripts/e2e-cuti.ps1
```

Catatan jaringan: bila port 5432/6543 diblokir (WiFi kantor), gunakan tethering,
atau apply `backend/db/migration.sql` + `backend/db/seed.sql` via Supabase SQL Editor.

Akun demo: `superadmin/Admin123!`, `verifier1/Verifier123!` (Staf Kepegawaian/operator),
`kasubag1/Kasubag123!` (Kasubag/pemeriksa), `sekcam1/Sekcam123!`,
`camat1/Camat123!`, `pegawai1/Pegawai123!` (kecamatan), `pegawai2/Pegawai123!` (kelurahan).

## Frontend — quickstart

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

## Alur kerja tim

Backend↔frontend bertemu di `docs/02-api-contract.md`. Frontend render tombol dari
`availableActions`, backend tetap memvalidasi permission + status + ownership.
