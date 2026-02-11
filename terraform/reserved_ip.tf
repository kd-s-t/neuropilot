resource "vultr_reserved_ip" "app" {
  region  = var.region
  ip_type = "v4"
  label  = "${var.instance_label}-reserved"
}
