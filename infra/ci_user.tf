# IAM user opsional untuk pipeline deploy (alternatif kredensial jangka panjang).
#
# Default MATI (enable_ci_user = false). Kebijakan akun free plan bertipe project
# menolak iam:*Provider*, jadi provider identitas federasi tidak bisa dibuat sama
# sekali. Kredensial user berupa access key jangka panjang, karena itu:
#   - kunci akses TIDAK dibuat oleh Terraform (nilainya akan tersimpan di state);
#   - Bos membuat access key manual lewat konsol/CLI, lalu menyimpannya sebagai
#     secret di GitHub (lihat infra/README.md bagian 8).
#
# User ini murni untuk API: tanpa login profile konsol, tanpa group, tanpa
# policy terkelola tambahan.

resource "aws_iam_user" "ci" {
  count = var.enable_ci_user ? 1 : 0

  name = "${local.name_prefix}-ci-deployer"

  # Path default "/". Kebijakan akun memproteksi apa pun di path role/managed/*.
  path = "/"
}

data "aws_iam_policy_document" "ci" {
  count = var.enable_ci_user ? 1 : 0

  statement {
    sid       = "EcrAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushBothRepos"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [
      aws_ecr_repository.backend.arn,
      aws_ecr_repository.frontend.arn,
    ]
  }

  # Hanya bundle deploy (skrip + compose + Caddyfile) di prefix _deploy/.
  statement {
    sid     = "S3UploadDeployBundle"
    effect  = "Allow"
    actions = ["s3:PutObject"]

    resources = ["${aws_s3_bucket.files.arn}/_deploy/*"]
  }

  # Hanya dokumen AWS-RunShellScript dan hanya instance aplikasi ini.
  statement {
    sid     = "SsmSendCommand"
    effect  = "Allow"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.name}::document/AWS-RunShellScript",
      "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}",
    ]
  }

  statement {
    sid    = "SsmReadCommandResult"
    effect = "Allow"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "ci" {
  count = var.enable_ci_user ? 1 : 0

  name   = "${local.name_prefix}-ci-deployer-policy"
  user   = aws_iam_user.ci[0].name
  policy = data.aws_iam_policy_document.ci[0].json
}
