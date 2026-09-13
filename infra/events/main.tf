# Archived source-project design. Direct delivery is now owned by the separate
# destination firebase-migration root. This configuration cannot create a
# Workflow, identity or trigger, nor disable any existing source API.
terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "events" }
  required_providers {
    google = { source = "hashicorp/google", version = "8.1.0" }
  }
}
provider "google" {
  project               = var.firebase_project_id
  billing_project       = var.backend_project_id
  user_project_override = true
  access_token          = var.access_token
}
removed {
  from = google_project_service.required
  lifecycle { destroy = false }
}
