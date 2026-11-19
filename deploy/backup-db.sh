#!/usr/bin/env bash
# Backup database SIMPEG ke S3 SEBELUM migrasi.
#
#   sudo /opt/simpeg/backup-db.sh
#
# Alur:
#   1. baca DIRECT_URL/S3_BUCKET/ECR_REGISTRY dari /opt/simpeg/.env
#   2. ambil CA RDS dari image backend TAG berjalan (tanpa unduh internet)
#   3. pg_dump -Fc lewat container postgres:17-alpine, SSL verify-full
#      (tanpa fallback diam-diam ke sslmode=require)
#   4. hitung SHA-256, unggah ke s3://<bucket>/_backup/db/<UTC>.dump
#      (+ sidecar .dump.sha256), lalu verifikasi HEAD (ukuran sama)
#
# Gagal pada langkah mana pun = exit tidak nol. deploy.sh membatalkan deploy
# bila skrip ini gagal (stack lama tetap berjalan).
#
# Tidak pernah mencetak connection string atau isi database.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
REGION="${AWS_REGION:-ap-southeast-2}"
PG_IMAGE="postgres:17-alpine"
BACKUP_PREFIX="_backup/db"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="$STAMP.dump"
export DUMP_NAME

if [ "$(id -u)" -ne 0 ]; then
  echo "backup-db: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "backup-db: $APP_DIR/.env belum ada; jalankan fetch-env.sh dulu." >&2
  exit 1
fi

cd "$APP_DIR"

read_env() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

DIRECT_URL="$(read_env DIRECT_URL)"
S3_BUCKET="${S3_BUCKET:-$(read_env S3_BUCKET)}"
ECR_REGISTRY="${ECR_REGISTRY:-$(read_env ECR_REGISTRY)}"
TAG="${TAG:-$(cat "$APP_DIR/CURRENT_TAG" 2>/dev/null || true)}"
export ECR_REGISTRY TAG

if [ -z "$DIRECT_URL" ]; then
  echo "backup-db: DIRECT_URL kosong di .env." >&2
  exit 1
fi
if [ -z "$S3_BUCKET" ]; then
  echo "backup-db: S3_BUCKET kosong di .env/SSM." >&2
  exit 1
fi
if [ -z "$ECR_REGISTRY" ] || [ -z "$TAG" ]; then
  echo "backup-db: ECR_REGISTRY/TAG kosong; jalankan deploy.sh dulu." >&2
  exit 1
fi

# SSL dikontrol PGSSLMODE + PGSSLROOTCERT. Parameter query (mis. sslmode=require
# dari Terraform) dibuang agar tidak menimpa verify-full.
TARGET_URL="${DIRECT_URL%%\?*}"
export TARGET_URL

umask 077
WORK_DIR="$(mktemp -d "$APP_DIR/.backup.XXXXXX")"
CA_FILE="$WORK_DIR/rds-ca.pem"
DUMP="$WORK_DIR/$DUMP_NAME"
SHA_FILE="$DUMP.sha256"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# ---------- CA RDS dari image backend (tanpa unduh internet) ----------
BACKEND_IMAGE="$ECR_REGISTRY/simpeg-backend:$TAG"
if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
  echo "backup-db: image backend $TAG belum ada di server; jalankan deploy.sh (pull) dulu." >&2
  exit 1
fi

docker run --rm --entrypoint cat "$BACKEND_IMAGE" /certs/rds-global-bundle.pem >"$CA_FILE"
if [ ! -s "$CA_FILE" ] || [ "$(wc -c <"$CA_FILE")" -lt 50000 ]; then
  echo "backup-db: CA bundle RDS tidak valid dari image $BACKEND_IMAGE." >&2
  exit 1
fi
chmod 600 "$CA_FILE"

# ---------- pg_dump (URL hanya lewat env container, tidak di argv host) ----------
echo "backup-db: pg_dump -Fc (SSL verify-full) -> $DUMP_NAME"
docker run --rm \
  -e TARGET_URL \
  -e DUMP_NAME \
  -e PGSSLMODE=verify-full \
  -e PGSSLROOTCERT=/backup/rds-ca.pem \
  -v "$WORK_DIR:/backup" \
  --entrypoint sh "$PG_IMAGE" \
  -c 'pg_dump --format=custom --no-owner --no-privileges --file "/backup/$DUMP_NAME" --dbname "$TARGET_URL"'

if [ ! -s "$DUMP" ]; then
  echo "backup-db: dump kosong/tidak terbentuk: $DUMP_NAME" >&2
  exit 1
fi

# Pastikan arsip custom valid sebelum diunggah.
docker run --rm -e DUMP_NAME -v "$WORK_DIR:/backup:ro" --entrypoint sh "$PG_IMAGE" \
  -c 'pg_restore --list "/backup/$DUMP_NAME" >/dev/null 2>&1' ||
  {
    echo "backup-db: arsip dump tidak valid (pg_restore --list gagal)." >&2
    exit 1
  }

# ---------- SHA-256 + unggah ----------
LOCAL_SIZE="$(wc -c <"$DUMP" | tr -d '[:space:]')"
HASH="$(sha256sum "$DUMP" | awk '{print $1}')"
printf '%s  %s\n' "$HASH" "$DUMP_NAME" >"$SHA_FILE"

DUMP_URI="s3://$S3_BUCKET/$BACKUP_PREFIX/$DUMP_NAME"
SHA_URI="$DUMP_URI.sha256"

echo "backup-db: unggah $DUMP_URI ($LOCAL_SIZE byte, sha256 $HASH)"
aws s3 cp "$DUMP" "$DUMP_URI" \
  --region "$REGION" --only-show-errors \
  --metadata "sha256=$HASH"
aws s3 cp "$SHA_FILE" "$SHA_URI" --region "$REGION" --only-show-errors

REMOTE_SIZE="$(aws s3api head-object \
  --bucket "$S3_BUCKET" \
  --key "$BACKUP_PREFIX/$DUMP_NAME" \
  --region "$REGION" \
  --query 'ContentLength' --output text)"

if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "backup-db: verifikasi HEAD gagal (remote $REMOTE_SIZE != lokal $LOCAL_SIZE)." >&2
  exit 1
fi

echo "backup-db: selesai $DUMP_URI"
