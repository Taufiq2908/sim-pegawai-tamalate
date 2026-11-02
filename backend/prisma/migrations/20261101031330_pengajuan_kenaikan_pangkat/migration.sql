-- AlterTable
ALTER TABLE "disposisi_surat" RENAME CONSTRAINT "letter_dispositions_pkey" TO "disposisi_surat_pkey";

-- AlterTable
ALTER TABLE "dokumen_cuti" RENAME CONSTRAINT "leave_documents_pkey" TO "dokumen_cuti_pkey";

-- AlterTable
ALTER TABLE "dokumen_kgb" RENAME CONSTRAINT "kgb_documents_pkey" TO "dokumen_kgb_pkey";

-- AlterTable
ALTER TABLE "dokumen_surat_keluar" RENAME CONSTRAINT "outgoing_documents_pkey" TO "dokumen_surat_keluar_pkey";

-- AlterTable
ALTER TABLE "dokumen_surat_masuk" RENAME CONSTRAINT "letter_documents_pkey" TO "dokumen_surat_masuk_pkey";

-- AlterTable
ALTER TABLE "foto_apel" RENAME CONSTRAINT "attendance_session_photos_pkey" TO "foto_apel_pkey";

-- AlterTable
ALTER TABLE "izin" RENAME CONSTRAINT "permissions_pkey" TO "izin_pkey";

-- AlterTable
ALTER TABLE "jenis_cuti" RENAME CONSTRAINT "leave_types_pkey" TO "jenis_cuti_pkey";

-- AlterTable
ALTER TABLE "klasifikasi_arsip" RENAME CONSTRAINT "archive_classifications_pkey" TO "klasifikasi_arsip_pkey";

-- AlterTable
ALTER TABLE "kunci_presensi" RENAME CONSTRAINT "attendance_locks_pkey" TO "kunci_presensi_pkey";

-- AlterTable
ALTER TABLE "notifikasi" RENAME CONSTRAINT "notifications_pkey" TO "notifikasi_pkey";

-- AlterTable
ALTER TABLE "pegawai" ADD COLUMN     "tmt_pangkat_terakhir" DATE;
ALTER TABLE "pegawai" RENAME CONSTRAINT "employees_pkey" TO "pegawai_pkey";

-- AlterTable
ALTER TABLE "pengguna" RENAME CONSTRAINT "users_pkey" TO "pengguna_pkey";

-- AlterTable
ALTER TABLE "pengguna_izin_override" RENAME CONSTRAINT "user_permission_overrides_pkey" TO "pengguna_izin_override_pkey";

-- AlterTable
ALTER TABLE "peran" RENAME CONSTRAINT "roles_pkey" TO "peran_pkey";

-- AlterTable
ALTER TABLE "peran_izin" RENAME CONSTRAINT "role_permissions_pkey" TO "peran_izin_pkey";

-- AlterTable
ALTER TABLE "permohonan_cuti" RENAME CONSTRAINT "leave_requests_pkey" TO "permohonan_cuti_pkey";

-- AlterTable
ALTER TABLE "permohonan_kgb" RENAME CONSTRAINT "kgb_requests_pkey" TO "permohonan_kgb_pkey";

-- AlterTable
ALTER TABLE "persetujuan_cuti" RENAME CONSTRAINT "leave_approvals_pkey" TO "persetujuan_cuti_pkey";

-- AlterTable
ALTER TABLE "persetujuan_kgb" RENAME CONSTRAINT "kgb_approvals_pkey" TO "persetujuan_kgb_pkey";

-- AlterTable
ALTER TABLE "presensi" RENAME CONSTRAINT "attendances_pkey" TO "presensi_pkey";

-- AlterTable
ALTER TABLE "surat_keluar" RENAME CONSTRAINT "outgoing_letters_pkey" TO "surat_keluar_pkey";

-- AlterTable
ALTER TABLE "surat_masuk" RENAME CONSTRAINT "incoming_letters_pkey" TO "surat_masuk_pkey";

-- AlterTable
ALTER TABLE "surat_teguran" RENAME CONSTRAINT "warning_letters_pkey" TO "surat_teguran_pkey";

-- AlterTable
ALTER TABLE "tanda_terima_ekspedisi" RENAME CONSTRAINT "expedition_receipts_pkey" TO "tanda_terima_ekspedisi_pkey";

-- AlterTable
ALTER TABLE "tujuan_disposisi" RENAME CONSTRAINT "disposition_targets_pkey" TO "tujuan_disposisi_pkey";

-- AlterTable
ALTER TABLE "unit_organisasi" RENAME CONSTRAINT "organizational_units_pkey" TO "unit_organisasi_pkey";

