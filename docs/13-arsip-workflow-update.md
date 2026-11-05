# 13 — Pembaruan Alur Arsip Surat (Batch Approval)

Tanggal: 5 November 2026
Status: **diperbarui mengikuti revisi workflow di
`docs/14-surat-workflow-revision.md`; backend dan migration/seed sudah selesai.
Frontend belum diimplementasikan.**

> **Perubahan penting:** keputusan lama “tanpa status baru” dibatalkan.
> Surat masuk sekarang memakai `MENUNGGU_ARSIP`/`DIARSIPKAN`; surat keluar
> memakai `TERKIRIM`/`DIARSIPKAN`. Lihat `docs/14` untuk alur lengkap.

## 1. Antrean arsip

| Sumber | Status antrean | Syarat tambahan |
| --- | --- | --- |
| Surat masuk | `MENUNGGU_ARSIP` | `archiveRecord = null` |
| Surat keluar | `TERKIRIM` | `archiveRecord = null`, `archiveRejectedAt = null` |

Setelah disetujui:

- Surat masuk: status `DIARSIPKAN` + `ArchiveRecord`.
- Surat keluar: status `DIARSIPKAN` + `ArchiveRecord`.

Approver: user aktif posisi `SEKCAM`/`CAMAT` atau `SUPER_ADMIN`.
Approver pertama yang menyetujui menentukan hasil.

## 2. Batch approval

- Surat masuk dan surat keluar dipisah.
- Maksimal **15 surat per request**.
- Partial success: item berhasil di `approved[]`, gagal di `skipped[]`
  beserta alasannya.
- Endpoint:
  - `GET /letters/archive-queue`
  - `POST /letters/archive-approvals/batch`
  - `POST /letters/archive-approvals/reject`
  - `GET /outgoing-letters/archive-queue`
  - `POST /outgoing-letters/archive-approvals/batch`
  - `POST /outgoing-letters/archive-approvals/reject`

## 3. Reject/revisi

- Surat masuk: status kembali ke `PROSES`; disposisi target yang sudah `DONE`
  dibuka kembali menjadi `ACCEPTED` agar penerima bisa menyelesaikan ulang
  (catatan Sekcam yang tersimpan sebagai disposisi ke diri sendiri tidak diubah).
  Penerima mendapat notifikasi `LETTER_REVISION`.
- Surat keluar: status tetap `TERKIRIM`, diberi `archiveRejectedAt` +
  `archiveRejectionNote`. Pembuat surat mendapat notifikasi `ARCHIVE_REJECTED`.
  Staf memperbaiki lalu memanggil
  `POST /outgoing-letters/:id/resubmit-archive`.

## 4. Tidak ada arsip manual

- `POST /archives` dan `GET /archives/candidates` sudah dihapus.
- Semua surat masuk yang selesai dan surat keluar yang diterbitkan otomatis
  masuk dashboard Sekcam/Camat.
- `PATCH /archives/:id` hanya untuk `SUPER_ADMIN`; metadata arsip terkunci
  untuk staf.
- `physicalLocation` (`lokasi_fisik`) opsional untuk hardcopy.

## 5. Notifikasi

Tipe `ARCHIVE_APPROVAL` dikirim ke user aktif posisi `SEKCAM`/`CAMAT` saat:

- surat masuk masuk `MENUNGGU_ARSIP`,
- surat keluar masuk `TERKIRIM`,
- surat keluar diajukan ulang setelah revisi.

Frontend memakai polling/badge refresh; belum ada WebSocket.

## 6. Status implementasi dan verifikasi

Migration `20261105000000_arsip_reject_outgoing` dan
`20261105010000_surat_workflow_revision` sudah diterapkan ke Supabase, dan
`npm run prisma:seed` sudah dijalankan. Permission `archive.approve`/
`archive.reject` aktif untuk `LEADER`.

Untuk environment baru, jalankan:

```bash
cd backend
npx prisma migrate deploy
npm run prisma:seed
```

Uji runtime yang sudah lulus: antrean, batch approve/reject, reject/resubmit
surat keluar, metadata lock, dan notifikasi. UAT UI penuh menunggu frontend
diperbarui ke status/API baru.
