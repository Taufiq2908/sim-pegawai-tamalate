# Pemantauan dan perlindungan data: SNS untuk notifikasi, alarm CloudWatch,
# snapshot EBS harian (DLM), serta CloudTrail/Budgets yang opsional.

# ---------- Notifikasi ----------

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

# AWS mengirim email konfirmasi; alarm baru efektif setelah tautan diklik.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---------- Alarm EC2 ----------

resource "aws_cloudwatch_metric_alarm" "ec2_cpu_high" {
  alarm_name          = "${local.name_prefix}-ec2-cpu-tinggi"
  alarm_description   = "Rata-rata CPU EC2 di atas 80% selama 15 menit."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  evaluation_periods  = 1
  period              = 900
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# t4g.small dengan cpu_credits=standard bisa kehabisan kredit dan melambat.
resource "aws_cloudwatch_metric_alarm" "ec2_cpu_credit_low" {
  alarm_name          = "${local.name_prefix}-ec2-kredit-cpu-rendah"
  alarm_description   = "Saldo kredit CPU EC2 di bawah 30; instance akan melambat."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  comparison_operator = "LessThanThreshold"
  threshold           = 30
  evaluation_periods  = 1
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ec2_status_check" {
  alarm_name          = "${local.name_prefix}-ec2-status-check-gagal"
  alarm_description   = "Pemeriksaan status EC2 gagal (instance atau sistem bermasalah)."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 2
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.app.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ---------- Alarm RDS ----------

# 4 GiB dalam byte; peringatan dini sebelum disk database penuh.
resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  count = var.use_rds ? 1 : 0

  alarm_name          = "${local.name_prefix}-rds-disk-menipis"
  alarm_description   = "Sisa ruang disk RDS kurang dari 4 GiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  comparison_operator = "LessThanThreshold"
  threshold           = 4294967296
  evaluation_periods  = 1
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main[0].identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ---------- Snapshot EBS harian (DLM) ----------

resource "aws_iam_role" "dlm" {
  name        = "${local.name_prefix}-dlm-role"
  description = "Role layanan DLM untuk snapshot volume EC2"

  # Path default "/" (bukan "role/managed/*" yang diproteksi kebijakan akun).
  path = "/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "dlm.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# Policy terkelola AWS: izin standar DLM (CreateSnapshot, Describe, Delete).
resource "aws_iam_role_policy_attachment" "dlm_service" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "daily_volume_snapshot" {
  # DLM hanya menerima huruf, angka, spasi, garis bawah, dan strip.
  description        = "Snapshot harian volume EC2 dengan tag Backup daily"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]

    target_tags = {
      Backup = "daily"
    }

    schedule {
      name = "harian-0300-wita"

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        # 19:00 UTC = 03:00 WITA (subuh, trafik paling rendah).
        times = ["19:00"]
      }

      # Simpan 7 snapshot terakhir (± 1 minggu riwayat).
      retain_rule {
        count = 7
      }

      copy_tags = true

      tags_to_add = {
        SnapshotType = "dlm-daily"
      }
    }
  }
}

# ---------- CloudTrail (opsional) ----------

# Event history 90 hari sudah tersedia gratis di konsol. Trail ke S3 hanya
# dibuat bila enable_cloudtrail=true karena menambah bucket dan biaya penyimpanan.
resource "aws_s3_bucket" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket        = "simpeg-tamalate-trail-${random_id.suffix.hex}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enkripsi SSE-S3 untuk bucket log (tanpa biaya KMS).
resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Log hanya disimpan 90 hari (sama dengan retensi Event history gratis).
resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    id     = "hapus-log-setelah-90-hari"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }
  }
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  count = var.enable_cloudtrail ? 1 : 0

  statement {
    sid       = "CloudTrailAclCheck"
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail[0].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-trail"]
    }
  }

  statement {
    sid       = "CloudTrailWriteLogs"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-trail"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id
  policy = data.aws_iam_policy_document.cloudtrail_bucket[0].json
}

resource "aws_cloudtrail" "main" {
  count = var.enable_cloudtrail ? 1 : 0

  name                          = "${local.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  include_global_service_events = true
  is_multi_region_trail         = false
  enable_log_file_validation    = true

  # Hanya management events (CreateBucket, RunInstances, dsb).
  # Data events (S3 object-level, Lambda) sengaja TIDAK dipakai karena berbayar.
  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# ---------- AWS Budgets (opsional) ----------

# Budgets tidak memengaruhi billing; hanya mengirim peringatan email.
# Bila akun free plan menolak, jalankan apply tanpa ini lalu buat manual.
#
# Catatan: kredit AWS ($100) membuat tagihan BERSIH selalu $0, jadi budget
# memakai cost_types dengan include_credit = false agar yang diukur adalah
# pemakaian kotor (tanpa kredit/diskon/refund).
resource "aws_budgets_budget" "monthly" {
  count = var.enable_budgets ? 1 : 0

  name         = "simpeg-100"
  budget_type  = "COST"
  limit_amount = "100"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit   = false
    include_discount = false
    include_refund   = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 30
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 55
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
