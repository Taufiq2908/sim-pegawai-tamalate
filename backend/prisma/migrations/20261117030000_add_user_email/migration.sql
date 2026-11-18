-- Email kontak per akun. Nullable karena akun lama belum memiliki email.
-- Nomor telepon tetap memakai kolom "telepon" pada tabel "pegawai".
ALTER TABLE "pengguna" ADD COLUMN "email" VARCHAR(150);

CREATE INDEX "pengguna_email_idx" ON "pengguna"("email");
