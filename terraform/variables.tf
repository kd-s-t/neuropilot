variable "vultr_api_key" {
  type        = string
  sensitive   = true
  description = "Vultr API key. Set via TF_VAR_vultr_api_key or .env."
}

variable "region" {
  type        = string
  description = "Vultr region code"
  default     = "sgp"
}

variable "plan" {
  type        = string
  description = "Vultr plan ID. Set via TF_VAR_plan (e.g. vc2-1c-2gb, vc2-2c-4gb, vc2-4c-8gb)"
  default     = "vc2-2c-4gb"
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

variable "db_plan" {
  type        = string
  description = "Vultr managed database plan ID"
  default     = "vultr-dbaas-startup-cc-1-55-2"
}

variable "db_trusted_ips" {
  type        = list(string)
  description = "Extra IPv4 CIDRs allowed to connect to the DB (e.g. your IP for TablePlus). VM IP is always included. Vultr only supports IPv4; use /32 (e.g. curl -4 -s ifconfig.me)."
  default     = []
}

variable "registry_name" {
  type        = string
  description = "Vultr Container Registry name (lowercase alphanumeric only)"
  default     = "neuropilot"
}

variable "registry_plan" {
  type        = string
  description = "Vultr Container Registry plan: start_up (10GB free), business, premium, enterprise"
  default     = "start_up"
}

variable "registry_public" {
  type        = bool
  description = "Whether the registry is publicly readable"
  default     = false
}
