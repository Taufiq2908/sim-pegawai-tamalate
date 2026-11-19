# Deploy SIMPEG (Docker)

Komposisi produksi: **caddy → frontend → backend** dalam satu jaringan Compose.
Hanya `caddy` yang membuka port 80/443; backend & frontend tidak dipublikasikan.

| Berkas | Untuk |
|---|---|
| `docker-compose.yml` | Produksi di EC2 (image dari ECR, env dari `/opt/simpeg/.env`) |
| `Caddyfile` | Reverse proxy + HTTPS otomatis + header keamanan |
| `docker-compose.local.yml` | Uji lokal lengkap (Postgres 17 + build dari source) |
| `env.production.example` | Daftar variabel `/opt/simpeg/.env` (tanpa nilai asli) |

## Build image ARM64 (untuk EC2 t4g)

Dijalankan dari **root repo**:

```powershell
docker buildx build --platform linux/arm64 --load -t simpeg-backend:dev backend
docker buildx build --platform linux/arm64 --load -t simpeg-frontend:dev frontend
```

`NEXT_PUBLIC_API_URL` di frontend di-inline saat build. Untuk Compose gunakan
default (`http://backend:3000/api/v1`) atau beri `--build-arg`:

```powershell
docker buildx build --platform linux/arm64 --load `
  --build-arg NEXT_PUBLIC_API_URL=http://backend:3000/api/v1 `
  -t simpeg-frontend:dev frontend
```

Pipeline sebenarnya (T7) membangun image dengan tag = commit SHA lalu push ke
ECR. Build ARM64 lewat QEMU di laptop membutuhkan waktu lebih lama (≈10 menit per
image pada mesin uji).

## Uji lokal menyeluruh

Prasyarat: Docker Desktop (Compose v2), port 80 bebas.

```powershell
# 1. Build + jalankan Postgres, backend, frontend, caddy
docker compose -f deploy/docker-compose.local.yml up -d --build

# 2. Migrasi skema
docker compose -f deploy/docker-compose.local.yml run --rm backend npx prisma migrate deploy

# 3. Seed data uji DARI HOST (DB sementara di 127.0.0.1:55432)
Push-Location backend
$env:DATABASE_URL = 'postgresql://simpeg:simpeg_local_test@127.0.0.1:55432/simpeg'
$env:DIRECT_URL   = $env:DATABASE_URL
npm run prisma:seed
Pop-Location

# 4. Cek lewat Caddy (HTTP lokal)
#    login, cookie, health, log, dan uji upload dilakukan manual/otomatis.
Invoke-WebRequest http://localhost/login -UseBasicParsing

# 5. Log backend (JSON + request-id)
docker compose -f deploy/docker-compose.local.yml logs backend --tail 20

# 6. Uji graceful shutdown (harus exit 0, < 20 detik)
docker compose -f deploy/docker-compose.local.yml stop backend

# 7. Bersihkan (termasuk volume DB sementara)
docker compose -f deploy/docker-compose.local.yml down -v
```

### Catatan

- **Jangan menjalankan `docker compose config` di server.** Perintah itu mencetak
  hasil interpolasi (termasuk nilai secret dari `/opt/simpeg/.env`). Untuk
  memeriksa stack, pakai `docker compose ps`, `docker compose logs`, atau
  `check.sh`.
- `Caddyfile` dipakai bersama produksi dan lokal. Di lokal `APP_DOMAIN=http://localhost`
  sehingga hanya HTTP (port 80) yang aktif dan tidak ada permintaan sertifikat.
- `Caddyfile` **menimpa** `X-Forwarded-For` dengan `{remote_host}`. Jangan diganti
  menjadi `{header.X-Forwarded-For}`: backend memakai `trust proxy = 1`.
- Batas body di Caddy 12 MB; `MAX_FILE_BYTES` produksi 10 MB (default kode 5 MB,
  dan batas unggah surat/outgoing di kode juga 10 MB; frontend tidak memvalidasi
  ukuran).
- Upload disimpan ke `UPLOAD_DIR=/tmp/simpeg-uploads` di dalam container ketika
  `STORAGE_DRIVER=local`. Data itu hilang saat container dibuat ulang — di produksi
  gunakan `STORAGE_DRIVER=s3`.
- Compose lokal memakai `postgres:17-alpine`, sama dengan versi RDS. PostgreSQL 17
  **tidak bisa** membuka data directory yang dibuat PostgreSQL 16. Bila volume
  `simpeg-local_pgdata` masih dari versi lama, container menolak start. Volume itu
  hanya berisi data uji, jadi hapus dengan
  `docker compose -f deploy/docker-compose.local.yml down -v`, lalu jalankan
  `up -d` lagi.
