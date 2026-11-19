#!/usr/bin/env bash
# Dipanggil unit simpeg.service saat boot: pakai image TAG terakhir.
# Environment diambil ulang dari SSM oleh ExecStartPre=fetch-env.sh.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
cd "$APP_DIR"

if [ ! -f "$APP_DIR/CURRENT_TAG" ]; then
  echo "boot: CURRENT_TAG belum ada; jalankan deploy.sh dulu." >&2
  exit 1
fi

TAG="$(cat "$APP_DIR/CURRENT_TAG")"
export TAG

exec docker compose up -d
