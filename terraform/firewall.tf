resource "vultr_firewall_group" "app" {
  description = "Firewall for ${var.instance_label}"
}

resource "vultr_firewall_rule" "ssh" {
  firewall_group_id = vultr_firewall_group.app.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "22"
}

resource "vultr_firewall_rule" "http" {
  firewall_group_id = vultr_firewall_group.app.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "80"
}

resource "vultr_firewall_rule" "https" {
  firewall_group_id = vultr_firewall_group.app.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "443"
}

resource "vultr_firewall_rule" "backend" {
  firewall_group_id = vultr_firewall_group.app.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "8000"
}

resource "vultr_firewall_rule" "frontend" {
  firewall_group_id = vultr_firewall_group.app.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "3000"
}
