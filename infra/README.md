# `infra/` — Terraform SIMPEG Tamalate di AWS

Seluruh infrastruktur AWS untuk SIMPEG Tamalate didefinisikan di folder ini.
Aplikasi sendiri (backend, frontend, Caddy) dijalankan dengan Docker Compose di
satu instance EC2 — lihat `deploy/`.

> **PERINGATAN:** file `terraform.tfstate` berisi **password database dan semua
> JWT secret** dalam bentuk teks biasa. Jangan pernah di-commit, dikirim lewat
> chat, atau diunggah ke mana pun. Sudah ada di `.gitignore`.

---

## 1. Apa yang dibuat

| Berkas | Resource |
|---|---|
| `network.tf` | security group `simpeg-ec2` (80/443 saja, **tanpa port 22**) dan `simpeg-rds` (5432 hanya dari `simpeg-ec2`) di default VPC |
| `iam.tf` | role + instance profile EC2 (path `/`): SSM, baca `/simpeg/prod/*`, pull ECR, baca/tulis bucket S3 |
| `s3.tf` | bucket privat berkas dokumen: Block Public Access, SSE-S3, versioning, lifecycle 30 hari, tolak non-TLS |
| `ecr.tf` | dua repository (`simpeg-backend`, `simpeg-frontend`), scan on push, simpan 5 image |
| `rds.tf` | RDS PostgreSQL 17 `db.t4g.micro`, gp3 20 GB, terenkripsi, privat, backup 1 hari (batas free plan) (kondisional `use_rds`) |
| `ssm.tf` | parameter `/simpeg/prod/*`: `DATABASE_URL`, `DIRECT_URL`, dua JWT secret (SecureString) + konfigurasi non-rahasia |
| `ec2.tf` | EC2 `t4g.small` Ubuntu 24.04 ARM64, disk 30 GB gp3 terenkripsi, IMDSv2, Elastic IP, `user_data` minimal |
| `ci_user.tf` | **opsional** (`enable_ci_user`, default false): IAM user `simpeg-ci-deployer` untuk pipeline deploy |
| `monitoring.tf` | SNS email, 4 alarm CloudWatch, snapshot EBS harian (DLM, simpan 7), CloudTrail (management events, log 90 hari) dan Budget $100 — keduanya opsional |
| `outputs.tf` | Elastic IP, ID instance, nama bucket, URL ECR, endpoint RDS, nama user CI, perintah SSM |

Semua resource diberi tag `Project=simpeg` (lewat `default_tags`).

## 2. Prasyarat

1. Terraform **>= 1.6** (diuji dengan 1.17.1).
2. Kredensial AWS aktif untuk akun proyek Bos. Kode ini **tidak** bergantung pada
   metode login tertentu — cukup pastikan `aws sts get-caller-identity` berhasil
   dengan cara apa pun yang dipakai Bos (SSO, Identity Center, dsb.).
3. Akun punya **default VPC** dengan subnet di **minimal dua** Availability Zone.
   RDS mensyaratkan DB subnet group berisi minimal dua AZ, walaupun instance-nya
   single-AZ. Bila default VPC dihapus, Terraform berhenti dengan pesan
   `no matching VPC found`; buat ulang default VPC atau sediakan VPC sendiri.
4. Domain DuckDNS sudah dibuat dan diarahkan ke Elastic IP hasil `apply`
   (lihat langkah manual di bagian 4).

## 3. Cara pakai

```powershell
cd infra
terraform init                     # sekali saja
terraform fmt -check -recursive    # format
terraform validate                 # sintaks
terraform plan -out=tfplan         # hanya Bos yang menjalankan
terraform apply tfplan             # hanya Bos yang menjalankan
```

Aturan proyek: **hanya Bos yang menjalankan `plan` dan `apply`**. Yang lain
cukup `fmt` dan `validate`.

Setelah `apply` selesai, ambil nilai yang dibutuhkan:

```powershell
terraform output
```

## 4. Langkah manual setelah `apply`

1. **DuckDNS**: isi IP dari `terraform output elastic_ip` di halaman DuckDNS
   domain Bos. Tunggu propagasi (biasanya < 5 menit).
2. **Konfirmasi email SNS**: AWS mengirim email "AWS Notification - Subscription
   Confirmation"; klik `Confirm subscription`. Tanpa ini alarm tidak terkirim.
