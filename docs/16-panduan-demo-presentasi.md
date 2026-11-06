# Panduan Demo Presentasi SIMPEG Tamalate

> Dokumen ini adalah **naskah demo** untuk presentasi aplikasi SIMPEG Kecamatan Tamalate.
> Semua langkah di bawah mengikuti tampilan dan permission yang ada di aplikasi saat ini.
> Snapshot data: **6 November 2026**. Status record dapat berubah setelah gladi bersih —
> cek ulang daftar “Data demo siap pakai” sebelum presentasi.
>
> Dokumen ini tidak mengubah kode backend maupun frontend.

---

## 1. Persiapan sebelum presentasi

### 1.1 Jalankan aplikasi

Gunakan dua terminal:

```powershell
# Terminal 1 — backend
cd backend
npm run dev
```

```powershell
# Terminal 2 — frontend (paksa port 3001 agar tidak bentrok dengan backend)
cd frontend
npm run dev -- --port 3001
```

- Backend berjalan di `http://localhost:3000`.
- Frontend berjalan di `http://localhost:3001`.
- Buka `http://localhost:3001/login`.
- Jangan menjalankan migration/seed saat presentasi. Seed hanya menyiapkan akun dan master,
  bukan mengosongkan transaksi.

### 1.2 Siapkan tiga “profil browser”

Aplikasi menyimpan sesi login di browser. Agar perpindahan akun cepat dan tidak saling
menimpa, siapkan tiga jendela dengan profil/incognito berbeda:

| Jendela | Akun utama | Dipakai untuk |
|---|---|---|
| A — Pegawai | `pegawai1` / `pegawai2` | presensi, cuti, KGB, melihat notifikasi |
| B — Petugas | `verifier1`, `kasubag1`, `kasi1` | operator surat, verifikasi, presensi, register |
| C — Pimpinan | `sekcam1`, `camat1` | paraf, disposisi, keputusan, arsip |

Jika hanya memakai satu browser, selalu **Keluar** dulu sebelum login akun berikutnya.
Halaman login juga menyediakan tombol akun demo yang langsung mengisi username/password.

### 1.3 Akun demo

| Username | Password | Role | Position | Nama | Peran dalam demo |
|---|---|---|---|---|---|
| `pegawai1` | `Pegawai123!` | EMPLOYEE | STAF | Ahmad Pegawai | pemohon cuti/KGB, presensi |
| `pegawai2` | `Pegawai123!` | EMPLOYEE | STAF | Budi Kelurahan | contoh pegawai kelurahan, KGB/cuti |
| `verifier1` | `Verifier123!` | VERIFIER | STAF_KEPEGAWAIAN | Staf Kepegawaian | operator surat, registrasi cuti/KGB, kirim pensiun, legalisasi/register pangkat, buku/daftar arsip |
| `kasi1` | `Kasi123!` | SUPERVISOR | KASI | Kasi Pemerintahan | pertimbangan atasan cuti, penerima disposisi |
| `kasubag1` | `Kasubag123!` | SUPERVISOR | KASUBAG | Kasubag Umum | verifikasi cuti/KGB/pensiun/pangkat, presensi, teguran |
| `sekcam1` | `Sekcam123!` | LEADER | SEKCAM | Sekcam Satu | paraf, teruskan surat, arsip |
| `camat1` | `Camat123!` | LEADER | CAMAT | Muh. Aril Syahbani K, S.IP | keputusan akhir, disposisi, arsip |
| `pensiun1` | `Pensiun123!` | EMPLOYEE | STAF | Siti Pensiun | contoh PNS memasuki BUP 2026 |
| `pangkat1` | `Pangkat123!` | EMPLOYEE | STAF | Andi Pangkat | contoh ASN kenaikan pangkat |
| `superadmin` | `Admin123!` | SUPER_ADMIN | ADMIN | Super Admin | cadangan teknis; jangan dipakai untuk presensi |

Catatan:

- `superadmin` tidak dipakai untuk apel karena employee-nya dinonaktifkan dari presensi.
- `pegawai2` berada di unit Kelurahan Manuruki; cocok untuk menunjukkan pegawai di luar
  kantor kecamatan tetap bisa mengajukan, tetapi registrasi BKPSDM dilakukan staf kecamatan.
- `pangkat1` sudah masuk batch `PANGKAT-2026-0001`, jadi untuk membuat usulan baru pilih
  ASN lain yang eligible, misalnya `Ahmad Pegawai`.

### 1.4 Data demo siap pakai

Cek kembali statusnya sebelum presentasi. Nomor record di bawah adalah snapshot 6 November 2026.

| Modul | Record | Status saat snapshot | Dipakai untuk |
|---|---|---|---|
| Cuti | `CUTI-2026-0071` — Ahmad | `SUBMITTED` | mulai dari pertimbangan Kasi |
| Cuti | `CUTI-2026-0074` — Ahmad | `REVIEWED` | contoh siap verifikasi Kasubag |
| Cuti | `CUTI-2026-0073` — Budi | `VERIFIED` | paraf Sekcam lalu keputusan Camat |
| Cuti | `CUTI-2026-0070` — Ahmad | `ARCHIVED` | contoh riwayat selesai |
| KGB | `KGB-2026-0014` — Budi | `APPROVED` | register, kirim BKPSDM, selesai, arsip |
| KGB | `KGB-2026-0013` — Ahmad | `ARCHIVED` | contoh isi buku register |
| Pensiun | `PENSIUN-2026-0001` — Siti | `VERIFIED` | paraf Sekcam lalu keputusan Camat |
| Pangkat | `PANGKAT-2026-0001` — Andi | `ARCHIVED` | contoh batch selesai; buat batch baru dari Daftar Calon |
| Surat masuk | `AGENDA-2026-0042` | `REVIEW_SEKCAM` | sudah dinormalisasi; Sekcam teruskan → Camat disposisi |
| Surat masuk | `AGENDA-2026-0040` | `PROSES` | contoh surat dalam proses; target KASI_PEM sudah menerima, SEKCAM masih pending |
| Surat masuk | `AGENDA-2026-0036` | `DITERUSKAN` | contoh surat yang targetnya Sekcam |
| Surat masuk | `AGENDA-2026-0039` | `DIARSIPKAN` | contoh surat selesai diarsipkan |
| Surat keluar | `000.1.5 / 28 / KT / X / 2026` | `TERKIRIM` | contoh antrean arsip surat keluar |
| Surat keluar | `800.1.3.2 / 32 / KT / XI / 2026` | `DIARSIPKAN` | contoh surat keluar selesai |
| Teguran | `TEGURAN-2026-0024` — Staf Kepegawaian | `DILAPORKAN` | alur Sekcam → Camat → Kasubag |
| Teguran | `TEGURAN-2026-0018` — Budi Kelurahan | `DIPANGGIL` | contoh surat panggilan untuk pegawai |

`AGENDA-2026-0042` sudah dimigrasikan ke `REVIEW_SEKCAM`, jadi aman dipakai sebagai
contoh surat masuk. `AGENDA-2026-0041` tetap tersedia sebagai alternatif.

### 1.5 Berkas contoh

Siapkan di desktop:

- 1 PDF/JPG kecil untuk “SK terakhir” cuti.
- 1 PDF/JPG kecil untuk dokumen pendukung cuti.
- 3 PDF/JPG kecil untuk KGB: SK KGB/CPNS terakhir, SK pangkat terakhir, SKP 2 tahun.
- 1 PDF/JPG kecil untuk dokumen surat masuk.
- 1 PDF/JPG kecil untuk surat jawaban BKPSDM (dipakai di akhir cuti).

Semua berkas maksimal 5 MB untuk cuti/KGB/pensiun dan 10 MB untuk surat.

---

## 2. Peta aktor dan pembagian tugas

