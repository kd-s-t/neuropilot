resource "vultr_instance" "app" {
  region   = var.region
  plan     = var.plan
  os_id    = var.os_id
  label    = var.instance_label
  hostname = var.instance_label

  user_data = templatefile("${path.module}/templates/cloud-init-postgres.tpl", {
    db_name             = var.db_name
    db_password_escaped = replace(replace(var.db_password, "\\", "\\\\"), "'", "''")
  })
}
