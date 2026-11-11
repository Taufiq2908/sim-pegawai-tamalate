# Revisi Cuti, KGB, Paraf, dan Keputusan Camat (November 2026)

Dokumen ini adalah spesifikasi yang dapat diuji untuk revisi backend. Frontend
tidak diubah pada tahap ini; daftar pekerjaan frontend ada di bagian akhir.

## Ringkasan keputusan

| No | Kebutuhan | Status backend |
|---|---|---|
| 1 | Notifikasi cuti sampai ke Sekcam/Camat berdasarkan jabatan, termasuk Plt | Selesai; migrasi diterapkan |
| 2 | Riwayat paraf tanpa gambar, append-only, dengan versi + hash dokumen | Selesai untuk cuti dan KGB; migrasi diterapkan |
| 3 | Keputusan akhir Camat pada KGB: setujui / kembalikan / tolak | Selesai; migrasi diterapkan |
| 4 | Integrasi TTE | Belum diputuskan; tidak diimplementasikan |
| 5 | Dokumen revisi yang dapat diuji | Selesai (dokumen ini) |

Prinsip yang dipakai:

- Wewenang paraf dan persetujuan ditentukan **jabatan**, bukan hanya permission.
- Penerima notifikasi ditentukan **jabatan aktif** (termasuk Plt), bukan data
  atasan pada profil pemohon.
- Paraf tidak berupa gambar. Bukti paraf adalah baris riwayat di database.
- Riwayat paraf tidak boleh diubah atau dihapus.
- Dokumen yang berubah membentuk versi baru; paraf versi lama tetap tersimpan.

## 1. Notifikasi cuti ke Sekcam/Camat

### Kebutuhan yang dapat diuji

1. Setelah Kasubag menjalankan `verify`, status permohonan cuti menjadi
   `VERIFIED` dan sistem membuat notifikasi `type=LEAVE` untuk semua user aktif
   yang memegang jabatan `SEKCAM`, termasuk Plt Sekcam yang aktif.
   `pending-approval` Kasubag juga memuat `SUBMITTED` yang melewati REVIEWED.
2. Setelah Sekcam menjalankan `paraf`, status menjadi `PARAF` dan sistem
   membuat notifikasi untuk semua user aktif yang memegang jabatan `CAMAT`,
   termasuk Plt Camat yang aktif.
3. Pemohon tetap menerima notifikasi perubahan status.
4. Notifikasi tidak dikirim ke pelaku aksi itu sendiri.
5. Jika tidak ada penerima, backend menulis peringatan di log dan tidak
   menggagalkan transisi.
6. `GET /leave-requests/pending-approval` tetap menampilkan dokumen walaupun
   notifikasi gagal terkirim.
7. Setiap item daftar/detail memiliki `waitingFor` yang menunjukkan pihak yang
   sedang ditunggu.
8. Khusus pemohon Sekcam, setelah Kasubag `verify` status `VERIFIED` langsung
   menunggu Camat: Camat menerima notifikasi dan item muncul di
   `pending-approval` Camat (tanpa paraf Sekcam).

### Implementasi

- `NEXT_POSITION` pada `leave.service.ts`: `verify -> SEKCAM`,
  `paraf -> CAMAT`.
- Pada `submit` yang melewati REVIEWED (Camat/Sekcam/Lurah/pegawai kelurahan),
  notifikasi dikirim ke pemegang `leave.verify` (Kasubag), bukan atasan.
- `userIdsForPosition()` di `position.service.ts` menggabungkan:
  - user dengan `position` yang cocok;
  - alias `PLT_SEKCAM`, `PLT.SEKCAM`, `PLT-SEKCAM`, `PLT SEKCAM`;
  - baris `penugasan_plt` yang aktif pada waktu sekarang.
- Endpoint baru:
  - `GET /leave-requests/pending-approval`
  - `GET /kgb-requests/pending-approval`
