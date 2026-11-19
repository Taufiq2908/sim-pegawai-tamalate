# Backend SIMPEG — image produksi (ARM64 & AMD64).
# Satu image dipakai runtime dan CLI migrasi (`prisma migrate deploy`).

# ---------- stage build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma mendeteksi versi OpenSSL lewat binary `openssl`; tanpa itu ia memilih
# engine openssl-1.1.x yang tidak bisa jalan di Debian 12 (libssl3).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Placeholder non-rahasia. prisma.config.ts memanggil env("DIRECT_URL") saat
# dimuat, termasuk oleh postinstall `prisma generate`. Tidak dipakai runtime.
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build" \
    DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Manifest + berkas Prisma disalin lebih dulu agar postinstall `prisma generate`
# berjalan saat `npm ci` (butuh schema + config).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# JANGAN pakai npm ci --omit=dev: postinstall @prisma/engines yang mengunduh
# binary schema-engine akan dilewati sehingga `prisma migrate deploy` gagal.
# prune mempertahankan hasil postinstall dan hanya membuang devDependencies.
RUN npm prune --omit=dev --no-audit --no-fund

# CA bundle RDS diunduh saat build; runtime tidak butuh akses internet.
RUN node -e "const fs=require('fs');fetch('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(t=>{if(t.length<50000)throw new Error('CA bundle terlalu kecil: '+t.length);fs.writeFileSync('/tmp/rds-global-bundle.pem',t)}).catch(e=>{console.error(e);process.exit(1)})"

# ---------- stage runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# openssl dibutuhkan Prisma untuk memilih schema-engine yang benar saat
# `prisma migrate deploy`; ca-certificates untuk TLS keluar.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Makassar \
    UPLOAD_DIR=/tmp/simpeg-uploads \
    DATABASE_SSL_CA_FILE=/certs/rds-global-bundle.pem

COPY --from=build /tmp/rds-global-bundle.pem /certs/rds-global-bundle.pem
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

# User non-root; direktori upload temporer harus bisa ditulis (multer).
RUN mkdir -p /tmp/simpeg-uploads && chown -R node:node /app /tmp/simpeg-uploads

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node sebagai PID 1; zombie reaping ditangani `init: true` di Compose.
CMD ["node", "dist/server.js"]
