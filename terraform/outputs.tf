output "instance_id" {
  value       = vultr_instance.app.id
  description = "Vultr instance ID"
}

output "public_ip" {
  value       = vultr_instance.app.main_ip
  description = "Public IP for FE/BE (e.g. http://this-ip or https://this-ip.sslip.io)"
}

output "ssh_user" {
  value       = "root"
  description = "SSH user for the instance"
}

output "database_url" {
  value       = "postgresql://${var.db_name}:${var.db_password}@localhost:5432/${var.db_name}"
  description = "PostgreSQL connection string for the backend (same VM)"
  sensitive   = true
}