| Aktor | Role sistem | Yang boleh dilakukan | Yang tidak boleh |
|---|---|---|---|
| Pegawai | `EMPLOYEE` | presensi sendiri, ajukan cuti/KGB, lihat surat yang melibatkan dirinya | memverifikasi, menyetujui, mengelola pegawai lain |
| Staf Kepegawaian/Arsip | `VERIFIER` | catat surat masuk, buat/booking surat keluar, register cuti/KGB, kirim pensiun, legalisasi/register pangkat, susun daftar arsip, kelola presensi | memutuskan cuti, memaraf, approve, register pensiun |
| Atasan langsung/Kasi | `SUPERVISOR` + `KASI` | pertimbangan cuti, menerima dan menindaklanjuti disposisi | verifikasi berkas, paraf, approve |
| Kasubag Umum & Kepegawaian | `SUPERVISOR` + `KASUBAG` | verifikasi cuti/KGB/pensiun/pangkat, rekap presensi, input presensi, terbitkan teguran, register | paraf Sekcam, keputusan Camat |
| Sekcam | `LEADER` + `SEKCAM` | paraf cuti/KGB/pensiun/pangkat, teruskan surat ke Camat, setujui arsip, teruskan teguran | approve cuti, disposisi Camat |
| Camat | `LEADER` + `CAMAT` | keputusan akhir cuti/KGB/pensiun/pangkat, disposisi surat, setujui arsip, instruksi teguran | paraf Sekcam |
| Super Admin | `SUPER_ADMIN` | semua akses teknis | bukan peserta apel |

Prinsip yang bisa disampaikan:

- Menu dan tombol mengikuti **permission** dan **posisi**, bukan hardcode nama orang.
- Satu SOP terdiri dari banyak task; tiap task punya pelaksana sendiri.
- Hak yang sama di API tetap dibatasi di UI berdasarkan jabatan, misalnya `paraf` hanya
  Sekcam dan `approve` hanya Camat.

---

## 3. Rundown presentasi 60 menit

| Menit | Bagian | Aktor | Tujuan yang ditunjukkan |
|---|---|---|---|
| 0–3 | Pembukaan & login | semua | aplikasi berbasis peran, akun demo |
| 3–11 | Presensi & teguran | pegawai, kasubag, sekcam, camat | apel, validasi, deteksi pegawai bermasalah, pembinaan berjenjang |
| 11–23 | Cuti | pegawai, kasi, kasubag, sekcam, camat, verifier | alur 8 tahap, tanda tangan, surat pengantar, registrasi BKPSDM |
| 23–33 | KGB | pegawai, kasubag, sekcam, camat, verifier | verifikasi, paraf, approve, register, monitoring |
| 33–41 | Pensiun | kasubag, sekcam, camat, verifier | BUP, berkas usulan, paraf, approve, register/ekspedisi |
| 41–49 | Kenaikan pangkat | verifier, kasubag, sekcam, camat | daftar calon, legalisasi, verifikasi, paraf, approve, arsip |
| 49–58 | Surat masuk & disposisi | verifier, sekcam, camat, kasi | pencatatan, disposisi, tindak lanjut, arsip |
| 58–60 | Penutup | — | notifikasi, audit trail, arsip otomatis |

Jika waktu hanya 30–40 menit, gunakan **jalur cepat** pada bagian 5.

---

## 4. Alur demo per fitur

### 4.1 Login dan dashboard per peran (3 menit)

**Yang perlu ditunjukkan**

1. Buka `/login`.
2. Tunjukkan tombol akun demo di bawah form; klik `pegawai1`, lalu **Masuk**.
3. Masuk. Perhatikan sapaan dan kartu ringkasan:
   - Presensi hari ini
   - Cuti saya
   - KGB saya
   - Surat untuk saya
   - Notifikasi belum dibaca
4. Keluar, login `kasubag1`. Dashboard berubah menjadi:
   - Cuti menunggu pertimbangan
   - Pegawai bermasalah pekan ini
   - Status validasi apel hari ini
   - Notifikasi belum dibaca
5. Login `verifier1` untuk menunjukkan dashboard operasional:
   - Cuti siap registrasi
   - Cuti menunggu dikirim ke BKPSDM
   - Draft surat yang belum dikirim ke Sekcam
   - Notifikasi belum dibaca
6. Login `sekcam1` atau `camat1` untuk menunjukkan dashboard “antrean keputusan”:
   - Sekcam: cuti/KGB menunggu paraf, surat menunggu diteruskan
   - Camat: cuti/KGB menunggu keputusan, surat menunggu disposisi, surat dalam proses

**Narasi**

> “Dashboard tidak sama untuk setiap akun. Yang tampil adalah pekerjaan yang relevan
> dengan peran dan posisi pengguna. Pegawai melihat urusan dirinya; pimpinan melihat
> antrean keputusan; operator melihat antrean administrasi.”

**Yang ingin dibuktikan**

- Menu di sidebar mengikuti permission.
- Ringkasan angka dapat diklik dan langsung membawa ke daftar yang sudah terfilter.

---

### 4.2 Notifikasi (2–3 menit)

**Fungsi**

Pusat pemberitahuan untuk cuti, KGB, surat masuk, disposisi, arsip, presensi, dan
pengingat KGB.

**Langkah**

1. Login akun yang punya notifikasi, misalnya `sekcam1` atau `pegawai1`.
2. Buka menu **Notifikasi**.
3. Tunjukkan:
   - jumlah total notifikasi,
   - filter **Belum dibaca saja**,
   - tombol **Muat ulang**,
   - tombol **Tandai semua dibaca**,
   - tombol **Muat lebih banyak** jika daftar lebih dari 50,
   - badge jenis: Presensi, Cuti, KGB, Disposisi, Arsip, Pengingat KGB,
     Surat Teguran, Pembinaan.
4. Klik salah satu notifikasi yang punya tombol **Buka …**. Contoh:
   - notifikasi cuti → halaman detail cuti,
   - notifikasi surat/disposisi → halaman surat masuk,
   - notifikasi KGB → halaman KGB,
   - notifikasi **Pembinaan** atau **Surat Teguran** → halaman surat teguran.
5. Tunjukkan bahwa membuka notifikasi menandainya sudah dibaca dan badge di sidebar berubah.

**Contoh notifikasi teguran untuk pegawai**

1. Login `pegawai2` (Budi Kelurahan).
2. Buka **Notifikasi**.
3. Cari notifikasi berbadge **Pembinaan** dengan teks
   “Anda dijadwalkan pembinaan pada …”.
4. Klik **Buka surat teguran** → terbuka `TEGURAN-2026-0018` berstatus
   **Surat Panggilan**. Halaman menampilkan isi surat dan jadwal pembinaan.
5. Sebagai pembanding, login `pegawai1`; notifikasi serupa belum ada untuk
   surat lama miliknya, tetapi **Presensi → Surat teguran saya** tetap
   menampilkan `TEGURAN-2026-0016`.

**Narasi**

> “Notifikasi bukan sekadar daftar pesan. Setiap notifikasi membawa konteks record dan
> tautan langsung ke pekerjaan yang harus dilakukan. Halaman ini juga memakai pagination
> agar notifikasi lama tidak hilang tertutup yang baru.”

**Catatan**

- Notifikasi surat teguran kini juga tampil untuk pegawai penerima dengan tombol
  **Buka surat teguran**. Surat lama yang dibuat sebelum pembaruan backend mungkin
  belum punya notifikasi; gunakan menu **Presensi → Surat teguran saya** untuk
  membuka surat yang sudah ada.

---

### 4.3 Presensi dan pembinaan (8 menit)

**Fungsi**

Mencatat apel pagi dan sore, memvalidasi daftar hadir harian, merekap per pekan,
mendeteksi pegawai dengan ≥5 sesi tanpa keterangan, lalu menerbitkan surat teguran
dan pembinaan.

**Aktor**

| Tahap | Aktor |
|---|---|
| Check-in/check-out | pegawai |
| Validasi harian, input manual, kunci harian | Kasubag |
| Rekap pekan, deteksi bermasalah, terbitkan teguran | Kasubag |
| Teruskan laporan teguran | Sekcam |
| Instruksi tindak lanjut | Camat |
| Jadwalkan panggilan & catat hasil pembinaan | Kasubag |

#### A. Pegawai melakukan presensi

1. Login `pegawai1` (atau `pegawai2`).
2. Buka **Presensi**.
3. Tunjukkan kartu **Presensi saya hari ini**:
   - batas apel pagi,
   - status,
   - jam masuk/pulang,
   - tombol **Check-in apel sekarang** atau **Check-out pulang**.
4. Jika hari ini sudah check-in, tunjukkan status `HADIR`/`TERLAMBAT` dan jamnya.
   Jika belum, lakukan check-in sekali.
5. Tunjukkan bagian **Riwayat bulan berjalan**.

**Narasi**

> “Presensi dihitung per sesi: pagi dan sore. Satu sesi tidak hadir dihitung satu
> ketidakhadiran. Pegawai cukup melakukan check-in/check-out dari browser; operator
> tetap bisa mengoreksi dengan jejak audit.”

