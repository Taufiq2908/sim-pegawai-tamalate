# IAM untuk EC2: akses SSM (tanpa port 22), baca parameter rahasia, tarik image
# ECR, dan baca/tulis berkas di bucket S3. Prinsip least privilege.

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name_prefix}-ec2-role"
  description        = "Role instance EC2 SIMPEG"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json

  # Path default "/" secara sengaja. Kebijakan akun free plan memproteksi
  # apa pun di path "role/managed/*", jadi jangan memakai path tersebut.
  path = "/"
}

# Policy terkelola AWS: Session Manager, tanpa membuka SSH.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "ec2_inline" {
  # S3: hanya objek di bucket aplikasi, bukan seluruh akun.
  statement {
    sid       = "S3Objects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }

  statement {
    sid       = "S3ListBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.files.arn]
  }

  # ECR: login token memang hanya bisa diminta untuk "*", tetapi aksi layer/image
  # dibatasi ke dua repository milik proyek ini.
  statement {
    sid       = "EcrAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [
      aws_ecr_repository.backend.arn,
      aws_ecr_repository.frontend.arn,
    ]
  }

  # Parameter Store di bawah /simpeg/prod/* saja.
  #
  # kms:Decrypt TIDAK perlu ditambahkan: SecureString dienkripsi dengan kunci
  # terkelola AWS `alias/aws/ssm`, dan kebijakan kunci itu mengizinkan pemanggil
  # di akun yang sama untuk mendekripsi lewat layanan SSM (kms:ViaService).
  statement {
    sid    = "ReadSimpegParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      # GetParametersByPath butuh izin pada path itu sendiri DAN isinya.
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/simpeg/prod",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/simpeg/prod/*",
    ]
  }
}

resource "aws_iam_role_policy" "ec2_inline" {
  name   = "${local.name_prefix}-ec2-least-privilege"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2_inline.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2.name

  # Sama seperti role: path tetap "/", bukan path yang diproteksi kebijakan akun.
  path = "/"
}
