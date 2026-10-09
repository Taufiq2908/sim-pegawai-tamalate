# Kebutuhan backend — alur surat cuti & SOP (frontend tidak bisa jalan tanpa ini)

> Konteks: SOP 8 langkah + formulir resmi. Langkah 1–4 sudah di sistem,
> surat pengantar di-generate frontend, langkah 5–9 butuh dukungan backend di bawah.

## B1. Upload surat jawaban BKPSDM (WAJIB, penghambat alur)
`POST /leave-requests/:id/documents` saat ini 409 kecuali DRAFT/REVISION.
Pelaksana harus bisa melampirkan surat jawaban pada status APPROVED/SIGNED.
Usulan: izinkan `docType=SURAT_JAWABAN_BKPSDM` untuk role pelaksana
(`leave.document.upload`) pada status APPROVED/SIGNED, atau endpoint khusus:
```text
POST /leave-requests/:id/answer-letter (multipart file, docType otomatis)
  → 201 dokumen, status tetap (SIGNED via action sign terpisah)
```

## B2. Master pegawai lengkap (ditunggu dari tim backend)
Frontend butuh field ini untuk mengisi surat resmi otomatis:
- `joinDate` (menghitung Masa Kerja) — tampilkan juga di `GET /auth/me.employee`.
- Rantai atasan langsung per pegawai (lihat B3).
- Nama + NIP + pangkat pejabat aktif (khususnya Camat penandatangan) — saat ini
  frontend hardcode dari formulir, harus dari data.

## B3. Resolusi atasan langsung (aturan kecamatan, dari user)
- Staf Subbag Umum → Kasubag Umum & Kepegawaian.
- Staf Seksi → Kasi seksi tersebut.
- Kasi/Kasubag → Sekcam. Sekcam/Lurah → Camat. Camat → Sekda (di luar sistem).
- Kebutuhan API (salah satu):
```text
GET /employees/:id/supervisor → { direct: {...}, authorized: {...} }
```
atau sertakan `supervisor` di detail cuti. Frontend hanya menampilkan, tidak meng-hardcode.

## B4. Alur: atasan-dulu vs verifikator-dulu (PERLU KEPUTUSAN)
Usulan user: atasan langsung memberi pertimbangan DULU, baru Kasubag/verifikator
memeriksa. Backend saat ini: SUBMITTED→VERIFIED (verifikator) dulu.
Opsi: (a) tambah transisi `SUBMITTED→REVIEWED (atasan, perm baru mis. leave.review-supervisor)`
sebelum VERIFIED; (b) anggap pemeriksaan Kasubag sudah mencakup persetujuan atasan.
Jangan dua-duanya setengah. Frontend mengikuti `availableActions`, jadi siap dua-duanya.

## B5. Keputusan 4 opsi vs aksi biner
Formulir: DISETUJUI/PERUBAHAN/DITANGGUHKAN/TIDAK DISETUJUI.
Backend: approve≈DISETUJUI, revise≈PERUBAHAN, reject≈TIDAK DISETUJUI,
**DITANGGUHKAN tidak ada** (perlu transisi `postpone` bila wajib),
alasan wajib untuk tolak/ubah (backend: baru revise/reject; forward sudah wajib note).

## B6. Riwayat & saldo cuti
Frontend butuh (read-only, untuk section V surat + halaman riwayat):
```text
GET /employees/:id/leave-history?year= → [{ year, type, days, status }]
GET /employees/:id/leave-balance?year= → { entitlement, used, remaining }
```
Hak/carry-over/pembulatan = aturan backend, frontend tidak mengarang.

## B7. Jenis cuti kurang
Seed 2 kode: `BESAR` (Cuti Besar) dan `DILUAR_TANGGUNGAN` (Cuti Di Luar Tanggungan Negara).

## B8. Notifikasi cuti
Backend belum membuat notifikasi untuk alur cuti (baru disposisi surat).
Setiap transisi cuti harus notifikasi ke pemegang tahap berikut
(pemohon, verifikator, atasan, sekcam, camat, pelaksana).

## B9. Aset & tanda tangan
- Logo kop: file dari kecamatan, disimpan `frontend/public/logo-tamalate.png`
  (frontend, karena surat di-render frontend). Belum diterima.
- Tanda tangan: **diputuskan TTD elektronik buatan sendiri, dummy dulu.**
  Implementasi frontend (sudah jalan): papan gambar di halaman surat →
  PNG tersimpan di localStorage per username → tampil di blok VII/VIII
  penandatangan yang aksinya dilakukan akun tersebut + caption waktu.
  Keterbatasan jujur: hanya di browser itu, tidak terbukti, bukan TTE —
  untuk demo/simulasi. Produksi tetap butuh B11 (aset server + verifikasi).

## Catatan e-signature (untuk keputusan)
- Teknis bisa: gambar tangan (canvas) atau TTE tersertifikasi (BSrE/Kominfo).
- Regulasi (UU ITE + PP 71/2019): yang setara tanda tangan basah hanya **TTE
  tersertifikasi**. Coretan digital di web BUKAN TTE dan tidak setara secara hukum.
