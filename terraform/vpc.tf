resource "vultr_vpc" "app" {
  region      = var.region
  description = "${var.instance_label}-vpc"
}
