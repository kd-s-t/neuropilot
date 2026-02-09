resource "vultr_instance" "app" {
  region   = var.region
  plan     = var.plan
  os_id    = var.os_id
  label    = var.instance_label
  hostname = var.instance_label
}