#### B. Kasubag memvalidasi dan mengunci

1. Login `kasubag1`.
2. Buka **Presensi**.
3. Tunjukkan **Daftar hadir harian**:
   - pilih tanggal,
   - status per pegawai,
   - tombol **Simpan & validasi** (mengunci hari),
   - label **Terkunci Kasubag** jika sudah dikunci.
4. Tunjukkan **Validasi presensi harian**:
   - pegawai yang belum presensi bisa langsung diberi `IZIN`, `SAKIT`, `DL`, atau `TK`,
   - jam masuk bisa dikoreksi,
   - ada jejak “Diisi …” dan “Diubah …”.
5. Tunjukkan **Rekapitulasi daftar hadir per pekan**:
   - panah minggu sebelumnya/berikutnya,
   - pilih pekan **2–6 November 2026** untuk melihat tiga pegawai bermasalah,
   - kolom TK, Izin, DL, Rekap,
   - baris merah untuk pegawai bermasalah.
6. Tunjukkan **Dokumentasi foto apel**: unggah foto pagi/sore (satu foto per sesi per tanggal).
7. Tunjukkan bagian **Pegawai bermasalah (≥5 TK/minggu)** dan tombol
   **Terbitkan & lapor ke Sekcam (pekan …)**.

**Narasi**

> “Kasubag tidak hanya melihat angka. Di sini ada validasi visual terhadap barisan apel,
> koreksi per baris dengan jejak audit, foto apel sebagai bukti, dan deteksi otomatis
> pegawai yang tidak hadir lima sesi atau lebih dalam sepekan.”

#### C. Alur surat teguran dan pembinaan

Gunakan data `TEGURAN-2026-0024` (Staf Kepegawaian) atau `TEGURAN-2026-0023` (Siti Pensiun).

1. Login `kasubag1`.
2. Buka **Presensi → Daftar teguran** (atau dari bagian pegawai bermasalah).
3. Buka `TEGURAN-2026-0024`.
4. Tunjukkan isi surat teguran, jumlah TK, pekan, dan tombol **Cetak**.
5. Perhatikan bagian **Pembinaan**: masih ada peringatan bahwa pembinaan baru bisa
   dijadwalkan setelah Sekcam meneruskan dan Camat memberi instruksi.
6. Login `sekcam1`.
7. Buka notifikasi atau **Presensi → Daftar teguran**, buka `TEGURAN-2026-0024`.
8. Isi catatan penerusan (opsional), klik **Teruskan ke Camat**.
9. Login `camat1`.
10. Buka record yang sama, isi **Instruksi tindak lanjut** (minimal 5 karakter),
    klik **Tindak lanjuti**.
11. Login kembali `kasubag1`.
12. Buka record yang sama. Sekarang bagian **Pembinaan** menampilkan form:
    - pilih tanggal/jam panggilan,
    - isi catatan panggilan,
    - klik **Buat panggilan**.
13. Setelah panggilan terjadwal, isi **Hasil pembinaan** (minimal 5 karakter),
    pilih tindak lanjut **Selesai internal** atau **Teruskan ke BKPSDM**,
    klik **Catat hasil**.

**Narasi**

> “Urutan ini penting: Kasubag menerbitkan dan melaporkan, Sekcam meneruskan, Camat
> memberi instruksi, baru Kasubag menjadwalkan pembinaan. Frontend sengaja memblokir
> pembinaan sebelum dua tahap itu selesai agar tidak ada lompatan prosedur.”

**Catatan demo**

- Pegawai penerima sekarang dapat membuka suratnya sendiri. Login `pegawai2`,
  buka **Presensi → Surat teguran saya**, lalu buka `TEGURAN-2026-0018` untuk
  menunjukkan **Surat Panggilan** dan jadwal pembinaan.
- Di halaman pegawai, tombol **Teruskan ke Camat**, **Tindak lanjuti**, dan form
  **Pembinaan** tidak ditampilkan. Backend tetap menolak akses ke surat milik
  pegawai lain dengan `403`.
- Status alur tampil sebagai badge: **Dilaporkan ke Sekcam**, **Surat Panggilan**,
  **Menunggu Tindak Lanjut Camat**, **Pembinaan**, **Selesai**, atau
  **Diteruskan ke BKPSDM**.

#### D. Tampilan pegawai penerima

1. Login `pegawai2`.
2. Buka **Presensi → Surat teguran saya**.
3. Buka `TEGURAN-2026-0018`.
4. Tunjukkan:
   - isi surat dan tombol **Cetak**,
   - badge **Surat Panggilan**,
   - jadwal panggilan pada bagian **Pembinaan**,
   - tidak ada tombol eskalasi atau form pembinaan.
5. Login `pegawai1`, lalu coba buka `TEGURAN-2026-0018` lewat URL detail.
   Backend menampilkan **“Bukan surat teguran milik Anda”**. Ini bukti
   pembatasan kepemilikan tetap berjalan walau halaman bisa dibuka pegawai.

---

### 4.4 Cuti (12 menit)

**Fungsi**

Pengajuan cuti self-service dengan alur berjenjang: atasan langsung → Kasubag →
Sekcam → Camat → registrasi/penerusan BKPSDM → hasil → arsip.

**Alur status**

```text
DRAFT → SUBMITTED → REVIEWED → VERIFIED → PARAF → APPROVED
      → REGISTERED → SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED
```

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Ajukan | pegawai | **Ajukan cuti** |
| Pertimbangan atasan | Kasi | **Pertimbangan atasan** |
| Verifikasi berkas | Kasubag | **Verifikasi & teruskan** |
| Paraf | Sekcam | **Paraf Sekcam** |
| Keputusan akhir | Camat | **Setujui & tandatangani (Camat)** |
| Registrasi | Verifier | **Registrasi** |
| Kirim ke BKPSDM | Verifier | **Teruskan ke BKPSDM** |
| Terima hasil | Verifier | **Terima hasil BKPSDM** |
| Arsip | Verifier | **Arsipkan** |

#### A. Pegawai mengajukan cuti

1. Login `pegawai1`.
2. Buka **Cuti → Pengajuan Baru**.
3. Tunjukkan:
   - jenis cuti (Cuti Tahunan, Besar, Sakit, Melahirkan, Alasan Penting,
     Di Luar Tanggungan Negara),
   - tanggal mulai/selesai dan durasi,
   - saldo cuti milik pegawai yang login,
   - alasan, alamat selama cuti, kontak.
4. Unggah minimal dua berkas:
   - **SK terakhir**,
   - satu dokumen pendukung (misalnya form cuti).
5. Untuk cuti sakit, tunjukkan bahwa **surat dokter** wajib.
6. Klik **Ajukan cuti**. Jika ingin menunjukkan draft, klik **Simpan draft** lebih dulu;
   draft boleh disimpan tanpa berkas, tetapi belum masuk antrean persetujuan.
7. Halaman detail menampilkan status `SUBMITTED`, dokumen, dan tombol aksi yang
   tersedia untuk pemohon.

**Narasi**

> “Cuti bersifat self-service. Pegawai hanya bisa mengajukan untuk dirinya sendiri;
> data pegawai diambil dari akun yang login, bukan dipilih dari daftar orang lain.”

**Jalur cepat tanpa membuat baru**

Gunakan `CUTI-2026-0071` yang sudah `SUBMITTED`, lalu lanjut ke langkah B.

#### B. Kasi memberi pertimbangan

1. Login `kasi1`.
2. Buka **Cuti**, cari `CUTI-2026-0071` atau buka dari notifikasi.
3. Klik **Pertimbangan atasan**.
4. Aplikasi membuka halaman **Surat Pengajuan Cuti**.
5. Gambar tanda tangan pada panel yang tersedia, lalu klik
   **Sudah tandatangan — teruskan**.
6. Status berubah menjadi `REVIEWED`.

**Narasi**

> “Pertimbangan atasan bukan sekadar centang. Atasan menandatangani surat pertimbangan
> langsung di halaman surat, lalu status baru bergerak.”

#### C. Kasubag memverifikasi

1. Login `kasubag1`.
2. Buka **Cuti**, cari `CUTI-2026-0071` (atau `CUTI-2026-0074` yang sudah `REVIEWED`).
3. Periksa dokumen dan riwayat pertimbangan.
4. Klik **Verifikasi & teruskan**.
5. Status menjadi `VERIFIED`; Sekcam dan Camat mendapat notifikasi.