- Field baru pada list/detail: `waitingFor`.
- Saluran notifikasi saat ini hanya **in-app**. Email/WhatsApp belum tersedia.
- Pengingat otomatis untuk dokumen yang menunggu terlalu lama belum
  diimplementasikan. Endpoint `pending-approval` dapat menjadi dasar scheduler
  pengingat pada iterasi berikutnya.

### Catatan penyebab lama

Penerima sebelumnya di-resolve dari permission (`leave.paraf`,
`leave.approve`). Karena role `LEADER` dapat dipegang Sekcam dan Camat, cara ini
rawan salah penerima atau tidak ada penerima saat konfigurasi role berubah.
Sekarang tahap `verify` dan `paraf` memakai jabatan.

## 2. Riwayat paraf tanpa gambar

### Kebutuhan yang dapat diuji

1. Kasubag memeriksa dan memverifikasi. Sekcam membuka dokumen di SIMPEG,
   memeriksa, lalu menekan **Paraf dan Teruskan**. Tidak ada gambar paraf yang
   ditempel ke PDF.
2. Sistem menyimpan baris `riwayat_paraf` berisi:
   - jenis dan ID dokumen;
   - nomor dokumen;
   - versi dokumen;
   - hash dokumen;
   - ID, nama, NIP, dan jabatan aktor saat itu;
   - aksi: `PARAF`, `APPROVE`, `RETURN`, atau `REJECT`;
   - catatan;
   - waktu.
3. Baris riwayat tidak dapat diubah atau dihapus. Database menolak `UPDATE`,
   `DELETE`, dan `TRUNCATE` lewat trigger.
4. Setelah dokumen diparaf, dokumen utama terkunci. Perubahan hanya dapat
   dilakukan setelah dokumen dikembalikan ke `REVISION`. Unggahan surat jawaban
   BKPSDM adalah dokumen pendukung dan tidak mengubah dokumen utama.
5. Saat dokumen revisi diajukan ulang, `version` bertambah. Paraf harus diulang
   pada versi baru.
6. Detail dokumen menampilkan `documentVersion`, `currentDocumentHash`, dan
   `parafHistory`.
7. `currentDocumentHash` berubah bila isi dokumen berubah; hash tidak berubah
   hanya karena status berubah.

### Implementasi

- Tabel `riwayat_paraf` (`DocumentParaf`) bersifat polimorfik:
  - `jenis_dokumen`: `LEAVE`, `KGB`, dan nantinya `PENSION`, `PROMOTION`,
    `LETTER`.
  - `id_dokumen` adalah UUID dokumen.
- Hash memakai SHA-256 atas serialisasi deterministik isi dokumen. Status dan
  timestamp tidak ikut di-hash.
- Setiap file yang diunggah dihitung SHA-256 isinya dan disimpan di
  `dokumen_cuti.hash_konten` / `dokumen_kgb.hash_konten`. Hash dokumen
  menggabungkan hash konten semua file naskah utama + metadata, sehingga
  perubahan isi file mengubah `currentDocumentHash`. Surat jawaban BKPSDM
  dikecualikan karena dibuat setelah persetujuan. Baris lama tanpa `hash_konten`
  tetap terbaca dengan nilai `null`.
- `version` ada pada `permohonan_cuti` dan `permohonan_kgb`.
- Jika aktor bertindak sebagai Plt aktif, `actorPosition` menyimpan
  `Plt. SEKCAM`/`Plt. CAMAT`, bukan jabatan substantifnya.
- Aksi yang dicatat:
  - cuti: `paraf`, `approve`, `reject`, dan `revise` dari `VERIFIED`/`PARAF`
    (dicatat sebagai `RETURN`);
  - KGB: `paraf`, `approve`, `return`, `reject`.
- Endpoint tidak menyediakan update/delete riwayat paraf.

### Kebijakan versi

Kebijakan yang dipakai: **paraf diulang dari awal pada versi baru**.

