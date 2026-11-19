# CI/CD — deploy otomatis SIMPEG ke AWS

Pipeline ada di `.github/workflows/deploy.yml`. Repo bersifat **publik**, jadi
semua action pihak ketiga dipin ke commit SHA penuh dan workflow **tidak**
memakai trigger `pull_request`.

## Alur singkat

```text
push ke main (atau workflow_dispatch)
        │
        ▼
job test  : npm ci + typecheck + build + smoke (backend, frontend)
        │
        ▼
job deploy: build image arm64 -> push ECR -> unggah bundle ke S3
            -> SSM Run Command di EC2:
                 install.sh -> deploy.sh <tag> (backup DB + migrate) -> check.sh
            -> polling hasil sampai Success/Failed (maks 15 menit)
```

Bila job **test** gagal, deploy tidak dijalankan. Bila `deploy.sh`/`check.sh`
gagal di server, job deploy gagal dan log stdout/stderr SSM ditampilkan.

## Trigger

| Trigger | Keterangan |
|---|---|
| `push` ke `main` | Deploy otomatis. Perubahan yang hanya menyentuh `docs/**` atau `*.md` diabaikan. |
| `workflow_dispatch` | Manual. Input `ref` opsional: SHA 7–40 hex untuk deploy ulang/rollback. Kosong = commit yang dipilih saat dispatch. |

`ref` dari input **tidak pernah** masuk ke `run:` secara langsung: nilainya
diteruskan lewat `env: INPUT_REF`, divalidasi regex `^[0-9a-f]{7,40}$`, baru
dipakai sebagai `git rev-parse`/`git checkout`. Nilai dari event (`github.sha`)
juga lewat `env`.

## GitHub Environment `production` (wajib dibuat Bos)

Job deploy memakai `environment: production`. Di GitHub:

1. **Settings → Environments → New environment** → nama `production`.
2. **Deployment branches**: pilih **Selected branches** → tambahkan `main`
   saja. Dengan begitu deploy tidak bisa dipicu dari branch lain (termasuk
   `workflow_dispatch` yang dijalankan dari branch non-main).
3. Simpan **AWS_ACCESS_KEY_ID** dan **AWS_SECRET_ACCESS_KEY** sebagai
   **Environment secrets** di environment `production` — bukan repository
   secrets. Job test tidak perlu akses AWS sama sekali.

### Secrets dan variables

| Nama | Jenis | Nilai |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Environment secret (`production`) | access key IAM user `simpeg-ci-deployer` (dibuat manual) |
| `AWS_SECRET_ACCESS_KEY` | Environment secret (`production`) | secret access key pasangannya |
| `AWS_REGION` | Repository variable | `ap-southeast-2` |
| `ECR_REGISTRY` | Repository variable | `<account_id>.dkr.ecr.ap-southeast-2.amazonaws.com` |
| `S3_BUCKET` | Repository variable | `simpeg-tamalate-c1e892` |
| `INSTANCE_ID` | Repository variable | `i-0d278e1a3cd30beea` |

Secret tidak pernah dicetak: action kredensial hanya menerimanya lewat
`with:`, dan log tidak memuat nilai key.

## Alur kerja tim

1. Buat **branch fitur baru dari `main` terbaru**.
2. Kerjakan perubahan, jalankan uji lokal (lihat `deploy/README.md` dan
   `AGENTS.md`).
3. Buka **Pull Request** ke `main`. Pipeline tidak berjalan untuk PR
   (repo publik, tidak ada `pull_request`), jadi uji lokal tetap wajib.
4. Setelah PR di-merge, pipeline deploy berjalan otomatis.
5. Setelah merge, **Bos dan rekan** menyegarkan salinan lokal:

   ```bash
   git switch main && git pull
   ```

6. Pekerjaan berikutnya selalu dimulai dari **branch fitur baru dari `main`**,
   bukan menumpuk di branch lama.
7. `AGENTS.md` tetap **lokal dan untracked** (masuk `.git/info/exclude`) dan
   tetap dibaca OpenCode di branch mana pun; jangan di-commit.

## Apa yang dilakukan pipeline di server

1. Unduh bundle (`_deploy/<tag>/`) ke `/opt/simpeg/release/<tag>/`, pasang
   skrip + compose + Caddyfile + unit systemd ke `/opt/simpeg`.
2. `install.sh` — idempoten. Bila isi `simpeg.service` **tidak berubah** dan
   unit sudah `active`, skrip **tidak** me-restart (kontainer yang sedang jalan
   tidak diganggu). Restart hanya terjadi saat unit pertama kali dipasang atau
   berkas unit berubah.
