# The proposed source billing link was never applied. Forget only the imported
# billing-info record; never link billing or disable the destination account.
terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-billing" }
  required_providers {
    google = { source = "hashicorp/google", version = "8.1.0" }
  }
}
provider "google" {
  project               = var.firebase_project_id
  billing_project       = var.backend_project_id
  user_project_override = false
  access_token          = var.access_token
}
removed {
  from = google_billing_project_info.firebase
  lifecycle { destroy = false }
}
