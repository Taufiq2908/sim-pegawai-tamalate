#!/usr/bin/env bash
# Verifikasi pasca-deploy SIMPEG. Cetak LULUS/GAGAL per butir.
# Keluar non-zero bila ada GAGAL; satu kegagalan TIDAK menghentikan butir lain.
#
#   sudo /opt/simpeg/check.sh
#
# Tidak mencetak nilai rahasia (connection string disamarkan).
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"

cd "$APP_DIR" || {
  echo "check: direktori tidak ditemukan: $APP_DIR" >&2
  exit 1
}

if [ ! -f "$APP_DIR/.env" ]; then
  echo "check: $APP_DIR/.env belum ada; jalankan fetch-env.sh." >&2
  exit 1
fi

read_env() {
  grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

APP_DOMAIN="${APP_DOMAIN:-$(read_env APP_DOMAIN)}"
ECR_REGISTRY="${ECR_REGISTRY:-$(read_env ECR_REGISTRY)}"
TAG="${TAG:-$(cat "$APP_DIR/CURRENT_TAG" 2>/dev/null || true)}"
export APP_DOMAIN ECR_REGISTRY TAG

fail=0

lulus() {
  echo "LULUS  $*"
}

gagal() {
  echo "GAGAL  $*"
  fail=$((fail + 1))
}

# ---------- 1. Tiga kontainer berjalan ----------
check_service() {
  local svc="$1"
  local need_health="$2"
  local cid status health

  cid="$(docker compose ps -q "$svc" 2>/dev/null | head -n 1)"
  if [ -z "$cid" ]; then
    gagal "compose: service $svc tidak berjalan"
    return
  fi

  read -r status health < <(
    docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null ||
      echo "unknown unknown"
  )

  if [ "$status" != "running" ]; then
    gagal "compose: $svc status=$status"
    return
  fi

  if [ "$need_health" = "yes" ] && [ "$health" != "healthy" ]; then
    gagal "compose: $svc running tetapi health=$health"
    return
  fi

  if [ "$need_health" = "yes" ]; then
    lulus "compose: $svc running, healthy"
  else
    lulus "compose: $svc running"
  fi
}

check_service backend yes
check_service frontend yes
check_service caddy no

# ---------- 2. /health/ready (bukti koneksi RDS + CA) ----------
ready_code="$(
  docker compose exec -T backend node -e \
    "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>{process.stdout.write(String(r.status));process.exit(0)}).catch(()=>process.exit(1))" \
    2>/dev/null || true
)"
if [ "$ready_code" = "200" ]; then
  lulus "health/ready backend = 200"
else
  gagal "health/ready backend = ${ready_code:-tidak ada jawaban}"
fi

# ---------- 3. S3 lewat IAM Role (put/head/get/delete + SHA-256) ----------
if docker compose exec -T backend node dist/tools/s3-healthcheck.js; then
  lulus "S3 dari container backend (IAM Role)"
else
  gagal "S3 dari container backend (IAM Role)"
fi

# ---------- 3b. Jalur storage.ts runtime: upload -> exists -> unduh -> hapus ----------
# Berbeda dari s3-healthcheck (klien SDK langsung), ini menguji fungsi yang
# dipakai aplikasi: storeUploadedFile, storedFileExists, sendStoredFile,
# deleteStoredFile pada prefix _healthcheck/runtime.
if docker compose exec -T backend node dist/tools/storage-runtime-check.js; then
  lulus "storage.ts runtime S3 (store/exists/unduh/hapus)"
else
  gagal "storage.ts runtime S3 (store/exists/unduh/hapus)"
fi

# ---------- 4. prisma migrate status lewat DIRECT_URL ----------
# Di DB kosong, migrasi belum diterapkan itu wajar: yang dinilai adalah
# koneksi/SSL berhasil, bukan exit code prisma.
migrate_out="$(docker compose run --rm --no-deps backend npx prisma migrate status 2>&1 || true)"
migrate_safe="$(printf '%s\n' "$migrate_out" | sed -E 's|postgres(ql)?://[^ ]*|postgresql://[REDACTED]|g')"

if printf '%s' "$migrate_out" | grep -qE "Database schema is up to date|not yet been applied|No migration found|migrations have not yet been applied"; then
  lulus "prisma migrate status: koneksi DIRECT_URL/SSL berhasil"
elif printf '%s' "$migrate_out" | grep -qiE "P1000|P1001|P1017|can't reach database|authentication failed|password authentication|no pg_hba|does not exist"; then
  gagal "prisma migrate status: koneksi gagal"
  printf '%s\n' "$migrate_safe" | tail -n 6
else
  gagal "prisma migrate status: keluaran tidak dikenali"
  printf '%s\n' "$migrate_safe" | tail -n 6
fi

# ---------- 5. HTTPS + issuer ----------
https_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$APP_DOMAIN/" 2>/dev/null || true)"
if [ "$https_code" = "200" ] || [ "$https_code" = "301" ] || [ "$https_code" = "302" ] ||
  [ "$https_code" = "303" ] || [ "$https_code" = "307" ] || [ "$https_code" = "308" ]; then
  lulus "HTTPS / = $https_code"
else
  gagal "HTTPS / = ${https_code:-tidak ada jawaban}"
fi

issuer="$(
  echo | openssl s_client -servername "$APP_DOMAIN" -connect "$APP_DOMAIN:443" 2>/dev/null |
    openssl x509 -noout -issuer 2>/dev/null | head -n 1 || true
)"
case "$issuer" in
  *"Let's Encrypt"*) lulus "sertifikat diterbitkan Let's Encrypt" ;;
  "") gagal "issuer sertifikat tidak terbaca" ;;
  *)
    gagal "issuer sertifikat bukan Let's Encrypt"
    echo "       $issuer"
    ;;
esac

# ---------- 6. HTTP dialihkan ke HTTPS ----------
http_head="$(curl -sSI --max-time 20 "http://$APP_DOMAIN/" 2>/dev/null | tr -d '\r' || true)"
http_code="$(printf '%s\n' "$http_head" | head -n 1 | awk '{print $2}')"
http_loc="$(printf '%s\n' "$http_head" | grep -i '^location:' | head -n 1 | awk '{print $2}')"

if [ "$http_code" = "301" ] || [ "$http_code" = "308" ]; then
  case "$http_loc" in
    https://*) lulus "HTTP dialihkan ke HTTPS ($http_code)" ;;
    *) gagal "HTTP $http_code tetapi Location bukan https" ;;
  esac
else
  gagal "HTTP / = ${http_code:-tidak ada jawaban} (harus 301/308)"
fi

# Tanpa kredensial ECR tertinggal di server.
docker logout "$ECR_REGISTRY" >/dev/null 2>&1 || true

echo
if [ "$fail" -gt 0 ]; then
  echo "check: $fail butir GAGAL."
  exit 1
fi
echo "check: semua butir LULUS."
exit 0