Alasannya, paraf melekat pada isi dokumen. Jika isi berubah, seluruh paraf pada
versi lama tidak lagi mewakili dokumen yang baru. Riwayat versi lama tetap
disimpan untuk audit.

## 3. Keputusan akhir Camat pada KGB

### Alur status

```text
DRAFT -> SUBMITTED -> VERIFIED -> PARAF -> APPROVED -> REGISTERED
                         |          |
                         |          +--> RETURN -> REVISION -> SUBMITTED (versi baru)
                         |          +--> REJECT -> REJECTED
                         +---------------> RETURN -> REVISION
```

`APPROVED` berarti Camat telah menyetujui. Status ini belum menyatakan bahwa
TTE berhasil karena integrasi TTE belum diputuskan.

### Kebutuhan yang dapat diuji

1. Hanya Sekcam (atau Plt Sekcam aktif) yang dapat menjalankan `paraf`.
2. Hanya Camat (atau Plt Camat aktif) yang dapat menjalankan `approve`.
3. Camat dapat menjalankan `return` dari `PARAF` dengan catatan wajib.
   Status menjadi `REVISION`.
4. Sekcam dapat menjalankan `return` dari `VERIFIED` dengan catatan wajib.
   Status menjadi `REVISION`.
5. Camat dapat menjalankan `reject` dari `PARAF` dengan alasan wajib.
   Status menjadi `REJECTED` dan final.
6. Setelah `return`, pemohon dapat memperbaiki dokumen dan mengajukan ulang.
   Versi bertambah dan paraf harus diulang.
7. `approve` mengisi `approvedAt`, `approvedBy`, dan `approvalNote`.
8. `return` menghapus penanda persetujuan sebelumnya.
9. `availableActions` hanya menampilkan tombol yang sesuai jabatan.
10. Detail KGB memuat `waitingFor`, `parafHistory`, `documentVersion`, dan
    `currentDocumentHash`.

### Kasus TTE gagal

Integrasi TTE belum ada, sehingga belum ada status “TTE gagal”. Jika nanti
Opsi 3 dipilih, kegagalan TTE harus:

- tidak mengubah status dari `PARAF`;
- menampilkan pesan kesalahan yang spesifik;
- tidak menulis `approvedAt` palsu;
- dapat dicoba ulang tanpa membuat versi dokumen baru.

### Camat berhalangan / Plt

- Tabel `penugasan_plt` menyimpan jabatan, user, waktu mulai, waktu berakhir,
  status aktif, dan alasan.
- Endpoint admin:
  - `GET /users/acting-positions`
  - `POST /users/acting-positions`
  - `PATCH /users/acting-positions/:id`
- Notifikasi dan wewenang paraf/persetujuan memakai Plt aktif.
- Plt harus dicatat resmi; bukan sekadar mengganti `users.position`.

## 4. Keputusan TTE

Belum ada implementasi TTE. Keputusan yang masih terbuka:

| Opsi | Cara kerja | Kelebihan | Kekurangan |
|---|---|---|---|
| 1. Manual lewat Srikandi/BeSign | Camat menandatangani PDF di luar SIMPEG, lalu mengunggah hasilnya | Cepat, tanpa integrasi | Ada langkah manual dan risiko salah unggah |
| 2. Didaftarkan di Srikandi | Surat dibuat di Srikandi, SIMPEG mencatat status | Alur persuratan rapi | Kerja di dua sistem |
| 3. Integrasi langsung BSrE | Camat menekan Setujui + TTE di SIMPEG | Paling mulus | Paling rumit, butuh kerja sama resmi |

Rekomendasi: mulai dari Opsi 1, sambil memverifikasi ke Diskominfo/ANRI apakah
Srikandi menyediakan integrasi eksternal. Rekomendasi ini belum menjadi
keputusan desain.

Prasyarat semua opsi:

- Camat dan penandatangan lain memiliki sertifikat elektronik BSrE aktif.
- Passphrase tersedia dan diingat.
- Hasil tanda tangan dapat diverifikasi melalui layanan verifikasi BSrE.
- Pada Opsi 1, petugas memverifikasi bahwa file yang diunggah benar-benar sudah
  ditandatangani.

