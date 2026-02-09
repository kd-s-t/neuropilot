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
  value       = "postgresql://${vultr_database.pg.user}:${vultr_database.pg.password}@${vultr_database.pg.host}:${vultr_database.pg.port}/${vultr_database.pg.dbname}"
  description = "PostgreSQL connection string for the backend (managed DB)"
  sensitive   = true
}

output "database_host" {
  value       = vultr_database.pg.host
  description = "Managed database host"
  sensitive   = true
}

output "container_registry_id" {
  value       = vultr_container_registry.vcr.id
  description = "Vultr Container Registry ID"
}

output "container_registry_name" {
  value       = vultr_container_registry.vcr.name
  description = "Registry name for docker push/pull"
}

output "container_registry_host" {
  value       = "${var.region}.vultrcr.com"
  description = "Registry host for docker login and push/pull"
}