-- AlterTable
ALTER TABLE "urutan_penomoran" RENAME CONSTRAINT "numbering_sequences_pkey" TO "urutan_penomoran_pkey";

-- CreateTable
CREATE TABLE "usulan_kenaikan_pangkat" (
    "id" UUID NOT NULL,
    "nomor_usulan" VARCHAR(50) NOT NULL,
    "tahun_usulan" INTEGER NOT NULL,
    "bulan_usulan" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "peran_pemegang_saat_ini" VARCHAR(20),
    "catatan" TEXT,
    "catatan_legalisasi" TEXT,
    "nomor_stempel" VARCHAR(100),
    "catatan_verifikasi" TEXT,
    "catatan_paraf" TEXT,
    "catatan_persetujuan" TEXT,
    "catatan_revisi" TEXT,
    "alasan_penolakan" TEXT,
    "id_surat_keluar" UUID,
    "nomor_surat_keluar" VARCHAR(150),
    "tanggal_surat_keluar" DATE,
    "nomor_agenda" VARCHAR(50),
    "dilegalisasi_pada" TIMESTAMPTZ,
    "diverifikasi_pada" TIMESTAMPTZ,
    "diparaf_pada" TIMESTAMPTZ,
    "disetujui_pada" TIMESTAMPTZ,
    "diregistrasi_pada" TIMESTAMPTZ,
    "dikirim_pada" TIMESTAMPTZ,
    "diarsipkan_pada" TIMESTAMPTZ,
    "dibuat_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usulan_kenaikan_pangkat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_usulan_kenaikan_pangkat" (
    "id" UUID NOT NULL,
    "id_usulan" UUID NOT NULL,
    "id_pegawai" UUID NOT NULL,
    "nama_pegawai" VARCHAR(150) NOT NULL,
    "nip" VARCHAR(30),
    "nomor_pegawai" VARCHAR(30) NOT NULL,
    "golongan_saat_ini" VARCHAR(20),
    "tmt_pangkat_saat_ini" DATE,
    "golongan_diusulkan" VARCHAR(20) NOT NULL,
    "tmt_kenaikan_pangkat" DATE NOT NULL,
    "masa_jabatan_tahun" INTEGER,
    "jabatan" VARCHAR(50) NOT NULL,
    "unit_kerja" VARCHAR(150),
    "status_item" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "catatan" TEXT,
    "dilegalisasi_pada" TIMESTAMPTZ,
    "diverifikasi_pada" TIMESTAMPTZ,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "item_usulan_kenaikan_pangkat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumen_usulan_kenaikan_pangkat" (
    "id" UUID NOT NULL,
    "id_item" UUID NOT NULL,
    "tipe_dokumen" VARCHAR(50) NOT NULL,
    "nama_asli" VARCHAR(255) NOT NULL,
    "jalur_simpan" VARCHAR(500) NOT NULL,
    "tipe_mime" VARCHAR(100) NOT NULL,
    "ukuran_byte" INTEGER NOT NULL,
    "diunggah_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumen_usulan_kenaikan_pangkat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persetujuan_usulan_kenaikan_pangkat" (
    "id" UUID NOT NULL,
    "id_usulan" UUID NOT NULL,
    "id_aktor" UUID NOT NULL,
    "peran_aktor" VARCHAR(20) NOT NULL,
    "jabatan_aktor" VARCHAR(50),
    "dari_status" VARCHAR(20) NOT NULL,
    "ke_status" VARCHAR(20) NOT NULL,
    "aksi" VARCHAR(20) NOT NULL,
    "catatan" TEXT,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persetujuan_usulan_kenaikan_pangkat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usulan_kenaikan_pangkat_nomor_usulan_key" ON "usulan_kenaikan_pangkat"("nomor_usulan");

-- CreateIndex
CREATE UNIQUE INDEX "usulan_kenaikan_pangkat_id_surat_keluar_key" ON "usulan_kenaikan_pangkat"("id_surat_keluar");

-- CreateIndex
CREATE INDEX "usulan_kenaikan_pangkat_status_tahun_usulan_idx" ON "usulan_kenaikan_pangkat"("status", "tahun_usulan");

-- CreateIndex
CREATE INDEX "item_usulan_kenaikan_pangkat_id_pegawai_status_item_idx" ON "item_usulan_kenaikan_pangkat"("id_pegawai", "status_item");

-- CreateIndex
CREATE UNIQUE INDEX "item_usulan_kenaikan_pangkat_id_usulan_id_pegawai_key" ON "item_usulan_kenaikan_pangkat"("id_usulan", "id_pegawai");

-- CreateIndex
CREATE INDEX "dokumen_usulan_kenaikan_pangkat_id_item_tipe_dokumen_idx" ON "dokumen_usulan_kenaikan_pangkat"("id_item", "tipe_dokumen");

-- CreateIndex
CREATE INDEX "persetujuan_usulan_kenaikan_pangkat_id_usulan_idx" ON "persetujuan_usulan_kenaikan_pangkat"("id_usulan");

-- RenameForeignKey
ALTER TABLE "disposisi_surat" RENAME CONSTRAINT "letter_dispositions_from_user_id_fkey" TO "disposisi_surat_id_pengirim_fkey";

-- RenameForeignKey
ALTER TABLE "disposisi_surat" RENAME CONSTRAINT "letter_dispositions_letter_id_fkey" TO "disposisi_surat_id_surat_fkey";

-- RenameForeignKey
ALTER TABLE "disposisi_surat" RENAME CONSTRAINT "letter_dispositions_to_user_id_fkey" TO "disposisi_surat_id_penerima_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_cuti" RENAME CONSTRAINT "leave_documents_leave_request_id_fkey" TO "dokumen_cuti_id_permohonan_cuti_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_cuti" RENAME CONSTRAINT "leave_documents_uploaded_by_fkey" TO "dokumen_cuti_diunggah_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_kgb" RENAME CONSTRAINT "kgb_documents_kgb_request_id_fkey" TO "dokumen_kgb_id_permohonan_kgb_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_kgb" RENAME CONSTRAINT "kgb_documents_uploaded_by_fkey" TO "dokumen_kgb_diunggah_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_surat_keluar" RENAME CONSTRAINT "outgoing_documents_letter_id_fkey" TO "dokumen_surat_keluar_id_surat_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_surat_keluar" RENAME CONSTRAINT "outgoing_documents_uploaded_by_fkey" TO "dokumen_surat_keluar_diunggah_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_surat_masuk" RENAME CONSTRAINT "letter_documents_letter_id_fkey" TO "dokumen_surat_masuk_id_surat_fkey";

-- RenameForeignKey
ALTER TABLE "dokumen_surat_masuk" RENAME CONSTRAINT "letter_documents_uploaded_by_fkey" TO "dokumen_surat_masuk_diunggah_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "foto_apel" RENAME CONSTRAINT "attendance_session_photos_uploaded_by_fkey" TO "foto_apel_diunggah_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "notifikasi" RENAME CONSTRAINT "notifications_user_id_fkey" TO "notifikasi_id_pengguna_fkey";

-- RenameForeignKey
ALTER TABLE "pegawai" RENAME CONSTRAINT "employees_org_unit_id_fkey" TO "pegawai_id_unit_fkey";

-- RenameForeignKey
ALTER TABLE "pengguna" RENAME CONSTRAINT "users_employee_id_fkey" TO "pengguna_id_pegawai_fkey";

-- RenameForeignKey
ALTER TABLE "pengguna" RENAME CONSTRAINT "users_org_unit_id_fkey" TO "pengguna_id_unit_fkey";

-- RenameForeignKey
ALTER TABLE "pengguna_izin_override" RENAME CONSTRAINT "user_permission_overrides_permission_id_fkey" TO "pengguna_izin_override_id_izin_fkey";

-- RenameForeignKey
ALTER TABLE "pengguna_izin_override" RENAME CONSTRAINT "user_permission_overrides_user_id_fkey" TO "pengguna_izin_override_id_pengguna_fkey";

-- RenameForeignKey
ALTER TABLE "peran_izin" RENAME CONSTRAINT "role_permissions_permission_id_fkey" TO "peran_izin_id_izin_fkey";

-- RenameForeignKey
ALTER TABLE "peran_izin" RENAME CONSTRAINT "role_permissions_role_id_fkey" TO "peran_izin_id_peran_fkey";

-- RenameForeignKey
ALTER TABLE "permohonan_cuti" RENAME CONSTRAINT "leave_requests_created_by_fkey" TO "permohonan_cuti_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "permohonan_cuti" RENAME CONSTRAINT "leave_requests_employee_id_fkey" TO "permohonan_cuti_id_pegawai_fkey";

-- RenameForeignKey
ALTER TABLE "permohonan_cuti" RENAME CONSTRAINT "leave_requests_leave_type_id_fkey" TO "permohonan_cuti_id_jenis_cuti_fkey";

-- RenameForeignKey
ALTER TABLE "permohonan_kgb" RENAME CONSTRAINT "kgb_requests_created_by_fkey" TO "permohonan_kgb_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "permohonan_kgb" RENAME CONSTRAINT "kgb_requests_employee_id_fkey" TO "permohonan_kgb_id_pegawai_fkey";

-- RenameForeignKey
ALTER TABLE "persetujuan_cuti" RENAME CONSTRAINT "leave_approvals_actor_user_id_fkey" TO "persetujuan_cuti_id_aktor_fkey";

-- RenameForeignKey
ALTER TABLE "persetujuan_cuti" RENAME CONSTRAINT "leave_approvals_leave_request_id_fkey" TO "persetujuan_cuti_id_permohonan_cuti_fkey";

-- RenameForeignKey
ALTER TABLE "persetujuan_kgb" RENAME CONSTRAINT "kgb_approvals_actor_user_id_fkey" TO "persetujuan_kgb_id_aktor_fkey";

-- RenameForeignKey
ALTER TABLE "persetujuan_kgb" RENAME CONSTRAINT "kgb_approvals_kgb_request_id_fkey" TO "persetujuan_kgb_id_permohonan_kgb_fkey";

-- RenameForeignKey
ALTER TABLE "presensi" RENAME CONSTRAINT "attendances_corrected_by_fkey" TO "presensi_dikoreksi_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "presensi" RENAME CONSTRAINT "attendances_employee_id_fkey" TO "presensi_id_pegawai_fkey";

-- RenameForeignKey
ALTER TABLE "presensi" RENAME CONSTRAINT "attendances_recorded_by_fkey" TO "presensi_dicatat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "surat_keluar" RENAME CONSTRAINT "outgoing_letters_classification_id_fkey" TO "surat_keluar_id_klasifikasi_fkey";

-- RenameForeignKey
ALTER TABLE "surat_keluar" RENAME CONSTRAINT "outgoing_letters_created_by_fkey" TO "surat_keluar_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "surat_keluar" RENAME CONSTRAINT "outgoing_letters_reserved_by_fkey" TO "surat_keluar_dipesan_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "surat_masuk" RENAME CONSTRAINT "incoming_letters_classification_id_fkey" TO "surat_masuk_id_klasifikasi_fkey";

-- RenameForeignKey
ALTER TABLE "surat_masuk" RENAME CONSTRAINT "incoming_letters_created_by_fkey" TO "surat_masuk_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "surat_teguran" RENAME CONSTRAINT "warning_letters_created_by_fkey" TO "surat_teguran_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "surat_teguran" RENAME CONSTRAINT "warning_letters_employee_id_fkey" TO "surat_teguran_id_pegawai_fkey";

-- RenameForeignKey
ALTER TABLE "tanda_terima_ekspedisi" RENAME CONSTRAINT "expedition_receipts_created_by_fkey" TO "tanda_terima_ekspedisi_dibuat_oleh_fkey";

-- RenameForeignKey
ALTER TABLE "tanda_terima_ekspedisi" RENAME CONSTRAINT "expedition_receipts_letter_id_fkey" TO "tanda_terima_ekspedisi_id_surat_fkey";

-- RenameForeignKey
ALTER TABLE "unit_organisasi" RENAME CONSTRAINT "organizational_units_parent_id_fkey" TO "unit_organisasi_id_induk_fkey";

-- AddForeignKey
ALTER TABLE "usulan_kenaikan_pangkat" ADD CONSTRAINT "usulan_kenaikan_pangkat_id_surat_keluar_fkey" FOREIGN KEY ("id_surat_keluar") REFERENCES "surat_keluar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usulan_kenaikan_pangkat" ADD CONSTRAINT "usulan_kenaikan_pangkat_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_usulan_kenaikan_pangkat" ADD CONSTRAINT "item_usulan_kenaikan_pangkat_id_usulan_fkey" FOREIGN KEY ("id_usulan") REFERENCES "usulan_kenaikan_pangkat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_usulan_kenaikan_pangkat" ADD CONSTRAINT "item_usulan_kenaikan_pangkat_id_pegawai_fkey" FOREIGN KEY ("id_pegawai") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_usulan_kenaikan_pangkat" ADD CONSTRAINT "dokumen_usulan_kenaikan_pangkat_id_item_fkey" FOREIGN KEY ("id_item") REFERENCES "item_usulan_kenaikan_pangkat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_usulan_kenaikan_pangkat" ADD CONSTRAINT "dokumen_usulan_kenaikan_pangkat_diunggah_oleh_fkey" FOREIGN KEY ("diunggah_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persetujuan_usulan_kenaikan_pangkat" ADD CONSTRAINT "persetujuan_usulan_kenaikan_pangkat_id_usulan_fkey" FOREIGN KEY ("id_usulan") REFERENCES "usulan_kenaikan_pangkat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persetujuan_usulan_kenaikan_pangkat" ADD CONSTRAINT "persetujuan_usulan_kenaikan_pangkat_id_aktor_fkey" FOREIGN KEY ("id_aktor") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "letter_dispositions_letter_id_idx" RENAME TO "disposisi_surat_id_surat_idx";

-- RenameIndex
ALTER INDEX "attendance_session_photos_date_session_key" RENAME TO "foto_apel_tanggal_sesi_key";

-- RenameIndex
ALTER INDEX "permissions_code_key" RENAME TO "izin_kode_key";

-- RenameIndex
ALTER INDEX "leave_types_code_key" RENAME TO "jenis_cuti_kode_key";

-- RenameIndex
ALTER INDEX "archive_classifications_code_key" RENAME TO "klasifikasi_arsip_kode_key";

-- RenameIndex
ALTER INDEX "notifications_user_id_is_read_idx" RENAME TO "notifikasi_id_pengguna_sudah_dibaca_idx";

-- RenameIndex
ALTER INDEX "employees_employee_number_key" RENAME TO "pegawai_nomor_pegawai_key";

-- RenameIndex
ALTER INDEX "employees_nip_key" RENAME TO "pegawai_nip_key";

-- RenameIndex
ALTER INDEX "users_employee_id_key" RENAME TO "pengguna_id_pegawai_key";

-- RenameIndex
ALTER INDEX "users_username_key" RENAME TO "pengguna_nama_pengguna_key";

-- RenameIndex
ALTER INDEX "user_permission_overrides_user_id_permission_id_key" RENAME TO "pengguna_izin_override_id_pengguna_id_izin_key";

-- RenameIndex
ALTER INDEX "roles_code_key" RENAME TO "peran_kode_key";

-- RenameIndex
ALTER INDEX "leave_requests_employee_id_status_idx" RENAME TO "permohonan_cuti_id_pegawai_status_idx";

-- RenameIndex
ALTER INDEX "leave_requests_request_number_key" RENAME TO "permohonan_cuti_nomor_permohonan_key";

-- RenameIndex
ALTER INDEX "kgb_requests_employee_id_status_idx" RENAME TO "permohonan_kgb_id_pegawai_status_idx";

-- RenameIndex
ALTER INDEX "kgb_requests_request_number_key" RENAME TO "permohonan_kgb_nomor_permohonan_key";

-- RenameIndex
ALTER INDEX "leave_approvals_leave_request_id_idx" RENAME TO "persetujuan_cuti_id_permohonan_cuti_idx";

-- RenameIndex
ALTER INDEX "kgb_approvals_kgb_request_id_idx" RENAME TO "persetujuan_kgb_id_permohonan_kgb_idx";

-- RenameIndex
ALTER INDEX "attendances_date_idx" RENAME TO "presensi_tanggal_idx";

-- RenameIndex
ALTER INDEX "attendances_employee_id_date_key" RENAME TO "presensi_id_pegawai_tanggal_key";

-- RenameIndex
ALTER INDEX "outgoing_letters_letter_number_key" RENAME TO "surat_keluar_nomor_surat_key";

-- RenameIndex
ALTER INDEX "outgoing_letters_status_idx" RENAME TO "surat_keluar_status_idx";

-- RenameIndex
ALTER INDEX "outgoing_letters_year_sequence_number_key" RENAME TO "surat_keluar_tahun_nomor_urut_key";

-- RenameIndex
ALTER INDEX "incoming_letters_agenda_number_key" RENAME TO "surat_masuk_nomor_agenda_key";

-- RenameIndex
ALTER INDEX "incoming_letters_status_idx" RENAME TO "surat_masuk_status_idx";

-- RenameIndex
ALTER INDEX "warning_letters_employee_id_week_start_key" RENAME TO "surat_teguran_id_pegawai_awal_minggu_key";

-- RenameIndex
ALTER INDEX "warning_letters_letter_number_key" RENAME TO "surat_teguran_nomor_surat_teguran_key";

-- RenameIndex
ALTER INDEX "expedition_receipts_reg_number_key" RENAME TO "tanda_terima_ekspedisi_nomor_registrasi_key";

-- RenameIndex
ALTER INDEX "disposition_targets_code_key" RENAME TO "tujuan_disposisi_kode_key";

-- RenameIndex
ALTER INDEX "organizational_units_code_key" RENAME TO "unit_organisasi_kode_key";
