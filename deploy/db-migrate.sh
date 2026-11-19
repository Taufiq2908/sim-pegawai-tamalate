#!/usr/bin/env bash
# Migrasi data Supabase (PostgreSQL) -> RDS SIMPEG.
#
#   sudo /opt/simpeg/db-migrate.sh [--reset-target] [--keep-dump]
#
# PENTING: Supabase HANYA DIBACA. Skrip ini hanya menjalankan SELECT (hitung
# baris) dan pg_dump terhadap Supabase; tidak ada INSERT/UPDATE/DELETE/DDL ke
# Supabase, tidak menghapus objek Storage, dan tidak mengubah data sumber.
# Semua penulisan hanya ke RDS target.
#
# RDS memakai SSL verify-full dengan CA yang diekstrak dari image backend
# (tanpa fallback diam-diam ke sslmode=require). Bila verify-full gagal,
# skrip berhenti dan menampilkan pesan galat apa adanya.
#
# Alur: guard schema kosong -> pg_dump -Fc (schema public) -> periksa TOC ->
# pg_restore (tanpa --clean) -> bandingkan jumlah baris tiap tabel -> cek
# trigger riwayat_paraf -> prisma migrate status harus "up to date".
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
MIGRATE_DIR="$APP_DIR/migrate"
PG_IMAGE="postgres:17-alpine"
DUMP="$MIGRATE_DIR/simpeg.dump"
TOC="$MIGRATE_DIR/toc.lst"
TOC_FILTERED="$MIGRATE_DIR/toc.filtered"
CA_FILE="$MIGRATE_DIR/rds-ca.pem"

RESET=false
KEEP_DUMP=false

usage() {
  echo "Pemakaian: $0 [--reset-target] [--keep-dump]" >&2
  echo "  --reset-target  DROP SCHEMA public CASCADE di RDS lalu buat ulang (konfirmasi HAPUS)" >&2
  echo "  --keep-dump     simpan dump di $DUMP setelah selesai" >&2
}

for arg in "$@"; do
  case "$arg" in
    --reset-target) RESET=true ;;
    --keep-dump) KEEP_DUMP=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "db-migrate: argumen tidak dikenal: $arg" >&2
      usage
      exit 2
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "db-migrate: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "db-migrate: $APP_DIR/.env belum ada; jalankan fetch-env.sh dulu." >&2
  exit 1
fi

cd "$APP_DIR"

read_env() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

DIRECT_URL="$(read_env DIRECT_URL)"
if [ -z "$DIRECT_URL" ]; then
  echo "db-migrate: DIRECT_URL kosong di .env." >&2
  exit 1
fi

# SSL dikontrol PGSSLMODE + PGSSLROOTCERT. Parameter query (mis. sslmode=require
# dari Terraform) dibuang agar tidak menimpa verify-full.
TARGET_URL="${DIRECT_URL%%\?*}"
export TARGET_URL

ECR_REGISTRY="$(read_env ECR_REGISTRY)"
APP_DOMAIN="$(read_env APP_DOMAIN)"
TAG="${TAG:-$(cat "$APP_DIR/CURRENT_TAG" 2>/dev/null || true)}"
export ECR_REGISTRY APP_DOMAIN TAG

if [ -z "$ECR_REGISTRY" ] || [ -z "$TAG" ]; then
  echo "db-migrate: ECR_REGISTRY/TAG kosong; jalankan deploy.sh dulu." >&2
  exit 1
fi

umask 077
mkdir -p "$MIGRATE_DIR"
chmod 700 "$MIGRATE_DIR"

cleanup() {
  if [ "$KEEP_DUMP" = true ]; then
    echo "db-migrate: dump dipertahankan: $DUMP"
  else
    rm -f "$DUMP" "$TOC" "$TOC_FILTERED"
  fi
}
trap cleanup EXIT

# ---------- CA RDS dari image backend (tanpa unduh internet) ----------
BACKEND_IMAGE="$ECR_REGISTRY/simpeg-backend:$TAG"
if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
  echo "db-migrate: image backend $TAG belum ada di server; jalankan deploy.sh dulu." >&2
  exit 1
fi

docker run --rm --entrypoint cat "$BACKEND_IMAGE" /certs/rds-global-bundle.pem >"$CA_FILE"
if [ ! -s "$CA_FILE" ] || [ "$(wc -c <"$CA_FILE")" -lt 50000 ]; then
  echo "db-migrate: CA bundle RDS tidak valid dari image $BACKEND_IMAGE." >&2
  exit 1
fi
chmod 600 "$CA_FILE"

# ---------- Helper psql: URL hanya lewat env, tidak pernah argv ----------
psql_target() {
  docker run --rm -i \
    -e TARGET_URL \
    -e PGSSLMODE=verify-full \
    -e PGSSLROOTCERT=/migrate/rds-ca.pem \
    -v "$MIGRATE_DIR:/migrate:ro" \
    --entrypoint sh "$PG_IMAGE" \
    -c 'psql "$TARGET_URL" -v ON_ERROR_STOP=1 -tA -f -'
}

