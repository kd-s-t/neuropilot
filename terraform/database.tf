resource "vultr_database" "pg" {
  database_engine        = "pg"
  database_engine_version = "16"
  region                 = var.region
  plan                   = var.db_plan
  label                  = "${var.instance_label}-db"

  trusted_ips = [vultr_instance.app.main_ip]
}
