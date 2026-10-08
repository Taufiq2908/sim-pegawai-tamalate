# Cuti — requirement terverifikasi (digest)

> Sumber lengkap: dokumen "DOKUMENTASI LENGKAP FITUR CUTI" (60 bagian, chat).
> Prinsip: hanya yang didukung bahan = business rule; sisanya [BELUM DITENTUKAN].
> Frontend tidak meng-hardcode: hak/sisa cuti, hari kerja vs kalender, syarat per jenis,
> e-signature wajib, SLA, overlap otomatis.

## 1. Struktur organisasi ganda (requirement terpenting)
- Kecamatan: Pelaksana → Kasubag Umum & Kepegawaian → Sekcam (paraf) → Camat → BKPSDM.
- Kelurahan: Staf → Kasi → Sekretaris Lurah → Lurah (mapping final per tahap belum lengkap).
- Khusus: Camat → Sekda (kecamatan hanya buatkan surat); Sekcam → Camat langsung.
- Konsekuensi frontend: jangan hardcode nama jabatan; tampilkan dari data (siap saat org API ada).

## 2. Formulir resmi: 6 jenis + section A–I
Jenis: TAHUNAN, BESAR, SAKIT, MELAHIRKAN, ALASAN_PENTING, DILUAR_TANGGUNGAN.
Section: A data pemohon (auto-fill) • B jenis • C alasan bebas • D periode + durasi
• E riwayat (tampil, bukan ketik) • F alamat+telepon • G pernyataan • H/I keputusan
4 opsi (DISETUJUI/PERUBAHAN/DITANGGUHKAN/TIDAK DISETUJUI).

## 3. Yang SUDAH didukung backend saat ini (terverifikasi di kode)
- 4 jenis cuti (TAHUNAN, SAKIT, MELAHIRKAN, ALASAN_PENTING). **BESAR + DILUAR_TANGGUNGAN belum di-seed.**
- Rantai DRAFT→SUBMITTED→VERIFIED→PARAF→APPROVED→SIGNED→COMPLETED (+REVISION/REJECTED,
  +FORWARDED untuk Camat→Sekda). revise≈PERUBAHAN, reject≈TIDAK DISETUJUI.
  **DITANGGUHKAN tidak ada.**
- `availableActions` per status+permission (dipakai frontend render tombol).
- Upload 5MB pdf/jpg/png, timeline audit, totalDays hari kalender oleh backend.
- Submit wajib ≥2 dokumen termasuk SK_TERAKHIR (divalidasi backend).
- Tidak boleh memproses pengajuan sendiri (kecuali submit).
- List: filter `status` + cari `q` (**nama pegawai saja**, bukan NIP/nomor) + pagination.
- PATCH edit saat DRAFT/REVISION oleh pemilik. **Tidak ada DELETE, tidak ada notifikasi cuti.**

## 4. Yang masih butuh backend
- Seed 2 jenis cuti kurang; aksi postpone; tahap BKPSDM (submit/wait/receive/deliver/archive).
- Workflow per-org (kecamatan vs kelurahan) + pengecualian Camat→Sekda.
- Saldo/sisa cuti + riwayat per pegawai (endpoint khusus; frontend tampilkan dari API, bukan hitung).
- Dokumen wajib per jenis cuti (konfigurasi); notifikasi ke pejabat pemroses.
- Cari by NIP/nomor surat; filter jenis/unit/periode; DELETE draft.

## 5. Status implementasi frontend v1 (terkunci)
- `/cuti` list + filter status + cari nama; kartu statistik per status.
- `/cuti/baru` form per section + auto-fill pemohon + preview durasi (estimasi kalender).
- `/cuti/[id]` detail + aksi dari availableActions + timeline + dokumen + riwayat pegawai.
- `/cuti/[id]/edit` (DRAFT/REVISION milik sendiri).
- Belum ada (menunggu backend): saldo cuti, tahap BKPSDM, postpone, hapus draft, notifikasi cuti.