- Surat ke BKPSDM/Wali Kota hampir pasti butuh basah atau TTE BSrE.
  Integrasi BSrE = berat (sertifikat per pejabat, pihak ketiga).
- Rekomendasi: fase 1 basah. Klaim "e-signature" tanpa BSrE berisiko menyesatkan.

## B10. Role: SUPERVISOR baru + Kasubag dibedakan dari atasan
Keputusan awal "4 role + override" tidak lagi cukup. Menyamakan Kasi/Kasubag
dengan Camat dalam role LEADER hanya aman selama DENY per orang tidak ada yang
lupa — itu rapuh dan melanggar least-privilege.

Rantai yang disepakati: Pegawai → Atasan Langsung (pertimbangan) →
Kasubag (verifikasi + setuju + teruskan) → Sekcam (paraf) → Camat (keputusan).
Kasubag lebih dari atasan (ikut memeriksa berkas + memutuskan verifikasi),
tapi bukan pimpinan penentu. Karena itu:

- `VERIFIER` tetap (kode tidak diganti agar tidak breaking), dimurnikan sebagai
  **Operator/Pelaksana** (staf umum & kepegawaian): terima, catat, upload,
  input presensi, ekspedisi, registrasi, arsip. **Tanpa** verify/revise/reject.
- `SUPERVISOR` baru untuk **atasan langsung** (Kasi, Lurah, Seklur):
  lihat + `leave.review`/`kgb.review` (pertimbangan, B4). Tanpa verify,
  approve, sign, dispose, complete, manage.
- **Kasubag = SUPERVISOR + GRANT** `leave.verify, leave.revise, leave.reject`
  (dan KGB setara) + `attendance.summary`. Prinsip: role dasar minimal,
  penambahan via GRANT per jabatan. Lupa GRANT = tidak bisa kerja (kelihatan,
  aman); lupa DENY = kelebihan akses (tak kelihatan, berbahaya).
- `LEADER` dikembalikan ke pimpinan penentu (Camat, Sekcam; Lurah/Seklur untuk
  konteks kelurahan): paraf/approve/sign/dispose/complete/forward.
- `EMPLOYEE` dan `SUPER_ADMIN` tidak berubah.
- Konsekuensi demo: `verifier1` saat ini memegang verify — putuskan apakah ia
  dijadikan Kasubag atau verify dipindah ke akun `kasubag1` baru; akun `kasi1`
  (SUPERVISOR murni) perlu dibuat untuk uji alur atasan.
- Frontend tidak perlu perubahan struktural (permission-driven); hanya label tampilan.

## B11. Persetujuan digital di surat (bukan TTE tersertifikasi)
Alur target: setiap klik Setuju/Paraf merender nama+NIP+jabatan+waktu
persetujuan ke blok surat (VII atasan, VIII camat). Syarat backend:
- Setiap aksi approval menyimpan snapshot signer (nama, NIP, jabatan, waktu)
  yang bisa dibaca frontend — saat ini timeline hanya punya username.
- Aset tanda tangan/paraf per pejabat (upload master) + endpoint verifikasi
  bila mau QR-code (mis. `GET /verify/:code`).
- Istilah UI: pakai **"persetujuan digital"**, bukan "TTE" — TTE tersertifikasi
  (BSrE) adalah hal berbeda dan belum tersedia. Surat fase 1 tetap dicetak
  lalu ditandatangani basah; blok digital bersifat catatan persetujuan.

## Status implementasi (backend, 2026-10-08 — semua lolos e2e)

- B1: `POST /leave-requests/:id/answer-letter` (docType `SURAT_JAWABAN_BKPSDM`,
  APPROVED/REGISTERED/SUBMITTED_BKPSDMD, oleh pelaksana); `receiveresult` 422
  bila belum ada jawaban. Status SIGNED dihapus dari rantai (baris lama dimigrasi).
- B2: `joinDate` (+position/rank/orgUnit) di `/auth/me.employee`; nama+NIP+
  pangkat pejabat via resolver B3 (Camat/Sekcam/Kasubag/Kasi aktif).
- B3: `GET /employees/:id/supervisor` + field `supervisor` di detail cuti.
- B4: dipilih opsi (a) atasan-dulu — `SUBMITTED→REVIEWED (leave.review)` wajib
  sebelum `VERIFIED`, kecuali pemohon Camat/Sekcam/Lurah/kelurahan (tercatat).
- B5: `postpone` → POSTPONED (note wajib), ajukan ulang via `submit`.
- B6: `GET /employees/:id/leave-history` + `/leave-balance` (aturan saldo v1
  di kontrak `02` §3a).
- B7: `BESAR` + `DILUAR_TANGGUNGAN` di-seed (kode lama `LUAR_TANGGUNGAN` dikoreksi).
- B8: notifikasi tipe `LEAVE` tiap transisi (pemegang tahap berikut + pemohon).
- B10: role `SUPERVISOR` baru; Kasubag = `SUPERVISOR` + GRANT; akun `kasi1`
  (atasan murni) + `kasubag1` (pemeriksa); `verifier1` operator murni.
- B11: kolom `actor_name/actor_nip` di `leave_approvals`; timeline menyertakan
  keduanya. Aset paraf + QR ditunda (fase 1 basah).
