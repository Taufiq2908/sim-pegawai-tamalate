#!/usr/bin/env bash
# Ambil seluruh parameter /simpeg/prod/* dari SSM Parameter Store dan tulis
# menjadi /opt/simpeg/.env (600, milik root). Nilai tidak pernah dicetak.
#
# Jalankan sebagai root:  sudo /opt/simpeg/fetch-env.sh
#
# AWS CLI v2 auto-paginasi untuk get-parameters-by-path, sehingga seluruh
# halaman terkumpul dalam satu keluaran JSON.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
REGION="${AWS_REGION:-ap-southeast-2}"
PARAM_PATH="${PARAM_PATH:-/simpeg/prod}"

if [ "$(id -u)" -ne 0 ]; then
  echo "fetch-env: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "fetch-env: AWS CLI tidak ditemukan di PATH." >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || {
  echo "fetch-env: python3 tidak ditemukan." >&2
  exit 1
}

mkdir -p "$APP_DIR"
umask 077

json="$(mktemp "$APP_DIR/.params.XXXXXX")"
tmp="$(mktemp "$APP_DIR/.env.XXXXXX")"
cleanup() {
  rm -f "$json" "$tmp"
}
trap cleanup EXIT

# --with-decryption: SecureString ikut terambil. Keluaran hanya ke berkas.
aws ssm get-parameters-by-path \
  --path "$PARAM_PATH" \
  --recursive \
  --with-decryption \
  --region "$REGION" \
  --output json >"$json"

python3 - "$json" "$tmp" <<'PY'
import json
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as fh:
    data = json.load(fh)

params = data.get("Parameters") or []
lines = []
seen = set()
bad_names = []
bad_values = []

for param in params:
    name = param.get("Name", "")
    key = name.rsplit("/", 1)[-1]
    value = param.get("Value") or ""

    if not re.fullmatch(r"[A-Z0-9_]+", key):
        bad_names.append(key or "<kosong>")
        continue
    if key in seen:
        raise SystemExit(f"fetch-env: parameter duplikat: {key}")
    seen.add(key)

    # Compose melakukan interpolasi pada .env, dan shell memakai kutip/newline:
    # nilai seperti itu ditolak agar tidak berubah makna saat dibaca.
    if any(ch in value for ch in ("\n", "\r", "$", '"', "'")):
        bad_values.append(key)
        continue

    lines.append(f"{key}={value}")

if bad_names:
    raise SystemExit("fetch-env: nama parameter tidak valid: " + ", ".join(sorted(bad_names)))
if bad_values:
    raise SystemExit(
        "fetch-env: nilai memuat newline/$/tanda kutip pada: " + ", ".join(sorted(bad_values))
    )
if not lines:
    raise SystemExit("fetch-env: tidak ada parameter yang ditemukan.")

with open(dst, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(sorted(lines)) + "\n")

print(f"fetch-env: {len(lines)} parameter ditulis.")
PY

required=(
  DATABASE_URL
  DIRECT_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  S3_BUCKET
  AWS_REGION
  APP_DOMAIN
  ECR_REGISTRY
)

missing=()
for key in "${required[@]}"; do
  if ! grep -qE "^${key}=.+" "$tmp"; then
    missing+=("$key")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "fetch-env: parameter wajib kosong/tidak ada: ${missing[*]}" >&2
  exit 1
fi

# Atomik: ganti seluruh berkas dalam satu rename, tetap 600 milik root.
chown root:root "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$APP_DIR/.env"
echo "fetch-env: $APP_DIR/.env diperbarui (600 root)."