- Compose produksi mewajibkan `APP_DOMAIN`, `ECR_REGISTRY`, dan `TAG` di environment
  shell (tanpa default `latest`):
  ```bash
  APP_DOMAIN=simpeg.example.duckdns.org \
  ECR_REGISTRY=123456789012.dkr.ecr.ap-southeast-2.amazonaws.com \
  TAG=$(git rev-parse --short HEAD) \
  docker compose -f deploy/docker-compose.yml up -d
  ```
- Variabel aplikasi (DB, JWT, storage) **tidak** ada di file compose; semuanya dari
  `/opt/simpeg/.env` (dibuat `deploy/fetch-env.sh`, chmod 600).

## Deploy ke EC2 (produksi, ringkas)

TAG selalu = short SHA commit yang juga menjadi isi bundle (image dan skrip harus
dari commit yang sama). Alur: build lokal → push + unggah bundle (Bos) → bootstrap
server → `deploy.sh` → `check.sh`.

### 1. Build image (lokal, OpenCode)

```powershell
$TAG = git rev-parse --short HEAD
docker buildx build --platform linux/arm64 --load -t "$ECR/simpeg-backend:$TAG" backend
docker buildx build --platform linux/arm64 --load `
  --build-arg NEXT_PUBLIC_API_URL=http://backend:3000/api/v1 `
  -t "$ECR/simpeg-frontend:$TAG" frontend
```

### 2. Push + unggah bundle (Bos, `AWS_PROFILE=simpeg-tf`)

```powershell
deploy/release.ps1 -Tag <TAG> -AwsProfile simpeg-tf
```

Skrip memeriksa `sts get-caller-identity` (harus `user/terraform-deployer`),
login ECR, push dua image, lalu mengunggah `docker-compose.yml`, `Caddyfile`,
`fetch-env.sh`, `deploy.sh`, `boot.sh`, `check.sh`, `install.sh`,
`backup-db.sh`, `db-migrate.sh`, `migrate-files.sh`, dan `simpeg.service` ke
`s3://<bucket>/_deploy/<TAG>/`. Kredensial docker selalu di-logout lagi (blok
`finally`).

Jalur otomatis (GitHub Actions) memakai bundle yang sama; lihat
`docs/ci-cd.md`.

### 3. Bootstrap server (SSM Session Manager)

```bash
TAG=<TAG>; BUCKET=simpeg-tamalate-c1e892; REGION=ap-southeast-2
sudo mkdir -p /opt/simpeg
sudo aws s3 cp --recursive --region $REGION "s3://$BUCKET/_deploy/$TAG/" /opt/simpeg/
sudo chmod +x /opt/simpeg/*.sh
sudo /opt/simpeg/install.sh
sudo /opt/simpeg/deploy.sh $TAG --skip-migrate   # pertama: RDS harus tetap kosong
sudo /opt/simpeg/check.sh
```

`--skip-migrate` wajib pada deploy pertama karena restore T5 akan memakai dump
lengkap. `/health/ready` tetap 200 karena hanya `SELECT 1`.

### 4. Deploy berikutnya, boot, rollback

- Deploy baru: `sudo /opt/simpeg/deploy.sh <TAG>` (tanpa `--skip-migrate`).
  Urutannya: `backup-db.sh` (pg_dump `-Fc`, SSL `verify-full`, unggah ke
  `s3://<bucket>/_backup/db/<UTC>.dump` + `.sha256`, verifikasi HEAD) →
  `prisma migrate deploy` → `compose up -d`. Backup gagal = deploy dibatalkan;
  stack lama tetap berjalan.
- `install.sh` idempoten: bila isi `simpeg.service` tidak berubah dan unit sudah
  aktif, skrip **tidak** me-restart kontainer.
- Rollback lewat Actions: `workflow_dispatch` dengan input `ref` = SHA lama
  (lihat `docs/ci-cd.md`).
- Selesai sukses, `CURRENT_TAG` diperbarui dan `PREVIOUS_TAG` menyimpan tag lama.
- Gagal `/health/ready` dalam 90 detik: otomatis kembali ke `PREVIOUS_TAG` lalu
  keluar non-zero. Migrasi DB **tidak** dibatalkan.
- Saat boot, `simpeg.service` menjalankan `fetch-env.sh` lalu `boot.sh`
  (`compose up -d` dengan `CURRENT_TAG`).

### 5. Uji S3 dan versioning

