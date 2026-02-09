resource "vultr_container_registry" "vcr" {
  name   = var.registry_name
  region = var.region
  plan   = var.registry_plan
  public = var.registry_public
}