**Narasi**

> “Kasubag memeriksa kelengkapan berkas dan meneruskan. Di halaman ini terlihat siapa
> yang sudah memproses, kapan, dan dengan catatan apa.”

#### D. Sekcam memaraf

1. Login `sekcam1`.
2. Buka **Cuti**, cari `CUTI-2026-0073` (Budi, `VERIFIED`) atau cuti yang baru diverifikasi.
3. Klik **Paraf Sekcam**.
4. Status menjadi `PARAF`.

**Narasi**

> “Paraf Sekcam bukan keputusan akhir. Tombolnya memang dipisahkan dari keputusan Camat
> agar urutan jabatan terlihat jelas.”

#### E. Camat memberi keputusan

1. Login `camat1`.
2. Buka **Cuti**, cari `CUTI-2026-0073`.
3. Klik **Setujui & tandatangani (Camat)**.
4. Halaman surat terbuka; gambar tanda tangan Camat.
5. Klik **Sudah tandatangan — teruskan**.
6. Status menjadi `APPROVED`.

**Narasi**

> “Camat melihat surat lengkap dengan pertimbangan atasan dan paraf Sekcam, lalu
> menandatangani keputusan. Tanda tangan dan waktu tersimpan di riwayat.”

#### F. Verifier menyelesaikan administrasi BKPSDM

1. Login `verifier1`.
2. Buka **Cuti**, filter `APPROVED`.
3. Buka cuti yang baru disetujui.
4. Klik **Registrasi**; isi nomor surat pengantar (wajib).
5. Status menjadi `REGISTERED`.
6. Klik **Teruskan ke BKPSDM**.
7. Status menjadi `SUBMITTED_BKPSDMD`.
8. Unggah **surat jawaban BKPSDM** pada bagian dokumen.
9. Klik **Terima hasil BKPSDM**.
10. Status menjadi `COMPLETED`.
11. Klik **Arsipkan**.
12. Status menjadi `ARCHIVED`.

**Narasi**

> “Di luar sistem, pegawai membawa surat pengantar ke BKPSDM. Saat surat jawaban
> kembali, operator mencatatnya, menyerahkan hasil ke pegawai, lalu mengarsipkan.
> Sistem tidak menganggap selesai hanya karena surat sudah dikirim.”

#### G. Cabang alur yang perlu diketahui

- **Minta revisi** mengembalikan pengajuan ke `REVISION`; pegawai memperbaiki data/berkas
  lalu mengajukan ulang.
- **Tangguhkan** mengubah status menjadi `POSTPONED`; pegawai dapat mengajukan ulang.
- **Tolak** mengakhiri pengajuan dengan alasan penolakan.
- Jika pemohon adalah **Sekcam**, paraf Sekcam dilewati dan pengajuan langsung ke Camat.
- Jika pemohon adalah **Camat**, pengajuan dapat diteruskan ke Sekda melalui aksi
  **Teruskan ke Sekda** (wajib catatan), lalu diselesaikan dengan **Selesaikan**.

Cabang ini tidak perlu dimainkan semua saat demo; cukup jelaskan bahwa sistem
menyediakan jalur revisi, penundaan, penolakan, dan jalur khusus Camat.

#### H. Cetak surat

- Di detail cuti, buka **Surat pengantar** untuk surat pengantar cuti.
- Buka halaman **Surat Pengajuan Cuti** untuk mencetak formulir pengajuan yang sudah
  bertanda tangan.
- Gunakan tombol **Cetak** pada halaman surat.

**Yang ingin dibuktikan**

- Alur tidak bisa dilompati dari UI.
- Tanda tangan muncul di surat.
- Riwayat proses mencatat aktor, jabatan, waktu, dan catatan.

---

### 4.5 KGB — Kenaikan Gaji Berkala (10 menit)

**Fungsi**

Mengusulkan kenaikan gaji berkala pegawai, memverifikasi berkas, memaraf, menyetujui,
mencatat nomor surat, meneruskan ke BKPSDM, dan mengarsipkan.

**Alur status**

```text
DRAFT → SUBMITTED → VERIFIED → PARAF → APPROVED
      → REGISTERED → SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED
```

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Ajukan | pegawai/Verifier | **Ajukan KGB** |
| Verifikasi + tanda tangan | Kasubag | **Verifikasi & tanda tangan** |
| Paraf | Sekcam | **Paraf Sekcam** |
| Validasi akhir | Camat | **Validasi akhir & setujui (Camat)** |
| Register | Verifier/Kasubag | **Register** |
| Kirim ke BKPSDM | Verifier/Kasubag | **Teruskan ke BKPSDM** |
| Selesai | Verifier/Kasubag | **Selesai** |
| Arsip | Verifier/Kasubag | **Arsip** |

#### A. Lihat monitoring dan pengingat

1. Login `kasubag1` atau `verifier1`.
2. Buka **KGB → Monitoring**.
3. Tunjukkan:
   - daftar pegawai aktif,
   - KGB terakhir,
   - perkiraan KGB berikutnya,
   - status “jatuh tempo” atau “terlambat”,
   - tombol **Kirim pengingat**.
4. Jangan klik berulang; endpoint pengingat belum idempoten.

**Narasi**

> “Monitoring membantu petugas menemukan pegawai yang akan atau sudah jatuh tempo,
> tanpa menunggu pegawai datang. Pengingat masuk ke notifikasi pegawai.”

#### B. Pegawai/operator membuat KGB

**Opsi 1 — mulai dari nol**

1. Login `pegawai1`.
2. Buka **KGB → Pengajuan Baru**.
3. Isi:
   - golongan lama dan baru,
   - gaji lama dan gaji baru (gaji baru harus lebih besar),
   - TMT,
   - catatan opsional.
4. Unggah tiga berkas wajib:
   - SK KGB/CPNS terakhir,
   - SK kenaikan pangkat terakhir,
   - SKP 2 tahun terakhir.
5. Klik **Ajukan KGB**.
6. Status menjadi `SUBMITTED`.

**Opsi 2 — jalur cepat**

Gunakan `KGB-2026-0014` milik Budi yang sudah `APPROVED`. Lanjut ke langkah D.

**Catatan operator**

Pembuatan KGB untuk pegawai lain dilakukan oleh `verifier1` (punya `kgb.create`).
`kasubag1` tidak memiliki `kgb.create`; perannya mulai dari verifikasi.

**Narasi**

> “KGB bisa diajukan pegawai sendiri atau dibantu operator kepegawaian. Operator
> memilih pegawai lewat pencarian; pegawai biasa otomatis memakai data dirinya.”

#### C. Verifikasi, paraf, dan persetujuan

1. Login `kasubag1`.
2. Buka **KGB**, cari pengajuan `SUBMITTED`.
3. Klik **Verifikasi & tanda tangan**.
4. Jika belum punya tanda tangan, gambar dulu pada panel tanda tangan Kasubag.
5. Status menjadi `VERIFIED`.
6. Login `sekcam1`.
7. Buka KGB `VERIFIED`, klik **Paraf Sekcam**.
8. Status menjadi `PARAF`.
9. Login `camat1`.
10. Buka KGB `PARAF`, klik **Validasi akhir & setujui (Camat)**.
11. Gambar tanda tangan Camat jika diminta.
12. Status menjadi `APPROVED`.

**Narasi**

> “Verifikasi Kasubag dan keputusan Camat memakai tanda tangan. Paraf Sekcam adalah
> tahap terpisah. Di UI, Sekcam hanya melihat tombol paraf dan Camat hanya melihat
> tombol validasi akhir.”

**Catatan penting**

Tanda tangan KGB saat ini disimpan di **localStorage browser** dan dipakai pada
pratinjau surat KGB. Tanda tangan belum tersimpan di server. Ini cukup untuk demo,
tetapi produksi memerlukan penyimpanan tanda tangan/TTE yang sebenarnya.

#### D. Register sampai arsip (jalur cepat `KGB-2026-0014`)

1. Login `verifier1` atau `kasubag1`.
2. Buka **KGB**, cari `KGB-2026-0014` (Budi, `APPROVED`).
3. Klik **Register**.
4. Isi catatan dengan nomor surat keluar, misalnya:
   `800.1.11.13/001/KT/XI/2026`.
5. Status menjadi `REGISTERED`.
6. Klik **Teruskan ke BKPSDM** → `SUBMITTED_BKPSDMD`.
7. Klik **Selesai** → `COMPLETED`.
8. Klik **Arsip** → `ARCHIVED`.
9. Buka **KGB → Buku Register** untuk menunjukkan baris hasil register.
10. Buka halaman **Surat pengantar KGB** untuk mencetak surat.

