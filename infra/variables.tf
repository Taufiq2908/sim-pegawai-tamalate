variable "region" {
  description = "Region AWS untuk semua resource. Dikunci oleh kebijakan akun free plan bertipe project."
  type        = string
  default     = "ap-southeast-2"

  # Kebijakan akun menolak account:EnableRegion untuk region lain, jadi nilai
  # ini bukan sekadar preferensi: region lain akan gagal saat plan/apply.
  validation {
    condition     = var.region == "ap-southeast-2"
    error_message = "Akun free plan bertipe project mengunci region ke ap-southeast-2. Region lain ditolak oleh kebijakan akun (account:EnableRegion), jadi tidak bisa dipakai."
  }
}

variable "az_suffix" {
  description = "Akhiran availability zone di region terpilih (\"a\" berarti <region>a). EC2 dan RDS dibuat di AZ ini."
  type        = string
  default     = "a"
}

variable "instance_type" {
  description = "Tipe EC2. Default t4g.small (ARM64/Graviton) dengan cpu_credits=standard agar biaya terkendali."
  type        = string
  default     = "t4g.small"
}

variable "root_volume_gb" {
  description = "Ukuran disk root EC2 (gp3, terenkripsi)."
  type        = number
  default     = 30
}

variable "use_rds" {
  description = "true = buat RDS PostgreSQL. false = Rencana C (Postgres di container EC2) yang BELUM diimplementasikan."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "Kelas instance RDS. db.t4g.micro adalah pilihan termurah yang mendukung ARM."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Kapasitas awal RDS dalam GB (gp3). Tidak memakai autoscaling agar biaya tidak naik diam-diam."
  type        = number
  default     = 20
}

variable "db_backup_retention_days" {
  description = "Retensi backup otomatis RDS dalam hari. Free plan menolak 7 dan 3 hari dan menerima 1; 0 mematikan backup otomatis."
  type        = number
  default     = 1

  validation {
    condition     = var.db_backup_retention_days >= 0 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days harus antara 0 dan 35."
  }
}

variable "db_deletion_protection" {
  description = "Proteksi penghapusan RDS. Matikan sementara sebelum destroy (lihat infra/README.md)."
  type        = bool
  default     = true
}

variable "enable_ci_user" {
  description = "Buat IAM user untuk pipeline deploy. Default false; kunci akses dibuat manual oleh Bos."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email penerima alarm SNS dan notifikasi budget. AWS mengirim tautan konfirmasi yang harus diklik."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email harus berupa alamat email yang valid."
  }
}

variable "app_domain" {
  description = "Domain publik aplikasi (DuckDNS), tanpa http:// atau https://. Dipakai Caddy dan parameter APP_DOMAIN."
  type        = string

  validation {
    condition     = !startswith(var.app_domain, "http") && length(var.app_domain) > 0
    error_message = "app_domain harus berupa domain saja, contoh: simpeg-tamalate.duckdns.org."
  }
}

variable "enable_cloudtrail" {
  description = "Buat CloudTrail trail ke S3. Default false karena Event history 90 hari sudah tersedia gratis tanpa trail."
  type        = bool
  default     = false
}

variable "enable_budgets" {
  description = "Buat tiga AWS Budget ($30/$55/$80) ke alert_email. Default false; Bos dapat membuatnya manual."
  type        = bool
  default     = false
}