3. `deploy.sh <tag>` — tanpa `--skip-migrate`, sehingga:
   - **`backup-db.sh`** dijalankan lebih dulu (pg_dump `-Fc`, SSL
     `verify-full`) dan diunggah ke `s3://<bucket>/_backup/db/<UTC>.dump`
     (+ `.sha256`, metadata `sha256`), lalu diverifikasi dengan HEAD;
   - bila backup gagal, deploy **dibatalkan** dan stack lama tetap berjalan;
   - setelah backup sukses baru `prisma migrate deploy`, `compose up -d`, dan
     tunggu `/health/ready` (rollback otomatis ke `PREVIOUS_TAG` bila gagal).
4. `check.sh` — verifikasi akhir (health, DB, S3, storage runtime, migrasi,
   trigger, dsb). Kegagalan di sini membuat job GitHub merah.

## Retensi S3 (lifecycle)

| Prefix | Isi | Retensi |
|---|---|---|
| `_backup/` | dump DB sebelum migrasi | 14 hari (noncurrent 1 hari) |
| `_migrate/` | objek sementara migrasi T5 | 1 hari (+ hapus delete marker, noncurrent 1 hari) |
| `_healthcheck/` | objek uji `check.sh` | 1 hari (+ hapus delete marker, noncurrent 1 hari) |
| `_deploy/` | bundle deploy | mengikuti rule lama (noncurrent 30 hari) |

## Rollback

Migrasi database bersifat **maju** (tidak otomatis turun). Pilihan rollback:

1. **Lewat Actions (disarankan)** — `Run workflow` pada branch `main`, isi
   `ref` dengan SHA commit lama (7–40 hex). Pipeline membangun ulang image
   commit itu, push dengan tag SHA-nya, lalu deploy. `deploy.sh` tetap
   menjalankan backup + `prisma migrate deploy` (migrasi yang sudah diterapkan
   tidak dibatalkan).
2. **Di server** — `sudo /opt/simpeg/deploy.sh <PREVIOUS_TAG>` atau
   `sudo /opt/simpeg/deploy.sh <tag-lama>`. Semua tag yang pernah dibangun
   pipeline ada di ECR.
3. **Restore database** — bila rollback kode tidak cukup, unduh dump dari
   `s3://<bucket>/_backup/db/`, verifikasi `.sha256`, lalu restore ke RDS
   dengan `pg_restore` (prosedur di `deploy/README.md`). Ini langkah darurat,
   bukan rollback otomatis.

## Jalur manual (cadangan)

`deploy/release.ps1` tetap tersedia untuk build/push/unggah bundle manual
(memakai profil admin `simpeg-tf`), lalu di server:

```bash
sudo aws s3 cp --recursive "s3://<bucket>/_deploy/<TAG>/" /opt/simpeg/
sudo chmod +x /opt/simpeg/*.sh
sudo /opt/simpeg/install.sh
sudo /opt/simpeg/deploy.sh <TAG>
sudo /opt/simpeg/check.sh
```

## Keamanan dan tradeoff access key

- OIDC tidak mungkin di akun free plan ini (kebijakan menolak `iam:*Provider*`),
  sehingga dipakai IAM user dengan **access key jangka panjang**.
- Izin user dibatasi: login ECR, push ke dua repository kita, `PutObject` pada
  `_deploy/*`, `SendCommand` ke instance ini (dokumen `AWS-RunShellScript`),
  serta baca hasil perintah SSM. Tidak ada izin RDS/IAM/EC2/S3 lain.
- **Rotasi**: buat access key baru di konsol → perbarui environment secrets →
  uji satu deploy → hapus access key lama. Lakukan berkala atau bila key
  dicurigai bocor.
- Environment `production` + aturan deployment branch `main` membatasi siapa
  dan dari branch mana deploy bisa berjalan.
- Saat teardown: hapus access key, lalu hapus user (atau set
  `enable_ci_user = false` dan `terraform apply`). Jangan biarkan key aktif
  tanpa pipeline.

## Development lokal tidak berubah

Aturan ketat (JWT wajib, CORS allowlist, SSL DB, dll.) hanya berlaku saat
`NODE_ENV=production`. `npm run dev` dan uji lokal tetap memakai `.env` lokal
seperti sebelumnya; pipeline hanya menambah jalur deploy, bukan mengubah cara
menjalankan aplikasi di laptop.

## Troubleshooting

| Gejala | Periksa |
|---|---|
| Job deploy ditolak sebelum jalan | Environment `production` belum ada / `main` tidak ada di Deployment branches |
| `AccessDenied` saat unggah bundle | Policy CI `s3:PutObject` pada `<bucket>/_deploy/*`; laporkan aksi yang ditolak, jangan perluas sendiri |
| SSM `InvalidInstanceId` | `INSTANCE_ID` di variables, status SSM agent di EC2 |
| Deploy gagal di `backup-db.sh` | Log SSM; koneksi RDS `verify-full` gagal = berhenti (tidak fallback ke `require`) |
| `check.sh` merah | Jalankan `sudo /opt/simpeg/check.sh` lewat SSM Session Manager dan baca butir GAGAL |