**Narasi**

> “Register KGB mencatat nomor surat keluar. Setelah surat pengantar dibuat, operator
> mencatat pengiriman ke BKPSDM, lalu menandai selesai dan mengarsipkan.”

**Cabang alur KGB**

- **Minta revisi** mengembalikan pengajuan ke `REVISION`; pegawai/operator memperbaiki
  data dan berkas, lalu mengajukan ulang.
- **Tolak** mengakhiri pengajuan dengan alasan penolakan.
- **Hapus draf** hanya tersedia saat status `DRAFT`.
- Setelah `COMPLETED`, arsip dapat dilakukan oleh petugas register.

**Yang ingin dibuktikan**

- Berkas wajib dicek sebelum submit.
- Verifikasi dan approve membutuhkan tanda tangan.
- Monitoring, register book, dan surat pengantar saling terhubung.

---

### 4.6 Pensiun PNS (8 menit)

**Fungsi**

Mengusulkan pensiun PNS berdasarkan BUP, mengelola berkas usulan kolektif, memaraf,
menyetujui, mencatat nomor surat, ekspedisi, tanda terima, dan arsip.

**Alur status**

```text
DRAFT → VERIFIED → PARAF → APPROVED
      → REGISTERED → EXPEDITED → SENT → COMPLETED → ARCHIVED
```

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Lihat BUP & buat draf | Kasubag | **Buat Draf Usulan** |
| Verifikasi berkas | Kasubag | **Verifikasi** |
| Paraf | Sekcam | **Paraf** |
| Setujui | Camat | **Setujui** |
| Register | Kasubag | **Register** |
| Ekspedisi | Kasubag | **Ekspedisi** |
| Kirim | Verifier | **Kirim** |
| Selesai | Verifier | **Selesai** |
| Arsip | Kasubag | **Arsipkan** |

#### A. Daftar BUP

1. Login `kasubag1`.
2. Buka **Pensiun PNS → Daftar BUP**.
3. Tunjukkan:
   - tahun 2026,
   - usia BUP 58,
   - rentang tanggal,
   - daftar PNS, tanggal lahir, usia, tanggal pensiun, masa kerja,
   - status “Sudah diusulkan”.
4. Pada snapshot ini, `Siti Pensiun` sudah masuk `PENSIUN-2026-0001`, sehingga
   checkbox-nya nonaktif dan berlabel **Sudah diusulkan**. Ini menunjukkan pencegahan
   duplikasi usulan.
5. Untuk memperagakan pembuatan dari nol, gunakan database salinan atau tambahkan
   PNS lain yang memasuki BUP. Pada data demo saat ini, lanjutkan batch yang sudah ada.

**Narasi**

> “Daftar BUP menghitung otomatis siapa yang akan pensiun. Sistem juga mencegah satu
> pegawai masuk dua berkas usulan.”

#### B. Verifikasi berkas

Jika membuat batch baru:

1. Pilih PNS yang belum diusulkan.
2. Klik **Buat Draf Usulan**.
3. Di detail batch, unggah dokumen per item.
4. Klik **Verifikasi** dan konfirmasi **dokumen lengkap**.
5. Status menjadi `VERIFIED`.

Pada snapshot, `PENSIUN-2026-0001` sudah `VERIFIED`; lanjut ke paraf.

#### C. Paraf Sekcam dan persetujuan Camat

1. Login `sekcam1`.
2. Buka **Pensiun PNS**, cari `PENSIUN-2026-0001`.
3. Klik **Paraf**.
4. Status menjadi `PARAF`.
5. Login `camat1`.
6. Buka batch yang sama, klik **Setujui**.
7. Status menjadi `APPROVED`.

**Narasi**

> “Usulan pensiun adalah berkas kolektif. Paraf dan tanda tangan cukup sekali per
> berkas, bukan per pegawai.”

#### D. Register, ekspedisi, kirim, selesai, arsip

1. Login `kasubag1`.
2. Buka `PENSIUN-2026-0001` (`APPROVED`).
3. Klik **Register**; masukkan tanggal surat keluar. Backend membuat surat keluar
   otomatis dengan nomor dari service penomoran.
4. Status menjadi `REGISTERED`.
5. Klik **Ekspedisi**; masukkan nama pendistribusi.
6. Status menjadi `EXPEDITED`.
7. Login `verifier1`.
8. Buka batch yang sama, klik **Kirim**; masukkan nomor dan tanggal tanda terima.
9. Status menjadi `SENT`.
10. Klik **Selesai** → `COMPLETED`.
11. Login `kasubag1`, klik **Arsipkan** → `ARCHIVED`.

**Narasi**

> “Di pensiun, register bisa sekaligus membuat surat keluar. Setelah itu dicatat
> ekspedisi dan tanda terima, karena pengiriman fisik ke BKPSDM tetap perlu dilacak.”

#### E. Cetak

- **Cetak daftar nominatif** untuk daftar PNS dalam batch.
- **Cetak surat usulan** untuk surat resmi.
- Buku Register, Nominatif, dan Ekspedisi tersedia di submenu Pensiun PNS.

**Cabang alur pensiun**

- **Minta Revisi** mengembalikan batch ke `REVISION`; Kasubag memperbaiki data/berkas
  lalu memverifikasi ulang.
- **Tolak** mengakhiri batch dengan alasan penolakan.
- Verifikasi wajib mencentang/mengonfirmasi **dokumen lengkap**.

---

### 4.7 Kenaikan Pangkat (8 menit)

**Fungsi**

Mengusulkan kenaikan pangkat ASN berdasarkan masa jabatan, mengelola daftar calon,
legalisasi, verifikasi, paraf, keputusan, register, dan arsip.

**Alur status**

```text
DRAFT → LEGALIZED → VERIFIED → PARAF → APPROVED → REGISTERED → ARCHIVED
```

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Buat draf dari calon | Verifier | **Buat Draf Usulan** |
| Legalisasi | Verifier | **Legalisasi** |
| Verifikasi | Kasubag | **Verifikasi** |
| Paraf | Sekcam | **Paraf** |
| Setujui | Camat | **Setujui** |
| Register | Verifier | **Register** |
| Arsip | Verifier | **Arsip** |

#### A. Daftar calon

1. Login `verifier1`. (Kasubag dapat melihat daftar, tetapi pembuatan draf adalah
   kewenangan Verifier.)
2. Buka **Kenaikan Pangkat → Daftar Calon**.
3. Tunjukkan:
   - tahun periode,
   - pencarian nama/NIP/unit,
   - kolom golongan saat ini, TMT pangkat, masa jabatan, jatuh tempo,
   - golongan yang diusulkan,
   - status kelayakan.
4. Pilih ASN yang eligible dan belum masuk usulan. Contoh: `Ahmad Pegawai`.
   Jangan pilih `Andi Pangkat` karena sudah masuk `PANGKAT-2026-0001`.
5. Isi bulan periode dan catatan, lalu klik **Buat Draf Usulan**.
6. Halaman detail batch terbuka dengan status `DRAFT`.

**Narasi**

> “Daftar calon membantu petugas menemukan ASN yang sudah memenuhi masa jabatan.
> Sistem menolak kandidat yang belum jatuh tempo atau belum punya TMT pangkat.”

#### B. Lengkapi item dan berkas

1. Di detail batch, periksa daftar ASN.
2. Tambah item jika perlu.
3. Unggah dokumen per item sesuai checklist.
4. Tunjukkan status kelengkapan dokumen dan daftar dokumen yang kurang.

#### C. Legalisasi dan verifikasi

1. Login `verifier1`.
2. Buka batch `DRAFT`, klik **Legalisasi**.
3. Status menjadi `LEGALIZED`.
4. Login `kasubag1`.
5. Buka batch, klik **Verifikasi**.
6. Status menjadi `VERIFIED`.

**Narasi**

> “Legalisasi memastikan dokumen resmi sudah dilegalisasi. Verifikasi Kasubag
> memastikan isi dan kelengkapan usulan sebelum naik ke pimpinan.”

#### D. Paraf dan keputusan

1. Login `sekcam1`, buka batch `VERIFIED`, klik **Paraf** → `PARAF`.
2. Login `camat1`, buka batch `PARAF`, klik **Setujui** → `APPROVED`.

