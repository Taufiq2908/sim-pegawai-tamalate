<#
.SYNOPSIS
  Push dua image SIMPEG (backend/frontend) ke ECR dan unggah bundle deploy ke S3.
  DIJALANKAN BOS dengan IAM user admin (bukan OpenCode).

.EXAMPLE
  deploy/release.ps1 -Tag 1a2b3c4 -AwsProfile simpeg-tf

.NOTES
  TAG harus short SHA commit yang sama dengan isi bundle dan image.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{7,40}$')]
  [string]$Tag,

  [string]$Region = 'ap-southeast-2',
  [string]$Bucket = 'simpeg-tamalate-c1e892',
  [string]$AwsProfile = 'simpeg-tf'
)

$ErrorActionPreference = 'Stop'
$deployDir = $PSScriptRoot

# Arn IAM user admin yang dipakai untuk deploy. Tolak profil lain.
$arn = aws sts get-caller-identity --profile $AwsProfile --query 'Arn' --output text
if ($LASTEXITCODE -ne 0 -or -not $arn) {
  throw "Gagal memanggil sts get-caller-identity dengan profil $AwsProfile."
}
if ($arn -notmatch ':user/terraform-deployer$') {
  throw "Profil $AwsProfile bukan user/terraform-deployer (Arn: $arn). Berhenti."
}

$accountId = ($arn -split ':')[4]
$registry = "$accountId.dkr.ecr.$Region.amazonaws.com"
$backendImage = "$registry/simpeg-backend:$Tag"
$frontendImage = "$registry/simpeg-frontend:$Tag"

$files = @(
  'docker-compose.yml',
  'Caddyfile',
  'fetch-env.sh',
  'deploy.sh',
  'boot.sh',
  'check.sh',
  'install.sh',
  'backup-db.sh',
  'db-migrate.sh',
  'migrate-files.sh',
  'simpeg.service'
)

foreach ($file in $files) {
  if (-not (Test-Path (Join-Path $deployDir $file))) {
    throw "Berkas deploy tidak ditemukan: $file"
  }
}

foreach ($image in @($backendImage, $frontendImage)) {
  docker image inspect $image *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Image lokal tidak ada: $image. Build dulu dengan buildx (lihat deploy/README.md)."
  }
}

$password = $null
try {
  $password = aws ecr get-login-password --region $Region --profile $AwsProfile
  if ($LASTEXITCODE -ne 0 -or -not $password) {
    throw 'Gagal mengambil token ECR.'
  }

  # Jangan memakai pipa ke `docker login --password-stdin`: PowerShell 5.1
  # menambahkan CRLF sehingga ECR menolak dengan 400 Bad Request.
  docker login --username AWS --password $password $registry
  if ($LASTEXITCODE -ne 0) {
    throw "docker login ke $registry gagal."
  }

  docker push $backendImage
  if ($LASTEXITCODE -ne 0) {
    throw "docker push gagal: $backendImage"
  }

  docker push $frontendImage
  if ($LASTEXITCODE -ne 0) {
    throw "docker push gagal: $frontendImage"
  }

  foreach ($file in $files) {
    $source = Join-Path $deployDir $file
    $target = "s3://$Bucket/_deploy/$Tag/$file"
    aws s3 cp $source $target --profile $AwsProfile --region $Region --only-show-errors
    if ($LASTEXITCODE -ne 0) {
      throw "Unggah gagal: $file"
    }
  }
}
finally {
  # Selalu bersihkan kredensial ECR admin dari mesin lokal.
  docker logout $registry *> $null
  $password = $null
}

Write-Host ""
Write-Host "Selesai: image dan bundle untuk TAG $Tag sudah di ECR/S3."
Write-Host "Jalankan di server (SSM Session Manager):"
Write-Host ""
Write-Host "  TAG=$Tag; BUCKET=$Bucket; REGION=$Region"
Write-Host '  sudo mkdir -p /opt/simpeg'
Write-Host '  sudo aws s3 cp --recursive --region $REGION "s3://$BUCKET/_deploy/$TAG/" /opt/simpeg/'
Write-Host '  sudo chmod +x /opt/simpeg/*.sh'
Write-Host '  sudo /opt/simpeg/install.sh'
Write-Host '  sudo /opt/simpeg/deploy.sh $TAG --skip-migrate'
Write-Host '  sudo /opt/simpeg/check.sh'
