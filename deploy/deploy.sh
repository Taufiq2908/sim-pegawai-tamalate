#!/usr/bin/env bash
# Deploy satu TAG image SIMPEG di server.
#
#   sudo /opt/simpeg/deploy.sh <TAG> [--skip-migrate]
#
# Alur: fetch-env -> login ECR (IAM Role) -> pull -> (migrate) -> up -> tunggu
# /health/ready 90 detik. Bila gagal, kembali ke TAG lama (bila ada).
# Deploy pertama memakai --skip-migrate agar RDS tetap kosong untuk restore T5.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
REGION="${AWS_REGION:-ap-southeast-2}"
TAG="${1:-}"
MODE="${2:-}"

usage() {
  echo "Pemakaian: $0 <TAG> [--skip-migrate]" >&2
  exit 2
}

[ -n "$TAG" ] || usage
if ! printf '%s' "$TAG" | grep -qE '^[0-9a-f]{7,40}$'; then
  echo "deploy: TAG tidak valid (harus short/long SHA huruf kecil): $TAG" >&2
  exit 2
fi

SKIP_MIGRATE=false
if [ "$MODE" = "--skip-migrate" ]; then
  SKIP_MIGRATE=true
elif [ -n "$MODE" ]; then
  usage
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "deploy: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

cd "$APP_DIR"

for file in fetch-env.sh docker-compose.yml Caddyfile; do
  [ -f "$APP_DIR/$file" ] || {
    echo "deploy: berkas wajib tidak ada: $APP_DIR/$file" >&2
    exit 1
  }
done

read_env() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

# Nilai dibaca tanpa mencetaknya; shell menang atas .env saat interpolasi Compose.
"$APP_DIR/fetch-env.sh"
ECR_REGISTRY="${ECR_REGISTRY:-$(read_env ECR_REGISTRY)}"
APP_DOMAIN="${APP_DOMAIN:-$(read_env APP_DOMAIN)}"
export ECR_REGISTRY APP_DOMAIN TAG

[ -n "$ECR_REGISTRY" ] || {
  echo "deploy: ECR_REGISTRY kosong di .env/SSM." >&2
  exit 1
}

OLD_TAG="$(cat "$APP_DIR/CURRENT_TAG" 2>/dev/null || true)"

if [ "$SKIP_MIGRATE" = true ]; then
  echo "deploy: migrasi dilewati (--skip-migrate)."
fi

echo "deploy: login ECR $ECR_REGISTRY"
aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

echo "deploy: pull image $TAG"
docker compose pull backend frontend

if [ "$SKIP_MIGRATE" = false ]; then
  if [ ! -x "$APP_DIR/backup-db.sh" ]; then
    echo "deploy: $APP_DIR/backup-db.sh tidak ada/tidak executable; deploy dibatalkan." >&2
    exit 1
  fi
  echo "deploy: backup database sebelum migrasi"
  if ! "$APP_DIR/backup-db.sh"; then
    echo "deploy: backup database gagal; deploy dibatalkan (stack lama tetap berjalan)." >&2
    exit 1
  fi

  echo "deploy: prisma migrate deploy"
  docker compose run --rm --no-deps backend npx prisma migrate deploy
fi

echo "deploy: menjalankan stack $TAG"
docker compose up -d

ready=false
for _ in $(seq 1 30); do
  # Jangan biarkan set -e menghentikan loop saat container belum siap.
  if docker compose exec -T backend node -e \
    "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 3
done

write_atomic() {
  local value="$1"
  local target="$2"
  printf '%s\n' "$value" >"$target.tmp"
  mv -f "$target.tmp" "$target"
}

if [ "$ready" = true ]; then
  if [ -n "$OLD_TAG" ] && [ "$OLD_TAG" != "$TAG" ]; then
    write_atomic "$OLD_TAG" "$APP_DIR/PREVIOUS_TAG"
    echo "deploy: PREVIOUS_TAG=$OLD_TAG"
  fi
  write_atomic "$TAG" "$APP_DIR/CURRENT_TAG"
  echo "deploy: sukses, CURRENT_TAG=$TAG"
  exit 0
fi

echo "deploy: /health/ready tidak siap dalam 90 detik." >&2

if [ -n "$OLD_TAG" ] && [ "$OLD_TAG" != "$TAG" ]; then
  echo "deploy: rollback ke $OLD_TAG" >&2
  export TAG="$OLD_TAG"
  if docker compose up -d >/dev/null 2>&1; then
    for _ in $(seq 1 20); do
      if docker compose exec -T backend node -e \
        "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
        >/dev/null 2>&1; then
        echo "deploy: rollback siap pada $OLD_TAG." >&2
        break
      fi
      sleep 3
    done
  else
    echo "deploy: rollback gagal menjalankan compose." >&2
  fi
else
  echo "deploy: tidak ada TAG lama untuk rollback; stack dibiarkan apa adanya." >&2
fi

exit 1