**Narasi**

> “Sama seperti cuti dan KGB, paraf Sekcam dan keputusan Camat adalah dua tahap
> berbeda.”

#### E. Register dan arsip

1. Login `verifier1`.
2. Buka batch `APPROVED`, klik **Register**.
3. Status menjadi `REGISTERED`; nomor surat dan nomor agenda tercatat.
4. Klik **Arsip**.
5. Status menjadi `ARCHIVED`.
6. Buka **Buku Register**, **Daftar Nominatif**, dan **Buku Arsip** untuk menunjukkan
   hasilnya.

**Narasi**

> “Buku register dan nominatif membaca data yang sama dengan detail usulan, sehingga
> tidak ada pencatatan ganda.”

**Cabang alur kenaikan pangkat**

- **Minta revisi** mengembalikan batch ke `REVISION`; item dan dokumen diperbaiki,
  lalu proses diulang.
- **Tolak** mengakhiri batch dengan alasan penolakan.
- Item hanya bisa ditambah/diubah/dihapus saat batch `DRAFT` atau `REVISION`.
- Jika ada item yang dokumennya kurang, status kelengkapan terlihat di tabel item.

---

### 4.8 Surat masuk, disposisi, dan tindak lanjut (10 menit)

**Fungsi**

Mencatat surat masuk, membuat lembar disposisi, meneruskan ke Camat, mendistribusikan
ke target, mencatat tindak lanjut, dan mengarsipkan.

**Alur status**

```text
DRAFT_TU → REVIEW_SEKCAM → DISPOSISI_CAMAT → DITERUSKAN
         → PROSES → MENUNGGU_ARSIP → DIARSIPKAN
```

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Catat surat | Verifier | **Simpan Draft** / **Simpan & Kirim ke Sekcam** |
| Teruskan ke Camat | Sekcam | **Teruskan ke Camat** |
| Disposisi | Camat | **Kirim disposisi** |
| Terima & baca | target disposisi | **Terima & Baca** |
| Tindak lanjut | target disposisi | **Selesai & Ajukan Arsip** |
| Arsip | Sekcam/Camat | **Setujui & Arsipkan** |

#### A. Operator mencatat surat (opsional, jika mulai dari nol)

1. Login `verifier1`.
2. Buka **Surat Masuk → Pencatatan Baru**.
3. Isi:
   - jenis surat: Biasa atau Undangan/Kegiatan,
   - sifat surat: Biasa/Rahasia/Sangat rahasia,
   - nomor surat dari pengirim,
   - pengirim,
   - perihal minimal 5 karakter,
   - tanggal surat,
   - prioritas,
   - ringkasan isi (wajib),
   - klasifikasi arsip (wajib),
   - tujuan, penanggung jawab, keterangan.
4. Jika memilih **Undangan/Kegiatan**, isi tanggal, waktu mulai/selesai, tempat,
   dan pilih petugas agenda.
5. Unggah file surat (wajib saat mengirim ke Sekcam).
6. Klik **Simpan & Kirim ke Sekcam**.
7. Status menjadi `REVIEW_SEKCAM`.

**Narasi**

> “Nomor agenda dibuat otomatis. Ringkasan dan klasifikasi wajib diisi sejak awal
> supaya surat tidak menggantung tanpa konteks arsip.”

**Jalur cepat**

Gunakan `AGENDA-2026-0041` yang sudah `REVIEW_SEKCAM`; mulai dari langkah B.

#### B. Sekcam meneruskan ke Camat

1. Login `sekcam1`.
2. Buka **Surat Masuk**, cari `AGENDA-2026-0041`.
3. Buka detail. Tunjukkan:
   - informasi surat,
   - ringkasan isi,
   - alur surat di sisi kanan,
   - progres disposisi,
   - dokumen.
4. Isi catatan untuk Camat (opsional), klik **Teruskan ke Camat**.
5. Status menjadi `DISPOSISI_CAMAT`.

**Narasi**

> “Sekcam memeriksa surat dan meneruskan. Di halaman ini terlihat posisi surat dalam
> alur tujuh tahap, bukan hanya status teks.”

#### C. Camat memberi disposisi

1. Login `camat1`.
2. Buka `AGENDA-2026-0041`.
3. Pada panel **Disposisi Camat**:
   - pilih target, misalnya **Kasi Pemerintahan, Kinerja Lurah & RT/RW**
     (untuk `kasi1`),
   - isi instruksi minimal 5 karakter, misalnya
     “Tindak lanjuti dan laporkan hasilnya.”,
   - isi batas waktu (opsional).
4. Klik **Kirim disposisi**.
5. Status menjadi `DITERUSKAN`.

**Narasi**

> “Camat bisa memilih beberapa target sekaligus dengan satu instruksi. Target yang
> tidak punya penerima aktif tidak bisa dipilih.”

#### D. Target menerima dan menindaklanjuti

1. Login `kasi1`.
2. Buka notifikasi disposisi atau **Surat Masuk**, cari `AGENDA-2026-0041`.
3. Pada disposisi untuk dirinya, klik **Terima & Baca**.
4. Status disposisi menjadi `ACCEPTED`; surat menjadi `PROSES`.
5. Isi catatan tindak lanjut (minimal 3 karakter).
6. Klik **Selesai & Ajukan Arsip**.
7. Jika semua target selesai, surat menjadi `MENUNGGU_ARSIP`.

**Narasi**

> “Penerima disposisi harus menekan Terima & Baca. Ini mencatat waktu ekspedisi dan
> memastikan surat benar-benar dibaca, bukan hanya diteruskan.”

#### E. Arsip surat masuk

1. Login `sekcam1` atau `camat1`.
2. Buka `AGENDA-2026-0041` yang sudah `MENUNGGU_ARSIP`.
3. Klik **Setujui & Arsipkan**.
4. Status menjadi `DIARSIPKAN`; nomor arsip dibuat.
5. Buka **Surat Masuk → Buku Agenda** dan **Buku Ekspedisi** untuk menunjukkan catatan.
6. Buka **Arsip → Buku Arsip** untuk melihat record arsipnya.

**Narasi**

> “Arsip tidak dicatat manual. Arsip dibuat otomatis setelah surat selesai dan disetujui
> oleh Sekcam atau Camat.”

---

### 4.9 Surat keluar dan penomoran (6 menit)

**Fungsi**

Menerbitkan surat keluar dengan nomor otomatis, atau mem-booking nomor terlebih dahulu
untuk dipakai belakangan. Setelah terkirim, surat masuk antrean arsip.

**Aktor**

| Tahap | Aktor | Tombol |
|---|---|---|
| Terbitkan langsung | Verifier | **Terbitkan surat** |
| Booking nomor | Verifier | **Booking N nomor** |
| Terbitkan dari booking | Verifier | **Terbitkan** |
| Batalkan booking | Verifier | **Batalkan** |
| Arsip | Sekcam/Camat | **Setujui & Arsipkan** |

#### A. Terbitkan surat langsung

1. Login `verifier1`.
2. Buka **Surat Keluar → Buat / Booking Nomor**.
3. Pilih mode **Terbitkan surat**.
4. Isi:
   - klasifikasi arsip,
   - perihal minimal 5 karakter,
   - tujuan,
   - tanggal surat (tidak boleh masa depan),
   - prioritas,
   - sifat,
   - penandatangan,
   - kode surat,
   - nomor tujuan,
   - penanggung jawab,
   - keterangan,
   - file (opsional).
5. Klik **Terbitkan surat**.
6. Surat langsung berstatus `TERKIRIM` dan nomor dibuat backend.

**Narasi**

> “Nomor surat tidak diketik manual. Backend memakai service penomoran dengan buffer
> agar tidak bentrok.”

#### B. Booking nomor

1. Pada halaman yang sama, pilih mode **Booking nomor**.
2. Isi jumlah nomor 1–50, klasifikasi, tanggal, alasan minimal 5 karakter.
3. Klik **Booking N nomor**.
4. Daftar nomor yang berhasil dibooking muncul.
5. Buka **Buka detail** pada salah satu nomor.
6. Lengkapi perihal dan tujuan, lalu **Terbitkan**.
7. Jika nomor batal dipakai, gunakan **Batalkan** dengan alasan.

**Narasi**

> “Booking berguna untuk surat yang nomornya sudah diminta tetapi isinya belum final.
> Nomor tetap unik dan bisa dibatalkan dengan alasan.”

#### C. Arsip surat keluar

