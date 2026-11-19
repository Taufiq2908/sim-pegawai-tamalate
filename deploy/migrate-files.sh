#!/usr/bin/env bash
# Migrasi berkas SIMPEG -> S3 di server.
#
#   sudo /opt/simpeg/migrate-files.sh [--dry-run|--apply]
#
# PENTING: Supabase HANYA DIBACA. Skrip ini (dan tool Node yang dijalankannya)
# tidak pernah menghapus, mengubah, atau meng-upsert objek Storage maupun data
# di database Supabase. Semua penulisan hanya ke S3 dan kolom `jalur_simpan`
# di RDS.
#
# Kredensial Supabase diminta interaktif, diekspor sebagai environment, dan
# diteruskan ke container dengan `-e NAMA` (tanpa nilai di argv), sehingga
# tidak pernah muncul di daftar proses, log, atau riwayat shell.
#
# Default tanpa argumen = --dry-run (memeriksa sumber, tidak menulis apa pun).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"

if [ "$(id -u)" -ne 0 ]; then
  echo "migrate-files: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "migrate-files: $APP_DIR/.env belum ada; jalankan fetch-env.sh dulu." >&2
  exit 1
fi

cd "$APP_DIR"

read_env() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

ECR_REGISTRY="$(read_env ECR_REGISTRY)"
APP_DOMAIN="$(read_env APP_DOMAIN)"
TAG="${TAG:-$(cat "$APP_DIR/CURRENT_TAG" 2>/dev/null || true)}"

if [ -z "$ECR_REGISTRY" ] || [ -z "$TAG" ]; then
  echo "migrate-files: ECR_REGISTRY/TAG kosong; jalankan deploy.sh dulu." >&2
  exit 1
fi

export ECR_REGISTRY APP_DOMAIN TAG

printf 'SUPABASE_URL (https://<project-ref>.supabase.co): ' >&2
read -r SUPABASE_URL
if [ -z "$SUPABASE_URL" ]; then
  echo "migrate-files: SUPABASE_URL kosong." >&2
  exit 1
fi

printf 'SUPABASE_SERVICE_ROLE_KEY (tidak ditampilkan): ' >&2
read -rs SUPABASE_SERVICE_ROLE_KEY
printf '\n' >&2
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "migrate-files: SUPABASE_SERVICE_ROLE_KEY kosong." >&2
  exit 1
fi

export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

echo "migrate-files: menjalankan tool di container backend (TAG $TAG) ..."
docker compose run --rm --no-deps \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  backend node dist/tools/migrate-files-to-s3.js "$@"
