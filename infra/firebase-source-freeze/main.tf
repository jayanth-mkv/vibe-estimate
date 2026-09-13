terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-source-freeze" }
  required_providers {
    restful = { source = "magodo/restful", version = "0.25.2" }
  }
}

variable "source_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.source_project_id)) && !startswith(var.source_project_id, "demo-") && var.source_project_id != var.quota_project_id
    error_message = "Use the explicitly authorized existing source, distinct from the billed destination quota project."
  }
}
variable "quota_project_id" { type = string }
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
}
variable "freeze" {
  description = "Disable source account creation/deletion during a separately verified application maintenance window."
  type        = bool
  default     = false
}
variable "original_permissions" {
  description = "Exact discovered source permissions retained for reversible rollback."
  type = object({
    disabled_user_signup   = bool
    disabled_user_deletion = bool
  })
}
variable "original_anonymous_enabled" { type = bool }
variable "original_email_enabled" { type = bool }

provider "restful" {
  base_url = "https://identitytoolkit.googleapis.com/admin/v2"
  security = { http = { token = { token = var.access_token } } }
  header   = { "X-Goog-User-Project" = var.quota_project_id }
}

# Keep the applied freeze in force through project shutdown. Retiring this state
# must not restore providers or allow new source accounts after final copy.
removed {
  from = restful_resource.source_permissions
  lifecycle { destroy = false }
}