3. **Cek instance di SSM**: di konsol Systems Manager → Session Manager,
   instance `simpeg-app` harus muncul dalam ± 2 menit setelah boot. Bila belum,
   tunggu `user_data` selesai (cek `/var/log/cloud-init-output.log`).
4. **Deploy aplikasi**: jalankan `deploy/deploy.sh <tag>` di server (lihat
   `deploy/README.md`). Terraform tidak menjalankan aplikasi.
5. **Isi data**: `deploy/fetch-env.sh` mengambil parameter SSM menjadi
   `/opt/simpeg/.env`.

## 5. State dan rahasia

- State disimpan **lokal** (`infra/terraform.tfstate`). Jangan pindah mesin
  tanpa memindahkan file ini; bila hilang, Terraform menganggap semua resource
  belum ada dan `apply` berikutnya akan gagal karena bentrok nama.
- Password RDS (`random_password`) dan JWT secret juga tersimpan di state dan
  di SSM Parameter Store. Bucket S3 **tidak** menyimpan state.
- `.terraform.lock.hcl` boleh di-commit. Berkas saat ini dikunci untuk
  `windows_amd64` (mesin tempat `apply` dijalankan). Bila nanti Terraform
  dijalankan dari Linux/WSL, jalankan dulu
  `terraform providers lock -platform=linux_amd64` supaya hash-nya lengkap.

## 6. Keterbatasan akun free plan (project)

Akun Bos bertipe **"Sign up for AWS (new)"**, free plan, dan berbasis project.
Dokumentasi akun menetapkan batasan berikut. Ini bukan pilihan desain kita, jadi
jangan mencoba mengakalinya:

| Batasan | Akibat pada rencana ini |
|---|---|
| Region project **terkunci** dan kebijakan akun menolak `account:EnableRegion` | Hanya `ap-southeast-2` yang bisa dipakai. Variabel `region` divalidasi persis satu nilai itu. |
| `iam:*Provider*` ditolak | **Tidak bisa** membuat OIDC provider, jadi GitHub Actions tidak bisa memakai OIDC. Diganti IAM user CI opsional (bagian 8). |
| `iam:*LoginProfile*`, `iam:CreateGroup`, `iam:AttachGroupPolicy`, `iam:AddUserToGroup` ditolak | IAM user CI tidak punya password konsol dan tidak dimasukkan ke group. Aksesnya murni access key untuk API. |
| Spot, host tenancy, dan root volume instance-store ditolak | Kita memakai On-Demand `t4g.small` + EBS gp3, jadi tidak terpengaruh. |

### Peringatan SPEND LIMIT

Bila Bos memasang **spend limit** di AWS Settings (Billing), AWS akan
**menolak membuat atau menjalankan** EC2, RDS, ECR repository, dan SNS topic
begitu pemakaian mendekati batas. Gejalanya bisa membingungkan karena
perintahnya terlihat "gagal tanpa alasan jelas".

Saran urutan aman:

1. Buat **semua** resource lebih dulu (`apply` tanpa spend limit ketat).
2. Verifikasi aplikasi jalan.
3. Baru pasang spend limit sebagai pengaman, dengan nilai yang **tidak ketat**
   (di atas perkiraan biaya di bagian 11).

Untuk pengamanan biaya awal, lebih baik mengandalkan AWS Budgets
(`enable_budgets = true`) yang hanya mengirim email dan tidak memblokir resource.

### Layanan opsional

`enable_cloudtrail` dan `enable_budgets` tetap **default false** di
`variables.tf`. Contoh `terraform.tfvars.example` sengaja mengaktifkan keduanya
karena keduanya murah/berguna; bila akun menolak, ubah kembali ke false. Budget
`simpeg-100` mengukur pemakaian **kotor** (`cost_types.include_credit = false`)
supaya kredit $100 tidak membuat tagihan bersih selalu $0. CloudTrail di sini
hanya mencatat **management events** (tanpa data events yang berbayar) dan
menyimpan log 90 hari.

## 7. Kemungkinan penolakan saat `apply`

Meskipun layanan yang dipakai sudah diizinkan, free plan dapat menolak hal lain:

