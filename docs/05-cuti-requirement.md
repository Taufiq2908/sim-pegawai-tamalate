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

## 3. Yang SUDAH didukung backend (terverifikasi di kode, pasca-v2)
- 4 jenis cuti. Rantai DRAFT→SUBMITTED→VERIFIED→PARAF→APPROVED→SIGNED→
  COMPLETED (+REVISION/REJECTED/FORWARDED). revise≈PERUBAHAN,
  reject≈TIDAK DISETUJUI. **Tahap atasan (REVIEWED) dan DITANGGUHKAN belum ada.**
- `availableActions` per status+permission (frontend render tombol dari sini).
- Submit wajib ≥2 dokumen termasuk SK_TERAKHIR; tidak boleh memproses
  pengajuan sendiri; passwordHash sudah dihapus dari response.
- Upload 5MB pdf/jpg/png; timeline audit; PATCH milik sendiri saat
  DRAFT/REVISION. **Tidak ada DELETE, tidak ada notifikasi cuti.**
- List: filter `status` + cari `q` (**nama saja**) + pagination.
- `GET /employees` + `GET /users` tersedia (dropdown, bukan UUID mentah).

## 4. Yang masih butuh backend (detail: `06` B1–B11)
- B4: transisi + perm tahap atasan; B10: role SUPERVISOR + GRANT Kasubag + akun pejabat.
- B1: upload surat jawaban BKPSDM saat APPROVED/SIGNED (**penghambat alur**).
- B2: master pegawai (joinDate/masa kerja, rantai atasan, pejabat aktif) + sertakan di `/auth/me`.
- B3: API resolver atasan langsung. B6: riwayat + saldo cuti per pegawai.
- B7: seed BESAR + DILUAR_TANGGUNGAN. B8: notifikasi tiap transisi cuti.
- B5: DITANGGUHKAN (transisi `postpone`) bila 4 opsi wajib; alasan wajib tolak/ubah.
- Cari by NIP/nomor; filter jenis/unit/periode; DELETE draft; dokumen wajib per jenis.
- B11: snapshot signer per aksi + aset paraf/TTE + endpoint verifikasi QR (bila QR dipakai).

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
- Belum ada (menunggu backend): saldo cuti, tahap atasan/BKPSDM, postpone,
  hapus draft, notifikasi cuti, upload jawaban BKPSDM.
