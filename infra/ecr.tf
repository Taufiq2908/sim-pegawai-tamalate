# Dua repository image: backend (Node/Express) dan frontend (Next.js).
# Tag = commit SHA dari pipeline. Tag dibuat MUTABLE supaya image uji manual
# (mis. tag "dev") boleh ditimpa tanpa harus menghapus repository.

resource "aws_ecr_repository" "backend" {
  name                 = "simpeg-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "simpeg-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Kebijakan yang sama untuk kedua repo: simpan 5 image terakhir, sisanya dihapus.
locals {
  ecr_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Simpan 5 image terakhir"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy     = local.ecr_lifecycle_policy
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name
  policy     = local.ecr_lifecycle_policy
}