psql_source() {
  docker run --rm -i \
    -e SOURCE_URL \
    -e PGSSLMODE=require \
    --entrypoint sh "$PG_IMAGE" \
    -c 'psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -tA -f -'
}

# ---------- 1. Guard: schema public RDS harus kosong ----------
echo "db-migrate: memeriksa schema public RDS (SSL verify-full) ..."
if ! TABLE_COUNT="$(
  printf '%s\n' "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';" |
    psql_target | tr -d '[:space:]'
)"; then
  echo "db-migrate: koneksi RDS dengan verify-full gagal (lihat pesan di atas)." >&2
  echo "db-migrate: tidak turun ke sslmode=require; perbaiki CA/koneksi lalu ulangi." >&2
  exit 1
fi

case "$TABLE_COUNT" in
  '' | *[!0-9]*)
    echo "db-migrate: jumlah tabel RDS tidak terbaca: '${TABLE_COUNT}'." >&2
    exit 1
    ;;
esac

if [ "$TABLE_COUNT" -gt 0 ]; then
  if [ "$RESET" != true ]; then
    echo "db-migrate: schema public RDS sudah berisi $TABLE_COUNT tabel." >&2
    echo "db-migrate: hentikan. Pakai --reset-target bila memang ingin restore ulang penuh." >&2
    exit 1
  fi

  echo "PERINGATAN: --reset-target akan DROP SCHEMA public CASCADE di RDS target."
  printf 'Ketik HAPUS untuk melanjutkan: '
  read -r answer
  if [ "$answer" != "HAPUS" ]; then
    echo "db-migrate: dibatalkan." >&2
    exit 1
  fi

  if ! printf '%s\n' 'DROP SCHEMA public CASCADE;' 'CREATE SCHEMA public;' | psql_target; then
    echo "db-migrate: DROP/CREATE SCHEMA public gagal (lihat pesan di atas). Tidak ada jalan lain yang dicoba." >&2
    exit 1
  fi
  echo "db-migrate: schema public target dibuat ulang."
else
  echo "db-migrate: schema public target kosong."
fi

# ---------- 2. URL Supabase (tidak ditampilkan) ----------
printf 'URL Supabase session pooler port 5432 (tidak ditampilkan): ' >&2
read -rs SOURCE_URL
printf '\n' >&2
if [ -z "$SOURCE_URL" ]; then
  echo "db-migrate: URL Supabase kosong." >&2
  exit 1
fi
export SOURCE_URL

# ---------- 3. pg_dump (schema public) ----------
PG_DUMP_VERSION="$(docker run --rm --entrypoint pg_dump "$PG_IMAGE" --version)"
echo "db-migrate: $PG_DUMP_VERSION"
case "$PG_DUMP_VERSION" in
  *"(PostgreSQL) 17."*) ;;
  *)
    echo "db-migrate: pg_dump harus versi 17 (didapat: $PG_DUMP_VERSION)." >&2
    exit 1
    ;;
esac

echo "db-migrate: pg_dump schema public dari Supabase (baca saja) ..."
if ! docker run --rm \
  -e SOURCE_URL \
  -e PGSSLMODE=require \
  --entrypoint sh "$PG_IMAGE" \
  -c 'pg_dump "$SOURCE_URL" --format=custom --schema=public --no-owner --no-privileges' \
  >"$DUMP"; then
  echo "db-migrate: pg_dump gagal (lihat pesan di atas)." >&2
  exit 1
fi

if [ ! -s "$DUMP" ]; then
  echo "db-migrate: dump kosong." >&2
  exit 1
fi
chmod 600 "$DUMP"
echo "db-migrate: dump $(wc -c <"$DUMP") byte."

# ---------- 4. Periksa TOC ----------
docker run --rm \
  -v "$MIGRATE_DIR:/migrate:ro" \
  --entrypoint pg_restore "$PG_IMAGE" \
  --list /migrate/simpeg.dump >"$TOC"

POLICY_COUNT="$(grep -cE '^[0-9]+; [0-9]+ [0-9]+ POLICY ' "$TOC" || true)"
EXTENSION_COUNT="$(grep -cE '^[0-9]+; [0-9]+ [0-9]+ EXTENSION ' "$TOC" || true)"
FOREIGN_SCHEMA="$(
  grep -E '^[0-9]+; [0-9]+ [0-9]+ (SCHEMA - (auth|extensions|storage)( |$)|(TABLE|FUNCTION|TYPE|SEQUENCE|VIEW) (auth|extensions|storage) )' "$TOC" |
    head -n 20 || true
)"

