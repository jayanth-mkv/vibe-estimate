terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-migration-verification" }
  required_providers {
    google = { source = "hashicorp/google", version = "8.1.0" }
  }
}

variable "target_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.target_project_id)) && !startswith(var.target_project_id, "demo-")
    error_message = "Use the explicitly authorized existing destination project."
  }
}
variable "runtime_service_account" {
  type = string
  validation {
    condition     = var.runtime_service_account == "projects/${var.target_project_id}/serviceAccounts/vibeestimate-runtime@${var.target_project_id}.iam.gserviceaccount.com"
    error_message = "Verification may sign only through the existing runtime account in the authorized destination."
  }
}
variable "operator_email" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}$", var.operator_email)) && !endswith(lower(var.operator_email), ".gserviceaccount.com")
    error_message = "Bind only the verified individual operator user; groups, public members and service accounts are forbidden."
  }
}
variable "approved_at" {
  type = string
  validation {
    condition     = can(timecmp(var.approved_at, var.approved_at))
    error_message = "Supply an explicit RFC3339 approval timestamp."
  }
}
variable "expires_at" {
  type = string
  validation {
    condition     = try(timecmp(var.expires_at, var.approved_at) > 0 && timecmp(var.expires_at, timeadd(var.approved_at, "2h")) <= 0, false)
    error_message = "Verification access must expire after approval and within two hours."
  }
}
variable "binding_enabled" {
  type    = bool
  default = false
}
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
  validation {
    condition     = length(trimspace(var.access_token)) > 0
    error_message = "Use the verified named profile's short-lived token, provided in memory only."
  }
}

provider "google" {
  project               = var.target_project_id
  billing_project       = var.target_project_id
  user_project_override = true
  access_token          = var.access_token
}

data "google_iam_role" "session_signer" {
  count = var.binding_enabled ? 1 : 0
  name  = "projects/${var.target_project_id}/roles/vibeestimateSessionSigner"
}

# This root owns one temporary member, not the role, service account or IAM
# policy. Expiry limits access even if cleanup is interrupted; the operator
# removes this same binding through a reviewed plan after verification.
resource "google_service_account_iam_member" "verification" {
  count              = var.binding_enabled ? 1 : 0
  service_account_id = var.runtime_service_account
  role               = data.google_iam_role.session_signer[0].name
  member             = "user:${var.operator_email}"
  condition {
    title       = "firebase-cutover-verification"
    description = "Temporary operator signing for the imported Google account verification."
    expression  = "request.time >= timestamp(\"${var.approved_at}\") && request.time < timestamp(\"${var.expires_at}\")"
  }
  lifecycle {
    precondition {
      condition     = toset(data.google_iam_role.session_signer[0].included_permissions) == toset(["iam.serviceAccounts.signBlob"])
      error_message = "The existing role must grant only signBlob, without token creation or broader impersonation permissions."
    }
  }
}