- Kuota vCPU untuk `t4g.small` atau kelas `db.t4g.micro` = 0 di akun baru.
- Batas jumlah Elastic IP, SNS topic, atau parameter SSM.
- Kebijakan akun yang lebih ketat dari dokumentasi.

Bila `apply` menolak, **jangan mengganti jenis instance sendiri**. Salin pesan
error mentahnya dan laporkan; keputusan ada di Bos/Claude.

### Batasan free plan yang ditemukan saat apply

Dua penolakan nyata pada apply pertama (18 November 2026), sudah diperbaiki di kode:

1. **Retensi backup RDS maksimum 1 hari.**
   ```
   Error: creating RDS DB Instance (simpeg-db): FreeTierRestrictionError:
   The specified backup retention period exceeds the maximum available to
   free tier customers.
   ```
   7 hari dan 3 hari ditolak; 1 diterima. Gunakan
   `db_backup_retention_days = 1` (0 = backup otomatis mati).

2. **Deskripsi aturan security group tidak boleh memuat tanda petik.**
   ```
   Error: creating Security Group Rule: InvalidParameterValue: Invalid rule
   description. Valid descriptions are strings less than 256 characters from
   the following set: a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*
   ```
   Penyebabnya `"Let's Encrypt"`. Tulis `"Lets Encrypt"`. Aturan ini hanya
   berlaku untuk `description` pada security group dan aturan SG, bukan
   deskripsi IAM/ECR/DLM.

## 8. Pipeline deploy dengan IAM user CI (opsional)

Karena OIDC tidak tersedia, pipeline (bila nanti dipakai) memakai IAM user
`simpeg-ci-deployer`:

```hcl
# terraform.tfvars
enable_ci_user = true
```

Langkah manual setelah `apply`:

1. `terraform output ci_user_name` → nama user (`simpeg-ci-deployer`).
2. Di konsol IAM (atau CLI `aws iam create-access-key`), buat **satu** access key
   untuk user itu. **Terraform tidak membuatnya** karena nilainya akan tersimpan
   di state.
