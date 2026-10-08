# Cuti — requirement (selaras alur yang disepakati)

> Sumber: SOP 8 langkah + formulir resmi + klarifikasi atasan/Kasubag.
> Prinsip: hanya yang didukung bahan = business rule; sisanya [BELUM DITENTUKAN].
> Frontend tidak meng-hardcode: hak/sisa cuti, hari kerja vs kalender, syarat per
> jenis, TTE sebagai kewajiban, SLA, overlap otomatis, nama jabatan dalam workflow.

## 1. Alur yang disepakati (SOP + lapisan atasan)

```text
Pegawai mengajukan (DRAFT → SUBMITTED)
  ↓ Atasan langsung — pertimbangan DISETUJUI/PERUBAHAN/DITANGGUHKAN/TIDAK (→REVIEWED*)
  ↓ Kasubag — verifikasi berkas + setuju + teruskan (→VERIFIED)
  ↓ Sekcam — paraf (→PARAF)
  ↓ Camat — keputusan (→APPROVED) / khusus cuti Camat: FORWARD ke Sekda
  ↓ Sistem generate surat pengantar (frontend, halaman cetak)
  ↓ Pelaksana unduh → teruskan ke BKPSDM di LUAR sistem
  ↓ Kembali: catat surat jawaban (B1) → SIGNED → serahkan ke pegawai → COMPLETED/arsip
```

(*) Tahap REVIEWED/perm `leave.review` belum ada di backend — lihat B4 di `06`.
Kasubag = SUPERVISOR + GRANT verify; atasan = SUPERVISOR murni;
operator = VERIFIER tanpa hak memutuskan; penentu = LEADER. (Detail: `06` B10.)

Khusus: Camat → Sekda (kecamatan hanya buatkan surat); Sekcam → Camat langsung;
Kelurahan: Staf → Kasi → Sekretaris Lurah → Lurah (mapping final per tahap
[BELUM DITENTUKAN] lengkap). UI tidak mengunci teks jabatan — tampilkan dari data.

## 2. Formulir resmi: 6 jenis + section A–I
Jenis: TAHUNAN, BESAR, SAKIT, MELAHIRKAN, ALASAN_PENTING, DILUAR_TANGGUNGAN
(2 terakhir belum di-seed backend). Section: A data pemohon auto-fill •
B jenis • C alasan bebas • D periode + estimasi durasi (angka resmi = backend,
hari kalender) • E riwayat (tampil dari sistem, bukan ketik; "sisa" butuh API
saldo) • F alamat+telepon • G pernyataan (fase 1: cetak + basah) •
H/I keputusan 4 opsi. TTE tersertifikasi BUKAN kewajiban fase 1; UI memakai
istilah "persetujuan digital" (nama+NIP+jabatan+waktu per aksi).

## 3. Yang SUDAH didukung backend (terverifikasi di kode, pasca-v2 + revisi 05/06)
- 6 jenis cuti (TAHUNAN, BESAR, SAKIT, MELAHIRKAN, ALASAN_PENTING, DILUAR_TANGGUNGAN).
  Rantai DRAFT→SUBMITTED→REVIEWED(atasan)→VERIFIED(Kasubag)→PARAF→APPROVED→SIGNED→
  REGISTERED→SUBMITTED_BKPSDMD→COMPLETED→ARCHIVED (+REVISION/REJECTED/POSTPONED/FORWARDED).
  revise≈PERUBAHAN, reject≈TIDAK DISETUJUI, postpone≈DITANGGUHKAN.
- Role SUPERVISOR (atasan langsung, `leave.review`) + Kasubag = SUPERVISOR + GRANT
  verify; akun `kasi1` (atasan murni) dan `kasubag1` (pemeriksa).
- Upload jawaban BKPSDM (`answer-letter`) saat APPROVED/SIGNED; `sign` mensyaratkannya.
- Resolver atasan (`GET /employees/:id/supervisor` + field `supervisor` di detail cuti).
- Riwayat + saldo cuti tahunan; notifikasi tiap transisi cuti (tipe `LEAVE`);
  snapshot persetujuan digital (nama+NIP+jabatan+waktu) di timeline.
- `availableActions` per status+permission (frontend render tombol dari sini).
- Submit wajib ≥2 dokumen termasuk SK_TERAKHIR (+SURAT_DOKTER untuk SAKIT);
  tidak boleh memproses pengajuan sendiri; passwordHash sudah dihapus dari response.
- Upload 5MB pdf/jpg/png; timeline audit; PATCH milik sendiri saat
  DRAFT/REVISION; DELETE draft milik sendiri; filter jenis/unit/periode + cari NIP/nomor.
- List: filter `status` + cari `q` (**nama saja**) + pagination.
- `GET /employees` + `GET /users` tersedia (dropdown, bukan UUID mentah).

## 4. Status backend per item `06` (per 2026-10-08, teruji e2e)

B1, B2 (joinDate di `/auth/me` + resolver atasan + data pejabat via resolver),
B3, B4 (dipilih opsi atasan-dulu), B5, B6, B7, B8, B10, B11 (snapshot signer;
aset paraf fisik + QR ditunda) = SUDAH diimplementasi. Sisa yang belum:
- Rantai kelurahan lengkap (mapping final + akun Kasi/Seklur/Lurah) — sementara
  Kasubag memverifikasi langsung (lihat B3).
- Aturan dokumen wajib per jenis selain SAKIT→SURAT_DOKTER.
- TTE tersertifikasi / integrasi BSrE (fase 1: cetak + basah).

## 5. Status implementasi frontend (terkunci)
- `/cuti`: tabel + filter status + cari nama + pagination.
- `/cuti/baru`: section bergaris + auto-fill pemohon + estimasi durasi +
  2 dokumen wajib + sticky bar [Simpan draft] [Ajukan cuti].
- `/cuti/[id]`: panel Keputusan (banner bila tahap milik user) + aksi dari
  `availableActions` (forward ke Sekda + catatan wajib) + dokumen + ProcessTrail
  + tombol Ubah (milik sendiri, DRAFT/REVISION) + kartu surat pengantar (APPROVED+).
- `/cuti/[id]/edit`: form PATCH milik sendiri.
- `/cuti/[id]/surat`: cetak surat pengantar sesuai formulir (kop + tabel I–VIII,
  centang otomatis, logo dari `/logo-tamalate.png` bila ada, lampiran riwayat
  sistem, nama Camat hardcode sementara dari formulir).
- Belum ada di frontend (backend-nya SUDAH siap, lihat kontrak `02` §3a):
  saldo cuti, tahap atasan/BKPSDM, postpone, hapus draft, notifikasi cuti,
  upload jawaban BKPSDM.
