# Output untuk operasional. Tidak ada nilai rahasia di sini (password dan
# secret hanya ada di SSM Parameter Store dan di state Terraform).

output "elastic_ip" {
  description = "IP publik tetap EC2; isi nilai ini di DuckDNS."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "ID instance EC2 (dipakai SSM dan pipeline deploy)."
  value       = aws_instance.app.id
}

output "s3_bucket" {
  description = "Nama bucket S3 untuk berkas dokumen."
  value       = aws_s3_bucket.files.bucket
}

output "ecr_backend_url" {
  description = "URL repository ECR backend (tanpa tag)."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "URL repository ECR frontend (tanpa tag)."
  value       = aws_ecr_repository.frontend.repository_url
}

output "rds_endpoint" {
  description = "Host:port RDS. Bernilai keterangan bila use_rds=false."
  value       = var.use_rds ? aws_db_instance.main[0].endpoint : "RDS tidak dibuat (use_rds=false): Rencana C belum diimplementasikan"
}

output "ci_user_name" {
  description = "Nama IAM user pipeline deploy (null bila enable_ci_user=false). Kunci akses dibuat manual."
  value       = try(aws_iam_user.ci[0].name, null)
}

output "ssm_session_command" {
  description = "Perintah membuka shell di EC2 tanpa SSH."
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.region}"
}

output "duckdns_instruction" {
  description = "Langkah manual di DuckDNS."
  value       = "Isi IP ${aws_eip.app.public_ip} sebagai IP domain DuckDNS Anda, lalu arahkan A record ke IP tersebut. Setelah propagasi, pastikan variabel app_domain sama dengan domain itu agar Caddy bisa menerbitkan sertifikat."
}
