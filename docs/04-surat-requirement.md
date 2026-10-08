# Surat masuk, disposisi & surat keluar — requirement terverifikasi

> Sumber: SOP + lembar disposisi fisik + buku agenda/ekspedisi Kecamatan Tamalate.
> Diverifikasi melawan `backend/prisma/seed.ts` dan routes backend.

## 1. Alur surat masuk yang dikunci

**Diterima → staf arsip memilah & mencatat → lembar disposisi dibuat →
Sekcam memeriksa → Camat disposisi → distribusi → penerima menindaklanjuti →
selesai → arsip.** Pelaksana utama: staf kepegawaian, spesialisasi: staf arsip
(bukan semuanya "Kasubag" — peran dibedakan saat user management tersedia).

## 2. Buku agenda — kolom Keterangan wajib ada
Backend `register-book` sudah mengembalikan: nomor, instansiDitujukan, noSurat,
tanggalSurat, perihal, penanggungJawab, ket (= remarks ?? status).
**Konsekuensi frontend: field Keterangan/remarks di form "Catat surat" wajib
diisi operator** (sudah ada, tinggal penekanan). Kolom "tanggal distribusi"
belum ada di backend — usulan: pakai `createdAt` atau tambah field.

## 3. Tujuan disposisi: 9 vs 10 — SELESAI
Seed backend berisi tepat **9 target** (`SEKCAM, KASI_PEM, KASI_TRANTIB,
KASI_PMK, KASI_EKBANG, KASI_BERSIH, KASUBAG_UMUM, KASUBAG_RENKEU, BENDAHARA`).
Nomor 10 yang kosong pada formulir fisik = **"lainnya"** → disposisi tanpa
`targetCode` (backend: opsional). Frontend sudah menampilkan dropdown 9 target
+ opsi lainnya.

## 4. Notifikasi disposisi — SUDAH ADA
Backend membuat `notification` untuk penerima tiap disposisi; frontend punya
halaman `/notifikasi` + badge. Tinggal uji dengan akun Kasi.

## 5. Surat keluar: sisakan 3 nomor — MEKANISME SIAP, ATURAN TERBUKA
Backend `reserve` hanya satu nomor per call. Frontend menyediakan tombol
**"Reservasi 3 nomor sekaligus"** (3 call berurutan, nomor ditampilkan).
Belum diputuskan kecamatan: selalu tepat 3? kadaluarsa reservasi? nomor
tidak terpakai diapakan? lintas bulan/tahun bagaimana?

## 6. Penomoran & klasifikasi
Format `klasifikasi/seq/KT/romawi/tahun` sudah didukung backend. Seed berisi
14 kode flat (subset operasional). Hierarki penuh 000–900 + kode unit
kelurahan (KB, KBB, KBR, …) = pekerjaan master data backend berikutnya,
bukan penghalang frontend.

## 7. Yang masih butuh backend (di luar scope frontend)
- Tahap "Sekcam memeriksa/paraf" pada surat masuk (belum dimodelkan).
- Field tanggal distribusi.
- `GET /employees` dan `GET /users` (dropdown penerima disposisi & operator).
- Rantai status distribusi ekspedisi (baru usulan desain).
- Hapus `passwordHash` dari response cuti (keamanan).

## 8. Status implementasi frontend v1 (terkunci)
- `/surat-masuk` (list + filter + cari), `/surat-masuk/baru` (remarks = kolom Keterangan),
  `/surat-masuk/[id]` (rantai disposisi + tindak lanjut + selesaikan/arsip + upload +
  catat ekspedisi + dropdown 9 tujuan disposisi, no. 10 = lainnya/tanpa targetCode).
- `/surat-masuk/agenda` (buku agenda + cetak), `/surat-masuk/ekspedisi` (buku ekspedisi + cetak),
  `/surat-masuk/[id]/lembar-disposisi` (cetak mirip formulir fisik + kolom tanda tangan).
- `/surat-keluar` + `/baru` (terbit langsung / reservasi 1 nomor / reservasi 3 nomor sekaligus)
  + detail (terbitkan reservasi, batalkan, upload dokumen).
- `/notifikasi` (filter belum dibaca, tandai dibaca, deep-link ke surat masuk untuk disposisi).
- `/presensi/teguran` (daftar + detail + cetak surat teguran).
- Belum ada (menunggu backend): tahap paraf Sekcam, status distribusi per-tahap,
  reservasi bernomor dengan masa berlaku, tanda tangan digital.
