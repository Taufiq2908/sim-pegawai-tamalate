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
  ↓ Kembali: catat pengiriman (REGISTERED) → catat surat jawaban (B1) → hasil diterima +
    diserahkan ke pegawai (COMPLETED) → arsip eksplisit (ARCHIVED)
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
  Rantai DRAFT→SUBMITTED→REVIEWED(atasan)→VERIFIED(Kasubag)→PARAF→APPROVED→
  REGISTERED→SUBMITTED_BKPSDMD→COMPLETED→ARCHIVED (+REVISION/REJECTED/POSTPONED/FORWARDED).
  revise≈PERUBAHAN, reject≈TIDAK DISETUJUI, postpone≈DITANGGUHKAN.
- Role SUPERVISOR (atasan langsung, `leave.review`) + Kasubag = SUPERVISOR + GRANT
  verify; akun `kasi1` (atasan murni) dan `kasubag1` (pemeriksa).
- Upload jawaban BKPSDM (`answer-letter`) saat APPROVED/REGISTERED/SUBMITTED_BKPSDMD;
  `receiveresult` mensyaratkannya (SIGNED dihapus dari rantai).
- Resolver atasan (`GET /employees/:id/supervisor` + field `supervisor` di detail cuti).
- Riwayat + saldo cuti tahunan; notifikasi tiap transisi cuti (tipe `LEAVE`);
  snapshot persetujuan digital (nama+NIP+jabatan+waktu) di timeline.
- `availableActions` per status+permission (frontend render tombol dari sini).
- Submit wajib ≥2 dokumen termasuk SK_TERAKHIR (+SURAT_DOKTER untuk SAKIT);
  tidak boleh memproses pengajuan sendiri; passwordHash sudah dihapus dari response.
- Upload 5MB pdf/jpg/png; timeline audit; PATCH milik sendiri saat
  DRAFT/REVISION; DELETE draft milik sendiri; filter jenis/unit/periode + cari NIP/nomor.
- List: filter `status` + cari `q` (nama/NIP/nomor) + pagination.
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
- `/cuti`: tabel + filter status/jenis/tanggal + cari nama/NIP/nomor + kolom unit + pagination.
- `/cuti/baru`: section bergaris + auto-fill + masa kerja + saldo tahunan +
  syarat surat dokter dinamis + 2 dokumen wajib + sticky bar [Simpan draft] [Ajukan cuti].
- `/cuti/[id]`: kartu atasan langsung (direct+rantai+note) + panel Keputusan
  (semua aksi baru + catatan wajib) + hapus draft + upload jawaban BKPSDM
  (APPROVED/REGISTERED/SUBMITTED_BKPSDMD, non-pemohon) + timeline nama+NIP + tombol Ubah + surat pengantar.
- `/cuti/[id]/edit`: form PATCH milik sendiri.
- `/cuti/[id]/surat`: riwayat dari endpoint resmi + nama/NIP penandatangan dari
  snapshot + masa kerja + logo bila ada.
- Dashboard: cabang SUPERVISOR; notifikasi cuti deep-link ke detail.
