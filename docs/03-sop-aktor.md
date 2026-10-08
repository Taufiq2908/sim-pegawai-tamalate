# SOP — Peta Aktor & Aturan Routing (keputusan desain, wajib dibaca sebelum ubah workflow)

> Sumber: SOP Pengendalian Surat Masuk + SOP Permohonan Cuti Kecamatan Tamalate.
> Prinsip: **satu SOP = workflow berisi banyak task; tiap task punya pelaksana sendiri.**
> Pegawai = pemohon pada tahapnya saja. Staf kepegawaian = operator yang mengawal.
> Atasan = pertimbangan. Kasubag = pemeriksa. Pejabat penentu = approver pada
> tahapnya saja. BKPSDM = pihak eksternal. Caraka fisik = di luar scope website.

## 1. Aktor → role sistem (5 role)

| Aktor SOP | Role | Position | Wewenang sistem |
|---|---|---|---|
| Pegawai/Staf biasa | EMPLOYEE | STAF/dll | mengajukan + upload berkas miliknya |
| Staf Kepegawaian/Arsip (operator) | VERIFIER | STAF_KEPEGAWAIAN/ARSIP | input, catat, distribusi, arsip, registrasi, terima hasil (tanpa hak memutuskan) |
| Atasan langsung (Kasi, Lurah, Seklur) | SUPERVISOR | KASI/LURAH/... | pertimbangan (`leave.review`, `kgb.review`) |
| Kasubag Umum & Kepegawaian | SUPERVISOR + GRANT | KASUBAG | atasan + verifikasi berkas + teruskan (`leave.verify/revise/reject/forward`, `attendance.summary/manage`) |
| Sekcam | LEADER | SEKCAM | memeriksa + paraf |
| Camat | LEADER | CAMAT | disposisi / persetujuan akhir / tanda tangan |
| BKPSDM | — (eksternal) | — | hanya dicatat statusnya, tanpa akun |
| Sekda | — (eksternal) | — | persetujuan cuti Camat, tanpa akun |

Prinsip: role dasar minimal, penambahan via GRANT per jabatan.
Lupa GRANT = tidak bisa kerja (kelihatan, aman); lupa DENY = kelebihan akses
(tak kelihatan, berbahaya). Akun demo: `verifier1` (operator), `kasi1` (atasan
murni), `kasubag1` (pemeriksa), `sekcam1`, `camat1`, `pegawai1` (kecamatan),
`pegawai2` (kelurahan).

## 2. Routing persetujuan cuti menurut jabatan pemohon

```text
IF pemohon = CAMAT   → administrasi kecamatan → SEKDA (Camat tidak pernah memproses sendiri)
ELSE IF pemohon = SEKCAM/LURAH → administrasi → CAMAT (langsung, tanpa REVIEWED dan tanpa paraf Sekcam)
ELSE IF pemohon = kelurahan → Kasubag verifikasi langsung (sementara, mapping final B3 belum ditentukan)
ELSE                  → Atasan (REVIEWED) → Kasubag (VERIFIED) → Sekcam (PARAF) → Camat (APPROVED) → BKPSDM
```

Status backend saat ini: rantai di atas + cabang `FORWARDED` (Camat→Sekda) +
self-guard 403 + guard atasan-langsung (review/revisi/tolak saat SUBMITTED hanya
oleh `supervisor.direct`, kecuali pemohon yang melewati REVIEWED).

## 3. Asal pengajuan: kecamatan vs kelurahan

Pegawai kelurahan: mengajukan + kumpulkan berkas + tanda tangan lurah, lalu
Kecamatan yang meneruskan ke BKPSDM. Backend: asal = `employees.orgUnit`
(kecamatan + 11 kelurahan di-seed). Aturan: ekor BKPSDMD
(register/tobkpsdm/receiveresult/archive) hanya oleh user `orgUnit = KEC-TAMALATE`.

## 4. Dua jenis workflow (jangan disamakan)

- Persuratan: Terima → Catat → Paraf Sekcam → Disposisi Camat → Distribusi → Arsip.
- Kepegawaian: Pengajuan → Pertimbangan atasan → Verifikasi Kasubag → Paraf Sekcam →
  Persetujuan Camat → Registrasi → BKPSDM → Hasil → Serahkan ke pegawai → Arsip.

## 5. Backlog turunan

1. ~~Tahap eksternal BKPSDM pada cuti~~ SELESAI (SIGNED → REGISTERED → SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED, hanya staf kecamatan).
2. ~~Lompat-paraf untuk pemohon Sekcam~~ SELESAI (approve langsung dari VERIFIED khusus position SEKCAM; juga tanpa REVIEWED).
3. ~~Split permission staf-operator vs Kasubag~~ SELESAI (role SUPERVISOR + KASUBAG_GRANTS; akun `kasi1`/`kasubag1`).
4. Filter/scope asal kecamatan vs kelurahan di daftar pengajuan.
5. Terapkan pola aktor-task yang sama saat membangun KGB/pangkat/pensiun lanjutan.
6. Rantai kelurahan lengkap (Kasi/Seklur/Lurah + mapping final B3).