`check.sh` menulis objek uji di prefix `_healthcheck/` (jalur SDK langsung dan
jalur runtime `storage.ts` di `_healthcheck/runtime/`). Karena bucket memakai
versioning, delete hanya membuat delete marker dan versi lama tetap ada.

Hal yang sama berlaku untuk `_deploy/` (bundle) dan `_migrate/uploads/` (berkas
lokal yang diunggah Bos untuk T5).

Saat teardown, kosongkan **semua versi dan delete marker**, bukan hanya objek
aktif — termasuk prefix `_deploy/`, `_healthcheck/`, dan `_migrate/`. Contoh
(Bos, kredensial admin):

```bash
aws s3api list-object-versions --bucket "$BUCKET" \
  --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json > versions.json
aws s3api delete-objects --bucket "$BUCKET" --delete file://versions.json
# ulangi untuk DeleteMarkers
```

Untuk hanya membersihkan `_migrate/` setelah migrasi berkas selesai, awali
perintah dengan `--prefix _migrate/`; tetap hapus versi **dan** delete marker.

### 6. Migrasi data Supabase -> RDS dan berkas -> S3 (T5)

Prasyarat: T6 sudah LULUS di server (`check.sh` semua LULUS), RDS masih kosong
(deploy pertama memakai `--skip-migrate`), dan Bos memegang URL Supabase
Session pooler (port 5432) serta `SUPABASE_SERVICE_ROLE_KEY`.

Urutan:

```powershell
# 1. Rilis TAG baru (image + bundle, termasuk db-migrate.sh & migrate-files.sh)
deploy/release.ps1 -Tag <TAG> -AwsProfile simpeg-tf

# 2. Unggah salinan berkas lokal (8 file) ke prefix sementara
aws s3 cp backend/uploads "s3://simpeg-tamalate-c1e892/_migrate/uploads/" `
  --recursive --profile simpeg-tf --region ap-southeast-2
```

```bash
# 3. Bootstrap ulang dengan TAG baru; RDS tetap kosong
TAG=<TAG>; BUCKET=simpeg-tamalate-c1e892; REGION=ap-southeast-2
sudo aws s3 cp --recursive --region $REGION "s3://$BUCKET/_deploy/$TAG/" /opt/simpeg/
sudo chmod +x /opt/simpeg/*.sh
sudo /opt/simpeg/deploy.sh $TAG --skip-migrate

# 4. Restore data (prompt URL Supabase; tidak ditampilkan)
sudo /opt/simpeg/db-migrate.sh
#    -> berhenti bila schema public RDS sudah berisi tabel.
#    -> SSL RDS verify-full; bila gagal, berhenti (tidak turun ke require).
#    -> membandingkan jumlah baris SETIAP tabel, cek 2 trigger riwayat_paraf,
#       dan prisma migrate status harus "up to date".

# 5. Berkas: periksa dulu, lalu pindahkan
sudo /opt/simpeg/migrate-files.sh            # default --dry-run
sudo /opt/simpeg/migrate-files.sh --apply

# 6. Verifikasi akhir
sudo /opt/simpeg/check.sh
```

`check.sh` menguji dua jalur S3: `s3-healthcheck` (SDK langsung) dan
`storage-runtime-check` (fungsi `storage.ts` yang dipakai aplikasi:
`storeUploadedFile` → `storedFileExists` → `sendStoredFile` → `deleteStoredFile`)
pada prefix `_healthcheck/runtime/`.

Catatan T5:

- `db-migrate.sh` hanya **membaca** Supabase (SELECT + `pg_dump`) dan hanya
  menulis ke RDS. `--keep-dump` menyimpan `migrate/simpeg.dump` (chmod 600);
  tanpa flag itu dump dihapus di akhir.
- `migrate-files.sh` juga hanya **membaca** Supabase Storage; penulisan hanya ke
  S3 dan kolom `jalur_simpan` di RDS. Tanpa argumen = `--dry-run`.
- Baris lokal yang filenya tidak ada di `_migrate/uploads/` dilaporkan HILANG
  dan `storedPath`-nya **tidak** diubah; proses tetap selesai (exit 0).
- Bila data Supabase berubah sebelum go-live final, ulangi dari awal:
  `sudo /opt/simpeg/db-migrate.sh --reset-target` (ketik `HAPUS`) lalu
  `migrate-files.sh --apply` lagi. Baris yang sudah `s3://` dilewati (idempoten).
- Setelah migrasi berkas selesai dan `check.sh` LULUS, bersihkan prefix
  `_migrate/` (semua versi + delete marker) seperti pada bagian 5.

