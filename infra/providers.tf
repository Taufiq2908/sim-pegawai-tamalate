terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # State sengaja disimpan lokal (default). File terraform.tfstate dan
  # terraform.tfstate.backup BERISI RAHASIA (password RDS, JWT secret).
  # Jangan di-commit, jangan dibagikan, jangan diunggah ke mana pun.
}

provider "aws" {
  region = var.region

  # Tag ini otomatis menempel ke semua resource yang mendukung tag.
  default_tags {
    tags = {
      Project   = "simpeg"
      ManagedBy = "terraform"
    }
  }
}

# Jangan menulis ID akun atau region secara literal di resource mana pun;
# selalu ambil dari data source berikut.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  # EC2 dan RDS sengaja berada di AZ yang sama agar latensi antar-keduanya kecil.
  availability_zone = "${var.region}${var.az_suffix}"
  name_prefix       = "simpeg"
}
