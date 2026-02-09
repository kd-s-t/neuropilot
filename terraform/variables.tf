variable "region" {
  type        = string
  description = "Vultr region code (e.g. ewr, lax, sfo)"
  default     = "ewr"
}

variable "plan" {
  type        = string
  description = "Vultr plan ID (e.g. vc2-1c-1gb, vc2-1c-2gb)"
  default     = "vc2-1c-2gb"
}

variable "os_id" {
  type        = number
  description = "Vultr OS image ID (477 = Ubuntu 22.04 LTS)"
  default     = 477
}

variable "instance_label" {
  type        = string
  description = "Label for the instance"
  default     = "neuropilot"
}
