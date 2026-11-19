# Catatan: seluruh berkas memakai default VPC. Bila akun tidak punya default VPC,
# Terraform akan berhenti di data.aws_vpc.default dengan pesan "no matching VPC".
# Pesan tambahan berbahasa Indonesia disediakan lewat blok `check` di bawah.

data "aws_vpc" "default" {
  default = true
}

# Semua subnet di default VPC. RDS mensyaratkan DB subnet group berisi subnet
# dari minimal dua AZ, walaupun instance RDS-nya single-AZ.
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Detail setiap subnet default (dipakai untuk mengetahui AZ-nya).
data "aws_subnet" "default" {
  for_each = toset(data.aws_subnets.default.ids)

  id = each.value
}

locals {
  # Peta AZ -> daftar ID subnet default (pada default VPC normal: satu per AZ).
  subnet_ids_by_az = {
    for id, subnet in data.aws_subnet.default : subnet.availability_zone => id...
  }

  # Subnet untuk EC2 di AZ terpilih; null bila AZ itu tidak punya subnet default.
  app_subnet_id = try(local.subnet_ids_by_az[local.availability_zone][0], null)

  # AZ unik yang tersedia di default VPC (duplikat dihitung sekali).
  default_azs = distinct([for subnet in data.aws_subnet.default : subnet.availability_zone])
}

# Pemeriksaan yang memberi pesan jelas sebelum resource gagal dengan pesan AWS
# yang teknis. `check` menghasilkan peringatan saat plan/apply.
check "default_vpc_two_azs" {
  assert {
    condition     = length(local.default_azs) >= 2
    error_message = "Default VPC hanya punya subnet di ${length(local.default_azs)} AZ. RDS membutuhkan minimal dua AZ untuk DB subnet group. Tambahkan subnet default di AZ lain atau sediakan VPC sendiri."
  }
}

check "app_az_has_subnet" {
  assert {
    condition     = local.app_subnet_id != null
    error_message = "Tidak ada subnet default di AZ ${local.availability_zone}. Ubah az_suffix (mis. \"b\") atau pastikan default VPC punya subnet di AZ tersebut."
  }
}

# ---------- Security group ----------
# Aturan dibuat sebagai resource terpisah (bukan blok ingress/egress inline)
# supaya mudah dibaca dan tidak memicu peringatan provider.

resource "aws_security_group" "ec2" {
  name        = "${local.name_prefix}-ec2"
  description = "Akses publik HTTP/HTTPS ke Caddy; tanpa SSH (akses lewat SSM)"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${local.name_prefix}-ec2-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ec2_http" {
  security_group_id = aws_security_group.ec2.id
  description       = "HTTP untuk redirect Caddy dan tantangan Lets Encrypt"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "ec2_https" {
  security_group_id = aws_security_group.ec2.id
  description       = "HTTPS aplikasi"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

# Tanpa aturan port 22 sama sekali: akses server hanya lewat SSM Session Manager.
resource "aws_vpc_security_group_egress_rule" "ec2_all" {
  security_group_id = aws_security_group.ec2.id
  description       = "Keluar bebas: ECR, SSM, S3, RDS, apt, dan Lets Encrypt"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "PostgreSQL hanya dari EC2 aplikasi"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# Referensi security group (bukan CIDR) supaya hanya instance dengan sg-ec2
# yang bisa menghubungi database, termasuk bila IP publik instance berubah.
resource "aws_vpc_security_group_ingress_rule" "rds_from_ec2" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL dari EC2 aplikasi"
  referenced_security_group_id = aws_security_group.ec2.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# Tidak ada aturan egress untuk sg-rds: koneksi balasan PostgreSQL bersifat
# stateful sehingga tidak memerlukan egress eksplisit.