3. Simpan `AccessKeyId` / `SecretAccessKey` sebagai **environment secrets**
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` pada environment `production`
   di GitHub, bukan repository secrets dan bukan file repo.
4. Buat environment `production` dengan **Deployment branches = main** saja.
5. Bila pipeline belum dipakai, biarkan `enable_ci_user = false`.

Izin user (minimal, lihat `ci_user.tf`): `ecr:GetAuthorizationToken`; push ke
dua repository kita (`BatchCheckLayerAvailability`, `BatchGetImage`,
`CompleteLayerUpload`, `InitiateLayerUpload`, `PutImage`, `UploadLayerPart`);
`s3:PutObject` hanya pada `<bucket>/_deploy/*`; `ssm:SendCommand` hanya ke
dokumen `AWS-RunShellScript` + instance ini; `ssm:GetCommandInvocation` dan
`ssm:ListCommandInvocations` untuk membaca hasil. Tidak ada izin RDS, IAM, EC2,
atau S3 lain.

**Rotasi access key**: buat key baru → perbarui environment secrets → uji satu
deploy → hapus key lama. Saat teardown, hapus access key lalu hapus user (atau
`enable_ci_user = false` + `apply`).

## 9. Rencana C (`use_rds = false`)

Rencana C hanya **catatan roadmap** dan **tidak diimplementasikan**. Variabel
`use_rds = false` tetap ada, tetapi efeknya hanya: RDS, DB subnet group,
parameter `DATABASE_URL` / `DIRECT_URL`, dan alarm disk RDS tidak dibuat.
Postgres harus tetap disediakan manual di EC2 (container) beserta `pg_dump`
harian ke S3 — pekerjaan itu tidak ada di repo ini dan tidak direncanakan.
Gunakan `use_rds = true` (Rencana A, final).

## 10. Menghapus infrastruktur

Urutan ini **hanya untuk Bos**, dan akan menghapus data:

1. Kosongkan bucket S3 aplikasi (versioning harus dimatikan atau objek+versi
   dihapus) dan hapus bucket CloudTrail bila `enable_cloudtrail = true`.
2. Set `db_deletion_protection = false`, jalankan `terraform apply`.
3. `terraform destroy`.
4. Bucket S3 aplikasi memakai `force_destroy = false`, jadi Terraform akan
   menolak menghapus bucket yang masih berisi berkas. Ini disengaja.

## 11. Perkiraan biaya

Perkiraan kasar (24/7, sebelum pajak, **belum diverifikasi** untuk akun ini):

| Komponen | Perkiraan/bulan |
|---|---|
| EC2 `t4g.small` | $15 – 18 |
| EBS 30 GB gp3 + snapshot 7 hari | $3 – 5 |
| RDS `db.t4g.micro` + 20 GB gp3 + backup | $18 – 24 |
| Elastic IP (menempel ke instance) | ~$0 |
| S3, ECR, CloudWatch, SSM | $1 – 3 |
| **Total** | **± $40 – 50** |

Penghematan terbesar: hentikan EC2 dan RDS saat tidak dipakai (data tetap ada),
atau kurangi retensi snapshot. Hindari NAT Gateway, ALB, Multi-AZ, dan
Performance Insights — semuanya sengaja tidak dipakai.

## 12. Verifikasi tanpa AWS

Yang bisa dijalankan tanpa kredensial:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

`plan` membutuhkan kredensial dan **hanya** dijalankan Bos.

## 13. Bila `terraform init` gagal karena IPv6

Gejalanya seperti ini (bukan salah kode):

```
read tcp [2001:db8::1]:51144->[2600:9000::1]:443:
wsarecv: An existing connection was forcibly closed by the remote host
```

Artinya koneksi ke `registry.terraform.io` lewat IPv6 diputus jaringan. Provider
plugin bisa diambil manual lewat IPv4 lalu dipasang sebagai *filesystem mirror*.
Cara ini **khusus darurat**; cara normal tetap `terraform init`.

1. Unduh zip provider + checksum lewat IPv4 (sesuaikan versi dengan
   `.terraform.lock.hcl`):

```powershell
$base = "https://releases.hashicorp.com"
$d = "$env:TEMP\opencode\tf-dl"
$m = "$env:TEMP\opencode\tf-mirror"
New-Item -ItemType Directory -Force -Path $d, $m | Out-Null
curl.exe -4 -sS -f -L "$base/terraform-provider-aws/5.100.0/terraform-provider-aws_5.100.0_windows_amd64.zip" -o "$d\aws.zip"
curl.exe -4 -sS -f -L "$base/terraform-provider-aws/5.100.0/terraform-provider-aws_5.100.0_SHA256SUMS" -o "$d\aws.sha"
curl.exe -4 -sS -f -L "$base/terraform-provider-random/3.9.1/terraform-provider-random_3.9.1_windows_amd64.zip" -o "$d\random.zip"
curl.exe -4 -sS -f -L "$base/terraform-provider-random/3.9.1/terraform-provider-random_3.9.1_SHA256SUMS" -o "$d\random.sha"
```

2. Cocokkan checksum:

```powershell
(Get-FileHash "$d\aws.zip" -Algorithm SHA256).Hash.ToLower()
Select-String "_windows_amd64.zip" "$d\aws.sha"
```

3. Ekstrak ke struktur mirror:

```powershell
Expand-Archive "$d\aws.zip" -DestinationPath "$m\registry.terraform.io\hashicorp\aws\5.100.0\windows_amd64" -Force
Expand-Archive "$d\random.zip" -DestinationPath "$m\registry.terraform.io\hashicorp\random\3.9.1\windows_amd64" -Force
```

4. Buat CLI config **di luar repo**:

```powershell
$cfg = "$env:TEMP\opencode\tf-cli.tfrc"
$mpath = $m -replace '\\','/'
@"
provider_installation {
  filesystem_mirror {
    path    = "$mpath"
    include = ["registry.terraform.io/hashicorp/*"]
  }
  direct {
    exclude = ["registry.terraform.io/hashicorp/*"]
  }
}
"@ | Set-Content -Encoding ascii $cfg
```

5. Jalankan init/validate dengan config itu:

```powershell
$env:TF_CLI_CONFIG_FILE = $cfg
terraform init -backend=false
terraform validate
```

**Catatan keamanan:** pada cara ini **tanda tangan GPG tidak diverifikasi**;
yang diperiksa hanya checksum SHA-256 dari berkas `SHA256SUMS` resmi HashiCorp.
Hapus `$env:TF_CLI_CONFIG_FILE` (atau tutup sesi) setelah selesai agar Terraform
kembali memakai registry normal.