1. Login `sekcam1` atau `camat1`.
2. Buka **Arsip → Buku Arsip**.
3. Pada **Antrean Persetujuan Arsip**, pilih tab **Surat Keluar**.
4. Pilih surat, misalnya `000.1.5 / 28 / KT / X / 2026`.
5. Klik **Setujui & Arsipkan** untuk mengarsipkan, atau **Kembalikan** dengan catatan revisi.
6. Buka **Surat Keluar → Buku Agenda** untuk melihat daftar surat keluar.

**Narasi**

> “Surat keluar yang sudah terkirim tidak langsung menjadi arsip. Sekcam/Camat
> menyetujui arsipnya, dan jika ditolak surat dikembalikan untuk revisi.”

**Cabang alur surat keluar**

- Booking yang tidak jadi dipakai dapat dibatalkan lewat **Batalkan reservasi** dengan alasan.
- Surat yang ditolak saat persetujuan arsip dapat diperbaiki lalu diajukan ulang
  dengan aksi **Ajukan ulang ke antrean arsip**.
- Surat yang sudah `DIARSIPKAN` menjadi record tetap di Buku Arsip.

---

### 4.10 Arsip (4 menit)

**Fungsi**

Melihat buku arsip, menyetujui antrean arsip surat masuk/keluar, membuat daftar arsip
periode, dan menandatangani daftar arsip.

**Langkah**

1. Login `sekcam1` atau `camat1`.
2. Buka **Arsip → Buku Arsip**.
3. Tunjukkan:
   - ringkasan buku arsip,
   - filter sumber (masuk/keluar), kategori, klasifikasi, tahun, tanggal,
   - daftar arsip dengan nomor arsip, judul, tanggal, kategori, lokasi.
4. Buka **Antrean Persetujuan Arsip**:
   - tab Surat Masuk,
   - tab Surat Keluar,
   - pilih beberapa surat (maksimal 15 per batch),
   - **Setujui & Arsipkan** atau **Kembalikan** dengan catatan minimal 3 karakter.
5. Untuk membuat daftar, login `verifier1`, buka **Arsip → Daftar Arsip**:
   - daftar arsip yang sudah disusun,
   - tombol **+ Susun daftar** untuk membuat daftar baru,
   - pilih periode,
   - biarkan kosong untuk mode otomatis (semua arsip belum terdaftar dalam periode),
   - atau pilih record tertentu,
   - simpan.
6. Login kembali `sekcam1` atau `camat1`, buka detail daftar arsip, lalu klik
   **Tandatangani**. Tombol ini hanya muncul untuk Sekcam/Camat.

**Narasi**

> “Ada dua lapis arsip: record arsip per surat, dan daftar arsip per periode. Record
> arsip dibuat otomatis; daftar arsip disusun petugas lalu ditandatangani pimpinan.”

---

### 4.11 Buku-buku pendukung (2–3 menit)

Tunjukkan cepat bahwa data yang sudah diproses masuk ke buku administrasi:

| Buku | Lokasi | Isi |
|---|---|---|
| Buku Agenda Surat Masuk | Surat Masuk → Buku Agenda | nomor agenda, pengirim, perihal, tanggal, status, petugas |
| Buku Ekspedisi Surat Masuk | Surat Masuk → Buku Ekspedisi | distribusi dan tanda terima |
| Buku Agenda Surat Keluar | Surat Keluar → Buku Agenda | nomor surat, tujuan, tanggal, status |
| Buku Register KGB | KGB → Buku Register | nomor, pegawai, golongan, gaji, nomor surat |
| Buku Register Pensiun | Pensiun PNS → Buku Register | nomor usulan, pegawai, nomor surat, tanggal |
| Daftar Nominatif Pensiun | Pensiun PNS → Daftar Nominatif | daftar PNS per periode |
| Buku Ekspedisi Pensiun | Pensiun PNS → Buku Ekspedisi | pengiriman berkas |
| Buku Register Pangkat | Kenaikan Pangkat → Buku Register | nomor usulan, ASN, nomor surat |
| Daftar Nominatif Pangkat | Kenaikan Pangkat → Daftar Nominatif | daftar ASN per periode |
| Buku Arsip Pangkat | Kenaikan Pangkat → Buku Arsip | arsip usulan |
| Buku Arsip | Arsip → Buku Arsip | seluruh record arsip |
| Daftar Arsip | Arsip → Daftar Arsip | daftar arsip per periode |

**Narasi**

> “Semua buku ini membaca data transaksi yang sama. Tidak ada input ulang, sehingga
> risiko salah catat berkurang.”

---

## 5. Versi cepat 30–40 menit

Gunakan data yang sudah disiapkan agar tidak perlu membuat record baru.

| Urutan | Akun | Halaman | Aksi | Hasil yang ditunjukkan |
|---|---|---|---|---|
| 1 | `pegawai1` | Dashboard | tunjukkan kartu ringkasan | dashboard pegawai |
| 2 | `kasubag1` | Dashboard | tunjukkan antrean | dashboard Kasubag |
| 3 | `sekcam1` | Dashboard | tunjukkan antrean paraf | dashboard pimpinan |
| 4 | `pegawai1` | Presensi | check-in/check-out | presensi mandiri |
| 5 | `kasubag1` | Presensi | rekap, validasi, pegawai bermasalah | kontrol presensi |
| 6 | `kasubag1` | Presensi → Daftar teguran | buka `TEGURAN-2026-0024` | surat teguran |
| 7 | `sekcam1` | Teguran | **Teruskan ke Camat** | eskalasi |
| 8 | `camat1` | Teguran | isi instruksi | instruksi Camat |
| 9 | `kasubag1` | Teguran | jadwalkan panggilan | pembinaan |
| 10 | `kasi1` | Cuti | `CUTI-2026-0071` → **Pertimbangan atasan** | review atasan |
| 11 | `kasubag1` | Cuti | **Verifikasi & teruskan** | verifikasi |
| 12 | `sekcam1` | Cuti | `CUTI-2026-0073` → **Paraf Sekcam** | paraf |
| 13 | `camat1` | Cuti | **Setujui & tandatangani** | keputusan |
| 14 | `verifier1` | Cuti | registrasi → BKPSDM | administrasi |
| 15 | `verifier1` | KGB | `KGB-2026-0014` → **Register** | register KGB |
| 16 | `kasubag1` | KGB | **Teruskan ke BKPSDM** | pengiriman |
| 17 | `sekcam1` | Pensiun | `PENSIUN-2026-0001` → **Paraf** | paraf pensiun |
| 18 | `camat1` | Pensiun | **Setujui** | keputusan pensiun |
| 19 | `kasubag1` | Pensiun | **Register** | surat otomatis |
| 20 | `verifier1` | Pangkat | Daftar Calon → buat draf | usulan pangkat |
| 21 | `verifier1` | Pangkat | **Legalisasi** | legalisasi |
| 22 | `kasubag1` | Pangkat | **Verifikasi** | verifikasi |
| 23 | `sekcam1` | Pangkat | **Paraf** | paraf |
| 24 | `camat1` | Pangkat | **Setujui** | keputusan |
| 25 | `sekcam1` | Surat Masuk | `AGENDA-2026-0041` → **Teruskan ke Camat** | penerusan |
| 26 | `camat1` | Surat Masuk | pilih target + instruksi → **Kirim disposisi** | disposisi |
| 27 | `kasi1` | Surat Masuk | **Terima & Baca** → **Selesai & Ajukan Arsip** | tindak lanjut |
| 28 | `sekcam1` | Surat Masuk | **Setujui & Arsipkan** | arsip |
| 29 | `verifier1` | Surat Keluar | terbitkan atau booking nomor | penomoran |
| 30 | `camat1` | Arsip | antrean surat keluar → **Setujui & Arsipkan** | arsip surat keluar |

Jika waktu sangat sempit, pilih **satu jalur lengkap** (cuti atau surat masuk) dan
tunjukkan modul lain hanya sampai halaman daftar/detail.

---

## 6. Hal yang sebaiknya tidak didemokan

