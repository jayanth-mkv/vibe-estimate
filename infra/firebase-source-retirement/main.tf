terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-source-retirement" }
  required_providers {
    google = { source = "hashicorp/google", version = "8.1.0" }
  }
}

variable "source_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.source_project_id)) && !startswith(var.source_project_id, "demo-") && var.source_project_id != var.destination_project_id
    error_message = "Retirement must name the explicitly authorized existing source, distinct from the destination."
  }
}
variable "source_project_name" {
  description = "Exact discovered existing display name; adoption must not rename the source."
  type        = string
}
variable "destination_project_id" { type = string }
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
}
variable "deletion_ready" {
  description = "Enable only after reviewed data, runtime, Google sign-in and state-ownership retirement checks."
  type        = bool
  default     = false
}
variable "retire_source" {
  description = "Remove only the imported source project after its separate deletion-policy stage."
  type        = bool
  default     = false
  validation {
    condition     = !var.retire_source || var.deletion_ready
    error_message = "Source retirement requires the completed deletion-readiness stage."
  }
}

provider "google" {
  project               = var.source_project_id
  billing_project       = var.destination_project_id
  user_project_override = true
  access_token          = var.access_token
}

# This root must only import an existing project. The private plan guard rejects
# creation, replacement, renaming, billing changes, labels or parent changes.
resource "google_project" "source" {
  count           = var.retire_source ? 0 : 1
  project_id      = var.source_project_id
  name            = var.source_project_name
  deletion_policy = var.deletion_ready ? "DELETE" : "PREVENT"
  lifecycle {
    ignore_changes = [auto_create_network, billing_account, labels, org_id, folder_id]
  }
}
