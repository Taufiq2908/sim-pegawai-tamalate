# EC2 tunggal: menjalankan Caddy + frontend + backend lewat Docker Compose.

# AMI Ubuntu 24.04 LTS ARM64 resmi Canonical (hvm-ssd-gp3).
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = local.app_subnet_id
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids      = [aws_security_group.ec2.id]

  # Kredit CPU dibatasi (standard) supaya tidak ada biaya burst tak terduga.
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  # Tag volume terpisah: default_tags provider tidak menempel ke volume instance.
  # Tag Backup=daily adalah target kebijakan snapshot DLM (monitoring.tf).
  volume_tags = {
    Backup = "daily"
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"

    # WAJIB 2, bukan 1: proses di dalam kontainer Docker membutuhkan satu hop
    # tambahan untuk menjangkau IMDS dan mengambil kredensial IAM Role.
    # Dengan hop limit 1, AWS SDK (S3) di dalam kontainer akan gagal.
    http_put_response_hop_limit = 2
  }

  # false: perubahan user_data (mis. menambah paket) TIDAK mengganti instance.
  # Skrip dibuat idempoten agar aman dijalankan ulang lewat cloud-init.
  user_data_replace_on_change = false

  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail

    # ---------- Swap 2 GB (idempoten) ----------
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile
      chmod 600 /swapfile
      mkswap /swapfile
    fi
    swapon /swapfile || true
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

    # ---------- Docker dari repository resmi Docker ----------
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    arch=$(dpkg --print-architecture)
    codename=$(. /etc/os-release && echo $VERSION_CODENAME)
    echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin unzip
    systemctl enable --now docker

    # User ubuntu boleh memakai docker tanpa sudo (perlu login ulang).
    usermod -aG docker ubuntu

    # ---------- AWS CLI v2 (ARM64) ----------
    if ! command -v aws >/dev/null 2>&1; then
      workdir=$(mktemp -d)
      curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o $workdir/awscliv2.zip
      unzip -q $workdir/awscliv2.zip -d $workdir
      $workdir/aws/install
      rm -rf $workdir
    fi

    # ---------- SSM agent (snap bawaan AMI Ubuntu) ----------
    systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service || true
    snap start amazon-ssm-agent || true

    # ---------- Direktori aplikasi ----------
    install -d -o ubuntu -g ubuntu /opt/simpeg
  EOT

  tags = {
    Name = "${local.name_prefix}-app"
  }

  lifecycle {
    # Pesan jelas bila AZ terpilih tidak punya subnet default (lihat network.tf).
    precondition {
      condition     = local.app_subnet_id != null
      error_message = "EC2 tidak bisa dibuat: tidak ada subnet default di AZ ${local.availability_zone}. Ubah az_suffix atau tambahkan subnet default di AZ tersebut."
    }
  }
}

# Elastic IP tetap: IP tidak berubah saat instance di-stop/start.
resource "aws_eip" "app" {
  domain = "vpc"

  tags = {
    Name = "${local.name_prefix}-eip"
  }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