Yang belum disepakati:

- opsi TTE;
- apakah unggah PDF bertanda tangan dilakukan Camat atau operator;
- apakah status final menunggu verifikasi TTE atau cukup unggahan;
- format metadata TTE yang disimpan.

## 5. Perubahan API

### Cuti

| Endpoint | Perubahan |
|---|---|
| `GET /leave-requests` | Item memiliki `waitingFor`; `version` tersedia |
| `GET /leave-requests/pending-approval` | Baru; daftar tugas + `count` |
| `GET /leave-requests/:id` | `waitingFor`, `documentVersion`, `currentDocumentHash`, `parafHistory` |
| `POST /leave-requests/:id/revise` | Dapat dari `VERIFIED` (Sekcam) dan `PARAF` (Camat); dicatat sebagai `RETURN` |
| `POST /leave-requests/:id/paraf` | Hanya Sekcam/Plt Sekcam |
| `POST /leave-requests/:id/approve` | Hanya Camat/Plt Camat |
| `POST /leave-requests/:id/reject` / `postpone` | Pada `VERIFIED` hanya Sekcam; pada `PARAF` hanya Camat |

### KGB

| Endpoint | Perubahan |
|---|---|
| `GET /kgb-requests` | Item memiliki `waitingFor`; `version` tersedia |
| `GET /kgb-requests/pending-approval` | Baru; daftar tugas + `count` |
| `GET /kgb-requests/:id` | `waitingFor`, `documentVersion`, `currentDocumentHash`, `parafHistory`, `approvedAt` |
| `POST /kgb-requests/:id/return` | Baru; dari `VERIFIED` (Sekcam) atau `PARAF` (Camat); catatan wajib |
| `POST /kgb-requests/:id/approve` | Hanya Camat/Plt Camat; mengisi `approvedAt` |
| `POST /kgb-requests/:id/paraf` | Hanya Sekcam/Plt Sekcam |
| `POST /kgb-requests/:id/reject` | Pada `VERIFIED` hanya Sekcam; pada `PARAF` hanya Camat |

### Plt

```text
GET   /users/acting-positions?position=SEKCAM&active=true
POST  /users/acting-positions
      { position, userId, startsAt, endsAt?, reason? }
PATCH /users/acting-positions/:id
      { isActive?, endsAt?, reason? }
```

Permission: `user.view` untuk baca, `user.manage` untuk tulis.

## 6. Yang harus dilakukan frontend

Frontend tidak diubah pada pekerjaan ini. Berikut daftar yang perlu disesuaikan:

### Cuti

1. Tambahkan halaman/kartu **Menunggu persetujuan saya** yang memanggil
   `GET /leave-requests/pending-approval` dan menampilkan `meta.count`.
2. Tampilkan kolom **Sedang menunggu** dari `waitingFor` pada daftar.
3. Tampilkan `parafHistory`, `documentVersion`, dan `currentDocumentHash` pada
   detail. Jangan menampilkan gambar paraf.
4. Ubah label tombol paraf menjadi **Paraf dan Teruskan**.
5. Sediakan tombol **Kembalikan** (`revise`) pada status `VERIFIED` untuk
   Sekcam dan `PARAF` untuk Camat, dengan catatan wajib.
6. Sembunyikan tombol berdasarkan `availableActions` dari backend; jangan
   menghitung jabatan sendiri di frontend.
7. Setelah aksi, render ulang detail dari response dan tampilkan 409 sebagai
   “dokumen sudah berubah, muat ulang”.

### KGB

1. Tambahkan halaman/kartu **Menunggu persetujuan saya** dari
   `GET /kgb-requests/pending-approval`.
2. Tampilkan `waitingFor`, `parafHistory`, `documentVersion`, dan
   `currentDocumentHash`.
