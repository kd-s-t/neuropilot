resource "vultr_instance" "app" {
  region            = var.region
  plan              = var.plan
  os_id             = var.os_id
  label             = var.instance_label
  hostname          = var.instance_label
  firewall_group_id = vultr_firewall_group.app.id
  vpc_ids           = [vultr_vpc.app.id]
  reserved_ip_id    = vultr_reserved_ip.app.id

  user_data = file("${path.module}/templates/cloud-init-docker.tpl")
}
