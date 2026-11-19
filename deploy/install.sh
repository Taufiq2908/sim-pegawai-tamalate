#!/usr/bin/env bash
# Pasang unit systemd simpeg.service (idempoten). Jalankan sebagai root:
#
#   sudo /opt/simpeg/install.sh
#
# Unit di-enable saat boot. Bila CURRENT_TAG sudah ada, unit langsung
# dijalankan; bila belum, jalankan deploy.sh dulu.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpeg}"
UNIT_NAME="simpeg.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "install: harus dijalankan sebagai root (sudo)." >&2
  exit 1
fi

for file in fetch-env.sh boot.sh deploy.sh check.sh docker-compose.yml Caddyfile simpeg.service; do
  if [ ! -f "$APP_DIR/$file" ]; then
    echo "install: berkas wajib tidak ada: $APP_DIR/$file" >&2
    exit 1
  fi
done

chmod 755 "$APP_DIR/fetch-env.sh" "$APP_DIR/boot.sh" "$APP_DIR/deploy.sh" "$APP_DIR/check.sh"
if [ -f "$APP_DIR/backup-db.sh" ]; then
  chmod 755 "$APP_DIR/backup-db.sh"
fi
chmod 644 "$APP_DIR/docker-compose.yml" "$APP_DIR/Caddyfile" "$APP_DIR/simpeg.service"

UNIT_PATH="/etc/systemd/system/$UNIT_NAME"
unit_changed=true
if [ -f "$UNIT_PATH" ] && cmp -s "$APP_DIR/$UNIT_NAME" "$UNIT_PATH"; then
  unit_changed=false
fi

install -m 644 "$APP_DIR/$UNIT_NAME" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$UNIT_NAME" >/dev/null

if [ -f "$APP_DIR/CURRENT_TAG" ]; then
  # Unit oneshot + RemainAfterExit: "restart" menjalankan ulang boot.sh
  # (docker compose up -d). Bila berkas unit tidak berubah dan unit sudah
  # active, JANGAN restart agar kontainer yang sedang jalan tidak diganggu.
  if [ "$unit_changed" = false ] && systemctl is-active --quiet "$UNIT_NAME"; then
    echo "install: unit tidak berubah dan sudah aktif; tanpa restart (TAG $(cat "$APP_DIR/CURRENT_TAG"))."
  else
    systemctl restart "$UNIT_NAME"
    echo "install: unit dipasang/diubah, di-enable, dan dijalankan (TAG $(cat "$APP_DIR/CURRENT_TAG"))."
  fi
else
  echo "install: unit dipasang dan di-enable; CURRENT_TAG belum ada, jalankan deploy.sh."
fi