3. Tampilkan tiga tombol Camat pada status `PARAF`:
   - **Setujui** → `POST /kgb-requests/:id/approve`;
   - **Kembalikan dengan catatan** → `POST /kgb-requests/:id/return`;
   - **Tolak** → `POST /kgb-requests/:id/reject`.
4. Catatan wajib untuk `return` dan `reject`.
5. Jangan menampilkan klaim “TTE berhasil” sebelum opsi TTE diimplementasikan.
   Untuk sementara gunakan label **Disetujui Camat**.
6. Jika Opsi 1 dipilih, tambahkan UI unggah PDF bertanda tangan dan tampilkan
   status verifikasinya.

### Notifikasi

1. Notifikasi tetap in-app. Tidak ada email/WhatsApp.
2. Jangan mengandalkan notifikasi sebagai satu-satunya daftar tugas; gunakan
   endpoint `pending-approval`.
3. Tampilkan badge jumlah dari `meta.count`.

### Plt

1. Tambahkan halaman admin penugasan Plt bila diperlukan.
2. Jangan mengubah `users.position` untuk menandai Plt; gunakan
   `penugasan_plt` agar jejak dan masa berlaku tercatat.

## 7. Skenario UAT minimal

1. Kasubag memverifikasi cuti → Sekcam menerima notifikasi dan dokumen muncul
   di `pending-approval`.
2. Sekcam memparaf → Camat menerima notifikasi dan dokumen muncul di
   `pending-approval`.
3. Camat menyetujui KGB → `approvedAt` terisi dan paraf history bertambah.
4. Camat mengembalikan KGB dari `PARAF` tanpa catatan → 422.
5. Camat mengembalikan KGB dengan catatan → `REVISION`, versi bertambah saat
   diajukan ulang, paraf lama tetap ada.
6. Sekcam mencoba `approve` KGB → 403.
7. Camat mencoba `paraf` KGB → 403.
8. Pengguna yang ditugaskan sebagai Plt Sekcam aktif menerima notifikasi dan
   dapat memparaf.
9. `UPDATE`/`DELETE` langsung ke `riwayat_paraf` ditolak database.
10. `currentDocumentHash` berubah setelah isi dokumen diubah pada versi baru.
11. Dua file berbeda dengan nama dan ukuran sama menghasilkan `hash_konten`
    berbeda, sehingga `currentDocumentHash` berbeda.
12. Cuti pemohon Sekcam: setelah Kasubag `verify`, Camat menerima notifikasi
    dan item muncul di `pending-approval` Camat; Sekcam tidak menerima tugas
    paraf untuk pengajuan itu.

## 8. Deployment

Migrasi: `20261111000000_paraf_history_and_camat_decision`.

Langkah:

```bash
npm run prisma:deploy
npx prisma migrate status
npm run build
```

Status 2026-11-11: `npm run prisma:deploy` berhasil diterapkan ke database.
`npx prisma migrate status` melaporkan **Database schema is up to date**.

Pemeriksaan runtime read-only yang sudah dilakukan:

- `GET /leave-requests/pending-approval` sebagai Sekcam mengembalikan 11 item
  `VERIFIED` dan `meta.count = 11`.
- Detail cuti `CUTI-2026-0035` memuat `waitingFor = "Sekcam"`,
  `availableActions = revise,postpone,paraf,reject`, `documentVersion = 1`,
  `currentDocumentHash`, `parafHistory` (kosong), dan `contentHash` pada
  dokumen.
- Tabel `riwayat_paraf`, `penugasan_plt`, kolom `hash_konten`, serta kolom
  keputusan Camat pada `permohonan_kgb` sudah ada.
- Backfill `approvedAt` untuk KGB lama berjalan; contoh `KGB-2026-0001`
  memiliki `approvedAt`.

UAT tulis (paraf/approve/return/reject) belum dijalankan agar data produksi
tidak berubah. Jalankan skenario UAT minimal di environment uji setelah
frontend siap.
