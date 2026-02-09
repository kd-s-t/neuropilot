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
