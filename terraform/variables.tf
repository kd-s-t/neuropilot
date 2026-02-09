variable "vultr_api_key" {
  type        = string
  sensitive   = true
  description = "Vultr API key. Set via TF_VAR_vultr_api_key or -var. Use same value as VULTR_API_KEY in .env."
}

variable "region" {
  type        = string
  description = "Vultr region code"
  default     = "sgp"
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

variable "db_password" {
  type        = string
  sensitive   = true
  description = "PostgreSQL password for db user. Set via TF_VAR_db_password (e.g. from .env)."
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database and user name. Set via TF_VAR_db_name."
  default     = "neuropilot"
}

variable "db_plan" {
  type        = string
  description = "Vultr managed database plan ID. List plans: API /v2/databases/plans?region=<region>"
  default     = "vultr-dbaas-startup-cc-1-55-2"
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
