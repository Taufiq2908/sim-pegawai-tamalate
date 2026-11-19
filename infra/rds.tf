# RDS PostgreSQL 17 (single-AZ, privat, terenkripsi).
# Versi 17 dipilih agar setara dengan sumber Supabase (17.x); 16 tidak bisa
# menerima restore dump 17 secara resmi.
# Seluruh resource di berkas ini kondisional: count = var.use_rds ? 1 : 0.

resource "aws_db_subnet_group" "main" {
  count = var.use_rds ? 1 : 0

  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  # RDS mensyaratkan subnet group mencakup minimal dua AZ, meski instance-nya
  # single-AZ. Pesan ini muncul sebelum AWS menolak permintaan.
  lifecycle {
    precondition {
      condition     = length(local.default_azs) >= 2
      error_message = "DB subnet group butuh subnet di minimal dua AZ; default VPC saat ini hanya punya ${length(local.default_azs)} AZ."
    }
  }
}

resource "aws_db_instance" "main" {
  count = var.use_rds ? 1 : 0

  identifier = "${local.name_prefix}-db"

  engine         = "postgres"
  engine_version = "17" # major saja; minor mengikuti yang tersedia di region
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "simpeg"
  username = "simpeg_admin"
  password = random_password.db[0].result

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  availability_zone      = local.availability_zone
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Tidak pernah dapat diakses dari internet.
  publicly_accessible = false
  multi_az            = false

  # Free plan hanya mengizinkan retensi backup maksimum 1 hari.
  backup_retention_period = var.db_backup_retention_days
  # 18:00-19:00 UTC = 02:00-03:00 WITA (jam paling sepi).
  backup_window      = "18:00-19:00"
  maintenance_window = "sun:19:30-sun:20:30"

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-db-final-${random_id.suffix.hex}"

  # Dimatikan untuk menekan biaya.
  performance_insights_enabled = false
  monitoring_interval          = 0

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  # Upgrade major 16 -> 17 harus diizinkan eksplisit; tanpa ini RDS menolak.
  allow_major_version_upgrade = true
  # Terapkan langsung, bukan menunggu maintenance window. Aman karena instance
  # masih kosong (belum ada data) dan hanya dipakai untuk demo.
  apply_immediately = true
}