| Hal | Alasan | Cara aman |
|---|---|---|
| Mengharapkan notifikasi untuk surat teguran lama | Notifikasi dibuat saat surat baru diterbitkan setelah pembaruan backend | buka langsung **Presensi → Surat teguran saya** |
| Klik **Kirim pengingat** KGB berulang | Endpoint belum idempoten; notifikasi bisa ganda | klik sekali saja |
| Membuat pensiun baru untuk Siti | Siti sudah masuk `PENSIUN-2026-0001` | gunakan batch yang ada, atau database salinan |
| Uji paraf/approve lewat API langsung | Sebagian permission API (KGB/pensiun/pangkat) dimiliki bersama LEADER; UI yang membatasi jabatan | gunakan UI |
| Mengandalkan tanda tangan setelah ganti browser | Tanda tangan KGB/cuti disimpan di localStorage browser | gambar ulang di profil yang dipakai |
| Mengharapkan data kembali seperti semula setelah demo | Seed tidak mengosongkan transaksi | gunakan database salinan untuk gladi |

---

## 7. Keterbatasan backend yang perlu diketahui tim

Bagian ini tidak perlu dibacakan panjang-panjang saat presentasi. Siapkan jawaban jika
ada pertanyaan teknis. Detail tindak lanjut backend ada di
`docs/15-backend-followup-qa-nov2026.md`.

1. **Belum ada endpoint eksplisit “lapor Kasubag ke Sekcam” untuk teguran.**
   Penerbitan surat teguran saat ini mengirim notifikasi ke Sekcam dan Camat.
   Artinya “lapor” masih implisit. Frontend menampilkan panduan, tetapi tidak ada
   tombol lapor tersendiri.
   Rekomendasi: tambahkan aksi `report`/`submit` dengan status yang jelas.

2. **Urutan `forward → instruct → summon` belum ditegakkan backend.**
   Frontend memblokir pembinaan sebelum Sekcam meneruskan dan Camat memberi instruksi,
   tetapi API masih bisa dipanggil langsung. Untuk produksi, validasi urutan sebaiknya
   juga dilakukan di service.

3. **Tanda tangan cuti/KGB masih demo.**
   Tanda tangan disimpan di `localStorage` browser, bukan di server. Pratinjau surat
   memakai gambar dari browser. Untuk produksi, perlu penyimpanan tanda tangan/TTE,
   hash dokumen, dan audit.

4. **Sebagian permission `paraf`/`approve` masih dimiliki bersama oleh LEADER.**
   Untuk cuti, `sekcam1` di-deny `leave.approve` dan `camat1` di-grant, jadi keputusan
   cuti sudah terpisah. Namun `leave.paraf` masih dimiliki keduanya. Untuk KGB, pensiun,
   dan kenaikan pangkat, `paraf` dan `approve` sama-sama ada di role LEADER; UI yang
   membatasi berdasarkan posisi `SEKCAM`/`CAMAT`. Jika integrasi dilakukan lewat API,
   perlu guard posisi di backend.

5. **KGB register memakai catatan sebagai nomor surat.**
   Nomor surat tidak dibuat otomatis oleh modul KGB. Operator perlu membuat surat
   keluar lebih dulu atau mencatat nomor yang sudah ada.
   Rekomendasi: integrasikan register KGB dengan modul surat keluar seperti pensiun.

6. **Pensiun belum punya banyak kandidat BUP di data demo.**
   Hanya Siti yang masuk BUP 2026 dan sudah masuk batch. Untuk memperagakan pembuatan
   batch dari nol, perlu data PNS tambahan atau database salinan.

7. **Penyimpanan berkas memakai abstraksi lokal/Supabase.**
   Backend sudah mendukung `STORAGE_DRIVER=local|supabase`. Untuk demo tanpa kredensial
   Supabase, gunakan mode `local`; pastikan folder `UPLOAD_DIR` dapat ditulis.
   Jika memakai Supabase, jalankan `npm run storage:migrate` untuk memindahkan berkas
   lama.

> **Sudah diperbaiki pada pembaruan 6 November 2026:** pegawai dapat membuka surat
> teguran miliknya sendiri, dan `AGENDA-2026-0042` sudah dimigrasikan ke
> `REVIEW_SEKCAM`. Keduanya tidak lagi menjadi keterbatasan demo.

---

## 8. Jawaban singkat untuk pertanyaan umum

**Apakah menu setiap akun berbeda?**
Ya. Menu dan tombol mengikuti permission. Posisi juga dipakai untuk membatasi aksi
yang permission-nya sama, misalnya paraf Sekcam dan approve Camat.

**Apakah data antarpegawai bisa dilihat bebas?**
Tidak. Role EMPLOYEE dibatasi ke data miliknya; petugas melihat sesuai kewenangan.
Daftar dan detail juga memakai scope di backend.

**Apakah nomor surat bisa bentrok?**
Nomor dibuat backend dengan service penomoran. Surat keluar punya buffer nomor, dan
surat masuk memakai nomor agenda otomatis.

**Apakah arsip dibuat manual?**
Record arsip dibuat otomatis dari surat yang selesai dan disetujui. Yang manual adalah
penyusunan **daftar arsip** per periode.

**Apa beda KGB dan kenaikan pangkat?**
KGB adalah kenaikan gaji berkala. Kenaikan pangkat adalah perubahan golongan/pangkat.
Keduanya punya alur dan berkas yang berbeda.

**Apakah tanda tangan elektronik sudah sah?**
Untuk demo, tanda tangan disimpan di browser. Produksi memerlukan TTE/penyimpanan
tanda tangan yang tersertifikasi dan tercatat di server.

**Mengapa pegawai tidak bisa membuka surat teguran?**
Sekarang sudah bisa. Pegawai dapat membuka surat miliknya sendiri dari
**Presensi → Surat teguran saya** atau dari notifikasi. Backend tetap menolak
pegawai yang mencoba membuka surat milik pegawai lain (`403`).

**Apakah bisa diakses dari HP?**
Tampilan responsif dan dapat dibuka dari browser HP. Untuk demo, gunakan laptop agar
halaman surat dan tabel lebih nyaman.

---

## 9. Checklist H-1 dan hari-H

### H-1

- [ ] Backup/salin database demo.
- [ ] Jalankan backend dan frontend; pastikan login semua akun.
- [ ] Cek status record pada tabel bagian 1.4.
- [ ] Siapkan berkas contoh PDF/JPG.
- [ ] Gambar tanda tangan untuk `kasi1`, `kasubag1`, dan `camat1` di profil yang akan dipakai.
- [ ] Pastikan notifikasi demo masih ada yang belum dibaca.
- [ ] Uji `AGENDA-2026-0041` dari Sekcam sampai arsip.
- [ ] Uji `CUTI-2026-0071` dari Kasi sampai Camat.
- [ ] Uji `KGB-2026-0014` dari register sampai arsip.
- [ ] Uji `PENSIUN-2026-0001` dari paraf sampai register.
- [ ] Siapkan screenshot cadangan untuk setiap modul.

### Hari-H

- [ ] Buka tiga profil browser (pegawai, petugas, pimpinan).
- [ ] Buka `/login` di masing-masing profil.
- [ ] Siapkan halaman dashboard pegawai sebagai layar awal.
- [ ] Matikan notifikasi desktop/chat yang mengganggu.
- [ ] Pastikan koneksi ke database stabil.
- [ ] Jangan menjalankan seed/migration saat sesi berlangsung.
- [ ] Catat waktu: mulai tepat, sisakan 5 menit untuk tanya jawab.

---

## 10. Ringkasan satu halaman

```text
PEGAWAI
  Presensi: check-in/check-out
  Cuti: ajukan + unggah berkas
  KGB: ajukan + unggah berkas
  Notifikasi: lihat pekerjaan

KASI
  Cuti: pertimbangan atasan + tanda tangan
  Surat: terima disposisi + tindak lanjut

KASUBAG
  Cuti/KGB/Pensiun/Pangkat: verifikasi berkas
  Presensi: validasi, rekap, teguran, pembinaan
  Pensiun: daftar BUP, register, ekspedisi
  Pangkat: verifikasi

VERIFIER
  Surat masuk: catat + kirim ke Sekcam
  Surat keluar: terbitkan/booking nomor
  Cuti/KGB: register + kirim BKPSDM + arsip
  Pensiun: kirim + selesai
  Pangkat: legalisasi + register + arsip
  Arsip: buku arsip + daftar arsip

SEKCAM
  Cuti/KGB/Pensiun/Pangkat: paraf
  Surat masuk: teruskan ke Camat
  Teguran: teruskan laporan ke Camat
  Arsip: setujui arsip

CAMAT
  Cuti/KGB/Pensiun/Pangkat: keputusan akhir
  Surat masuk: disposisi target
  Teguran: instruksi pembinaan
  Arsip: setujui arsip
```
