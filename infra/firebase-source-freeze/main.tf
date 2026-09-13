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

# Own only these four leaves. The production state continues to own authorized
# domains. No password hash, provider credential, account or token is retrieved.
locals {
  fields = "client(permissions),signIn(anonymous,email(enabled))"
  mask   = "client.permissions.disabledUserSignup,client.permissions.disabledUserDeletion,signIn.anonymous.enabled,signIn.email.enabled"
}
resource "restful_resource" "source_permissions" {
  path                 = "/projects/${var.source_project_id}/config"
  read_query           = { fields = [local.fields] }
  query                = { fields = [local.fields] }
  update_method        = "PATCH"
  merge_patch_disabled = true
  update_query         = { updateMask = [local.mask], fields = [local.fields] }
  body = {
    client = { permissions = {
      disabledUserSignup   = var.freeze || var.original_permissions.disabled_user_signup
      disabledUserDeletion = var.freeze || var.original_permissions.disabled_user_deletion
    } }
    signIn = {
      anonymous = { enabled = var.freeze ? false : var.original_anonymous_enabled }
      email     = { enabled = var.freeze ? false : var.original_email_enabled }
    }
  }
  output_attrs = ["client", "signIn"]
  lifecycle { prevent_destroy = true }
}
import {
  to = restful_resource.source_permissions
  id = jsonencode({
    id    = "/projects/${var.source_project_id}/config", path = "/projects/${var.source_project_id}/config",
    query = { fields = [local.fields] }, body = { client = null, signIn = null }
  })
}
