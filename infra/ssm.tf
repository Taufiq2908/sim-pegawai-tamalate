# Parameter Store /simpeg/prod/*. Nama parameter = nama variabel env persis,
# supaya deploy/fetch-env.sh cukup mengambil segmen terakhir sebagai key .env.
#
# SecureString memakai kunci terkelola AWS `alias/aws/ssm` (gratis). Tidak ada
# kunci KMS khusus, jadi tidak ada biaya KMS bulanan.

resource "random_password" "db" {
  count = var.use_rds ? 1 : 0

  length = 24
  # Tanpa karakter spesial: aman untuk aturan password RDS dan tidak perlu
  # URL-encoding saat dirangkai menjadi connection string.
  special = false
}

resource "random_password" "jwt_access" {
  length  = 48
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 48
  special = false
}

locals {
  db_host = try(aws_db_instance.main[0].address, "")

  # RDS: tanpa query param (SSL diatur pg lewat DATABASE_SSL + CA file).
  database_url = var.use_rds ? "postgresql://simpeg_admin:${random_password.db[0].result}@${local.db_host}:5432/simpeg" : null

  # Prisma CLI memakai libpq-style; sslmode=require cukup di sini.
  direct_url = local.database_url == null ? null : "${local.database_url}?sslmode=require"

  # Parameter non-rahasia. CORS_ORIGINS dan ALLOW_LOCAL_STORAGE sengaja TIDAK
  # dibuat: production same-origin lewat proxy dan tidak memakai storage lokal.
  # ECR_REGISTRY dipakai interpolasi Compose (bukan dibaca aplikasi).
  # MAX_FILE_BYTES 10 MB: frontend tidak punya validasi ukuran, batas upload
  # surat/outgoing di kode juga 10 MB, dan body Caddy 12 MB.
  ssm_string_params = {
    NODE_ENV              = "production"
    STORAGE_DRIVER        = "s3"
    S3_BUCKET             = aws_s3_bucket.files.bucket
    AWS_REGION            = var.region
    DATABASE_SSL          = "require"
    DATABASE_SSL_CA_FILE  = "/certs/rds-global-bundle.pem"
    TRUST_PROXY           = "1"
    DB_POOL_MAX           = "10"
    APP_DOMAIN            = var.app_domain
    PORT                  = "3000"
    JWT_ACCESS_EXPIRES    = "15m"
    JWT_REFRESH_EXPIRES   = "7d"
    MAX_FILE_BYTES        = "10000000"
    APEL_DEADLINE_TIME    = "08:00"
    CHECKOUT_TIME_WEEKDAY = "16:00"
    CHECKOUT_TIME_FRIDAY  = "16:30"
    LETTER_UNIT_CODE      = "KT"
    PENSION_BUP_AGE       = "58"
    PROMOTION_MIN_YEARS   = "4"
    ECR_REGISTRY          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  }
}

resource "aws_ssm_parameter" "database_url" {
  count = var.use_rds ? 1 : 0

  name  = "/simpeg/prod/DATABASE_URL"
  type  = "SecureString"
  value = local.database_url
}

resource "aws_ssm_parameter" "direct_url" {
  count = var.use_rds ? 1 : 0

  name  = "/simpeg/prod/DIRECT_URL"
  type  = "SecureString"
  value = local.direct_url
}

resource "aws_ssm_parameter" "jwt_access_secret" {
  name  = "/simpeg/prod/JWT_ACCESS_SECRET"
  type  = "SecureString"
  value = random_password.jwt_access.result
}

resource "aws_ssm_parameter" "jwt_refresh_secret" {
  name  = "/simpeg/prod/JWT_REFRESH_SECRET"
  type  = "SecureString"
  value = random_password.jwt_refresh.result
}

resource "aws_ssm_parameter" "string" {
  for_each = local.ssm_string_params

  name  = "/simpeg/prod/${each.key}"
  type  = "String"
  value = each.value
}
