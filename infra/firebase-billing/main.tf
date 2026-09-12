terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-billing" }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project         = var.firebase_project_id
  billing_project = var.backend_project_id
  # Cloud Billing is a global account API. Its project resource is explicit;
  # avoid requiring an unrelated API activation on the backend quota project.
  user_project_override = false
  access_token          = var.access_token
}

# Import the existing project's billing information before planning its link.
# Project lifecycle, APIs, identities, databases and budgets have other owners.
resource "google_billing_project_info" "firebase" {
  project         = var.firebase_project_id
  billing_account = var.billing_account
  deletion_policy = "ABANDON"
  lifecycle { prevent_destroy = true }
}
