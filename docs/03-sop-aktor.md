# SOP — Peta Aktor & Aturan Routing (keputusan desain, wajib dibaca sebelum ubah workflow)

> Sumber: SOP Pengendalian Surat Masuk + SOP Permohonan Cuti Kecamatan Tamalate.
> Prinsip: **satu SOP = workflow berisi banyak task; tiap task punya pelaksana sendiri.**
> Pegawai = pemohon pada tahapnya saja. Staf kepegawaian = operator yang mengawal.
> Pejabat = approver pada tahapnya saja. BKPSDM = pihak eksternal. Caraka fisik = di luar scope website.

## 1. Aktor → role sistem (tetap 4 role, bedakan via position + permission)

| Aktor SOP | Role | Position | Wewenang sistem |
|---|---|---|---|
| Pegawai/Staf biasa | EMPLOYEE | STAF/dll | mengajukan + upload berkas miliknya |
| Staf Kepegawaian/Arsip (operator) | VERIFIER | STAF_KEPEGAWAIAN/ARSIP | input, catat, distribusi, arsip, registrasi, terima hasil |
| Kasubag Umum & Kepegawaian | VERIFIER | KASUBAG | memeriksa kelengkapan (verify), supervisi |
| Sekcam | LEADER | SEKCAM | memeriksa + paraf |
| Camat | LEADER | CAMAT | disposisi / persetujuan akhir |
| BKPSDM | — (eksternal) | — | hanya dicatat statusnya, tanpa akun |

Tidak ada role baru. Staf vs Kasubag dibedakan cukup via `position` + permission
(mis. staf boleh `letter.create`, kasubag boleh `leave.verify`), sama seperti pola LEADER.

## 2. Routing persetujuan cuti menurut jabatan pemohon

```text
IF pemohon = CAMAT   → administrasi kecamatan → SEKDA (Camat tidak pernah memproses sendiri)
ELSE IF pemohon = SEKCAM → administrasi → CAMAT (langsung, tanpa paraf Sekcam)
ELSE                  → Kasubag → Sekcam → Camat → BKPSDM
```

Status backend saat ini: rantai normal + cabang `FORWARDED` (Camat→Sekda) + self-guard 403.
Belum ada: lompat-paraf untuk pemohon Sekcam; tahap eksternal BKPSDM.

## 3. Asal pengajuan: kecamatan vs kelurahan

Pegawai kelurahan: mengajukan + kumpulkan berkas + tanda tangan lurah, lalu
Kecamatan yang meneruskan ke BKPSDM. Backend: asal = `employees.orgUnit`
(kecamatan vs 11 kelurahan sudah di-seed). Aturan: hanya VERIFIER/STAF kecamatan
yang boleh submit/registrasi ke tahap BKPSDM.

## 4. Dua jenis workflow (jangan disamakan)

- Persuratan: Terima → Catat → Paraf Sekcam → Disposisi Camat → Distribusi → Arsip.
- Kepegawaian: Pengajuan → Verifikasi Kasubag → Paraf Sekcam → Persetujuan Camat →
  Registrasi → BKPSDM → Hasil → Serahkan ke pegawai → Arsip.

## 5. Backlog turunan (belum diimplementasikan)

1. ~~Tahap eksternal BKPSDM pada cuti~~ SELESAI (SIGNED → REGISTERED → SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED, hanya staf kecamatan).
2. ~~Lompat-paraf untuk pemohon Sekcam~~ SELESAI (approve langsung dari VERIFIED khusus position SEKCAM).
3. ~~Split permission staf-operator vs Kasubag~~ SELESAI (kasubag1 + KASUBAG_GRANTS; e2e memakai kasubag1 untuk verify/forward/summary).
4. Filter/scope asal kecamatan vs kelurahan di daftar pengajuan.
5. Terapkan pola aktor-task yang sama saat membangun KGB/pangkat/pensiun lanjutan.
