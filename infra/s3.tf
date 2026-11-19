# Bucket privat untuk berkas dokumen (pengganti Supabase Storage).
# Nama harus unik global; akhiran acak 6 karakter hex menghindari bentrok.

resource "random_id" "suffix" {
  byte_length = 3
}

resource "aws_s3_bucket" "files" {
  bucket = "simpeg-tamalate-${random_id.suffix.hex}"

  # false: bucket yang masih berisi data tidak boleh terhapus tanpa sengaja.
  force_destroy = false
}

# Blokir semua akses publik (bucket + objek).
resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Objek milik akun bucket; ACL tidak dipakai lagi.
resource "aws_s3_bucket_ownership_controls" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versioning: melindungi dari unduhan/hapus yang salah.
resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enkripsi SSE-S3 (tanpa biaya KMS tambahan).
resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    id     = "versi-lama-dan-upload-terbengkalai"
    status = "Enabled"

    # filter kosong = berlaku untuk semua objek.
    filter {}

    # Versi lama (noncurrent) dihapus setelah 30 hari agar biaya tidak menumpuk.
    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    # Bersihkan multipart upload yang gagal.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Backup DB sebelum migrasi (deploy/backup-db.sh): simpan 14 hari.
  # Setiap backup memakai nama ber-timestamp, jadi versi noncurrent hanya
  # muncul bila key yang sama diunggah ulang; tetap dibatasi 1 hari.
  rule {
    id     = "backup-db-14-hari"
    status = "Enabled"

    filter {
      prefix = "_backup/"
    }

    expiration {
      days = 14
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Berkas sementara migrasi data (T5): 1 hari.
  rule {
    id     = "migrate-sementara-1-hari"
    status = "Enabled"

    filter {
      prefix = "_migrate/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # ExpiredObjectDeleteMarker tidak boleh digabung dengan Days dalam satu blok,
  # jadi dipisah ke rule sendiri (filter sama).
  rule {
    id     = "migrate-hapus-delete-marker"
    status = "Enabled"

    filter {
      prefix = "_migrate/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  # Objek uji check.sh (s3-healthcheck + storage-runtime): 1 hari.
  rule {
    id     = "healthcheck-sementara-1-hari"
    status = "Enabled"

    filter {
      prefix = "_healthcheck/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "healthcheck-hapus-delete-marker"
    status = "Enabled"

    filter {
      prefix = "_healthcheck/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Tolak semua permintaan non-TLS ke bucket dan objeknya.
data "aws_iam_policy_document" "files_tls_only" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.files.arn,
      "${aws_s3_bucket.files.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "files" {
  bucket = aws_s3_bucket.files.id
  policy = data.aws_iam_policy_document.files_tls_only.json
}
