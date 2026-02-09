terraform {
  required_version = ">= 1.0"
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.27"
    }
  }
}

provider "vultr" {
  api_key = var.vultr_api_key
}
