# Supabase Storage — Dokumen & Foto

Status: aktif untuk backend. Frontend tidak perlu berubah karena download tetap lewat API.

## Bucket

| Properti | Nilai |
| --- | --- |
| Nama | `simpeg_files` |
| Akses | private (tanpa policy publik) |
| Batas file | 10 MB |
| MIME | `application/pdf`, `image/jpeg`, `image/jpg`, `image/png` |
| Akses aplikasi | backend memakai service role key; frontend tidak pernah memegang key ini |

## Environment backend

```dotenv
STORAGE_DRIVER="supabase"          # local | supabase
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role/secret-key>"
SUPABASE_STORAGE_BUCKET="simpeg_files"
```

`SUPABASE_URL` harus URL project Supabase, bukan publishable key. Bila
`STORAGE_DRIVER` tidak diisi, backend memakai `supabase` hanya jika URL dan
service role key tersedia; jika tidak, fallback ke `local`.

## Pola path

`storedPath` pada database menyimpan URI objek:

```text
supabase://simpeg_files/<folder>/<file>
```

Folder yang dipakai:

| Modul | Folder |
| --- | --- |
| Cuti | `leave/<leaveRequestId>` |
| KGB | `kgb/<kgbRequestId>` |
| Foto apel | `attendance/<YYYY-MM-DD>/<PAGI\|SORE>` |
| Surat masuk | `letters/incoming/<letterId>` |
| Surat keluar | `letters/outgoing/<letterId>` |
| Pensiun | `pension/<batchId>/items/<itemId>` |
| Kenaikan pangkat | `promotion/<batchId>/items/<itemId>` |

File lokal lama tetap bisa dibaca oleh backend. Semua download dokumen masih
memakai endpoint API yang sudah ada (Bearer + permission), bukan signed URL
langsung dari browser.

## Migrasi file lama

```powershell
cd backend
npm run storage:migrate
```

Script bersifat idempotent:

- melewati `storedPath` yang sudah berformat `supabase://...`;
- melewati file lokal yang sudah tidak ada dan mencatatnya di ringkasan;
- mengunggah, memverifikasi ukuran objek, lalu memperbarui `storedPath`;
- tidak menghapus file lokal (disimpan sebagai cadangan).

Hasil migrasi terakhir: 112 file berhasil, 9 record lama tidak ditemukan file
lokal/missing (5 cuti, 3 KGB, 1 pensiun). Record yang missing tetap dibiarkan
apa adanya dan download-nya akan mengembalikan `404` sampai file aslinya tersedia.

## Catatan operasional

- Jangan commit service role key ke git.
- Bucket tetap private; jangan menambahkan policy `SELECT` untuk anon.
- Jika mengganti bucket atau MIME, sesuaikan juga filter upload di route backend.
- Untuk rollback sementara, set `STORAGE_DRIVER=local`; upload baru akan kembali
  ke `UPLOAD_DIR`, tetapi objek Supabase yang sudah ada tetap dapat dibaca.