echo "db-migrate: objek khas Supabase di dump:"
echo "  POLICY    : $POLICY_COUNT"
echo "  EXTENSION : $EXTENSION_COUNT"
if [ -n "$FOREIGN_SCHEMA" ]; then
  echo "  objek schema auth/extensions/storage:"
  printf '%s\n' "$FOREIGN_SCHEMA" | sed 's/^/    /'
else
  echo "  objek schema auth/extensions/storage: tidak ada"
fi

# SCHEMA public sudah ada di RDS; komentari baris pembuatannya (dan komentarnya)
# agar restore tidak bentrok.
awk '
  /(^| )SCHEMA - public( |$)/ { print "; " $0; next }
  /(^| )COMMENT - SCHEMA public( |$)/ { print "; " $0; next }
  { print }
' "$TOC" >"$TOC_FILTERED"

# ---------- 5. pg_restore ke RDS ----------
echo "db-migrate: pg_restore ke RDS (SSL verify-full) ..."
if ! docker run --rm \
  -e TARGET_URL \
  -e PGSSLMODE=verify-full \
  -e PGSSLROOTCERT=/migrate/rds-ca.pem \
  -v "$MIGRATE_DIR:/migrate:ro" \
  --entrypoint sh "$PG_IMAGE" \
  -c 'pg_restore --no-owner --no-privileges --exit-on-error --use-list /migrate/toc.filtered --dbname "$TARGET_URL" /migrate/simpeg.dump'; then
  echo "db-migrate: pg_restore gagal (lihat pesan di atas)." >&2
  echo "db-migrate: perbaiki penyebabnya lalu ulangi dengan --reset-target (restore ulang penuh)." >&2
  exit 1
fi

# ---------- 6. Verifikasi ----------
gagal=0

echo "db-migrate: membandingkan jumlah baris setiap tabel (sumber vs target) ..."
TABLES="$(
  printf '%s\n' "select tablename from pg_catalog.pg_tables where schemaname='public' order by 1;" | psql_source
)"
TARGET_TABLES="$(
  printf '%s\n' "select tablename from pg_catalog.pg_tables where schemaname='public' order by 1;" | psql_target
)"

printf '%-44s %10s %10s %s\n' "tabel" "sumber" "target" "hasil"
while IFS= read -r table; do
  [ -n "$table" ] || continue
  source_count="$(printf 'select count(*) from public."%s";\n' "$table" | psql_source | tr -d '[:space:]')"
  if target_count="$(printf 'select count(*) from public."%s";\n' "$table" | psql_target | tr -d '[:space:]')"; then
    :
  else
    target_count="TIDAK-ADA"
  fi

  if [ "$source_count" = "$target_count" ]; then
    hasil="SAMA"
  else
    hasil="BEDA"
    gagal=$((gagal + 1))
  fi
  printf '%-44s %10s %10s %s\n' "$table" "$source_count" "$target_count" "$hasil"
done <<<"$TABLES"

EXTRA_TABLES="$(
  comm -13 <(printf '%s\n' "$TABLES" | sort) <(printf '%s\n' "$TARGET_TABLES" | sort) || true
)"
if [ -n "$EXTRA_TABLES" ]; then
  echo "db-migrate: tabel hanya ada di target:"
  printf '%s\n' "$EXTRA_TABLES" | sed 's/^/  - /'
  gagal=$((gagal + 1))
fi

TRIGGERS="$(
  printf '%s\n' "select tgname from pg_trigger where not tgisinternal and tgname in ('riwayat_paraf_append_only','riwayat_paraf_no_truncate') order by 1;" |
    psql_target
)"
if printf '%s\n' "$TRIGGERS" | grep -qx 'riwayat_paraf_append_only' &&
  printf '%s\n' "$TRIGGERS" | grep -qx 'riwayat_paraf_no_truncate'; then
  echo "LULUS  trigger riwayat_paraf_append_only + riwayat_paraf_no_truncate ada"
else
  echo "GAGAL  trigger riwayat_paraf tidak lengkap: ${TRIGGERS:-tidak ada}"
  gagal=$((gagal + 1))
fi

MIGRATE_OUT="$(docker compose run --rm --no-deps backend npx prisma migrate status 2>&1 || true)"
MIGRATE_SAFE="$(printf '%s\n' "$MIGRATE_OUT" | sed -E 's|postgres(ql)?://[^ ]*|postgresql://[REDACTED]|g')"
if printf '%s' "$MIGRATE_OUT" | grep -q 'Database schema is up to date'; then
  echo "LULUS  prisma migrate status: up to date"
else
  echo "GAGAL  prisma migrate status: bukan 'up to date'"
  printf '%s\n' "$MIGRATE_SAFE" | tail -n 8
  gagal=$((gagal + 1))
fi

if [ "$gagal" -gt 0 ]; then
  echo "db-migrate: $gagal butir BEDA/GAGAL." >&2
  exit 1
fi

echo "db-migrate: semua tabel SAMA dan semua pemeriksaan LULUS."
