# Surat masuk, disposisi & surat keluar — requirement terverifikasi

> Sumber: SOP + lembar disposisi fisik + buku agenda/ekspedisi Kecamatan Tamalate.
> Diverifikasi melawan `backend/prisma/seed.ts` dan routes backend.

## 1. Alur surat masuk yang dikunci

**Diterima → staf arsip memilah & mencatat → lembar disposisi dibuat →
Sekcam memeriksa → Camat disposisi → distribusi → penerima menindaklanjuti →
selesai → arsip.** Pelaksana utama: staf kepegawaian, spesialisasi: staf arsip
(bukan semuanya "Kasubag" — peran dibedakan saat user management tersedia).

## 2. Buku agenda — kolom Keterangan wajib ada
Backend `register-book` mengembalikan: nomor, nomorAgenda, instansiDitujukan,
instansiAsal, noSurat, tanggalSurat, tanggalDiterima, perihal, penanggungJawab,
klasifikasi, `ket`/`keterangan` (= remarks ?? status), status, petugasAgenda[].
**Konsekuensi frontend: field Keterangan/remarks di form "Catat surat" wajib
diisi operator** (sudah ada, tinggal penekanan). Tanggal distribusi tersedia di
detail surat sebagai `distributedAt`.

## 3. Tujuan disposisi: 9 vs 10 — SELESAI
Seed backend berisi tepat **9 target** (`SEKCAM, KASI_PEM, KASI_TRANTIB,
KASI_PMK, KASI_EKBANG, KASI_BERSIH, KASUBAG_UMUM, KASUBAG_RENKEU, BENDAHARA`).
Nomor 10 yang kosong pada formulir fisik = **"lainnya"** → disposisi tanpa
`targetCode` (backend: opsional). Frontend sudah menampilkan dropdown 9 target
+ opsi lainnya. `GET /letters/disposition-targets` sekarang mengembalikan
`recipients[]` dan `available`; target tanpa akun aktif harus dinonaktifkan di
UI (backend menolak 422 bila dipilih).

## 4. Notifikasi disposisi — SUDAH ADA
Backend membuat `notification` untuk penerima tiap disposisi; frontend punya
halaman `/notifikasi` + badge. Tinggal uji dengan akun Kasi.

## 5. Surat keluar: sisakan 3 nomor — SELESAI (buffer otomatis)
Backend sekarang menyimpan `urutan_penomoran.tanggal_terakhir`. Saat tanggal
surat berganti, sistem otomatis membuat 3 nomor buffer untuk tanggal lama;
tanggal baru mulai setelah 3 nomor tersebut. Surat menyusul/backdate memakai
buffer tanggal lama lewat endpoint yang sama (`POST /outgoing-letters` atau
`/reserve` dengan `letterDate` lama). Buffer habis → 409. Sequence tahunan
(tahun baru mulai dari 1). Status buffer bisa dilihat di
`GET /outgoing-letters/numbering?year=`.
**Frontend wajib menghapus tombol "Reservasi 3 nomor sekaligus".** Tombol itu
membuat 3 surat RESERVED nyata; jika dipakai bersama buffer otomatis, hari
berikutnya akan melewati 6 nomor (3 reserved + 3 buffer). Cukup tampilkan status
dari `GET /outgoing-letters/numbering?year=`.

## 6. Penomoran & klasifikasi
Format `klasifikasi/seq/KT/romawi/tahun` sudah didukung backend. Seed berisi
14 kode flat (subset operasional). Hierarki penuh 000–900 + kode unit
kelurahan (KB, KBB, KBR, …) = pekerjaan master data backend berikutnya,
bukan penghalang frontend.

## 7. Yang masih butuh backend (di luar scope frontend)
- Rantai status distribusi ekspedisi (baru usulan desain).
- Hierarki klasifikasi penuh 000–900 + kode unit kelurahan (seed masih 14 kode flat).
- Tanda tangan digital (saat ini tombol aksi).
- ✅ SELESAI di backend v2 (`bf60109`): tahap paraf Sekcam (`POST /letters/:id/paraf`),
  tanggal distribusi (`distributedAt`), `GET /employees` + `GET /users`,
  hapus `passwordHash` dari response.

## 8. Status implementasi frontend v1 (terkunci)
- `/surat-masuk` (list + filter + cari), `/surat-masuk/baru` (remarks = kolom Keterangan),
  `/surat-masuk/[id]` (rantai disposisi + tindak lanjut + selesaikan/arsip + upload +
  catat ekspedisi + dropdown 9 tujuan disposisi, no. 10 = lainnya/tanpa targetCode).
- `/surat-masuk/agenda` (buku agenda + cetak), `/surat-masuk/ekspedisi` (buku ekspedisi + cetak),
  `/surat-masuk/[id]/lembar-disposisi` (cetak mirip formulir fisik + kolom tanda tangan).
- `/surat-keluar` + `/baru` (terbit langsung / reservasi 1 nomor; buffer 3 nomor
  otomatis dari backend, jadi tombol reservasi 3 nomor manual tidak dipakai lagi)
  + detail (terbitkan reservasi, batalkan, upload dokumen, isi nomor tujuan/PIC/kode surat/keterangan).
- `/notifikasi` (filter belum dibaca, tandai dibaca, deep-link ke surat masuk untuk disposisi).
- `/presensi/teguran` (daftar + detail + cetak surat teguran).
- Belum ada: status distribusi per-tahap, masa berlaku reservasi, tanda tangan digital.
  Paraf Sekcam dan `distributedAt` sudah tersedia di backend.
