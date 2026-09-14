terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
  access_token          = var.access_token
}
provider "google-beta" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
  access_token          = var.access_token
}

# Import existing Firebase membership before managing it.
resource "google_firebase_project" "destination" {
  provider = google-beta
  project  = var.project_id
  lifecycle { prevent_destroy = true }
}

# API ownership remains separate from the application and delivery roots.
resource "google_project_service" "destination" {
  for_each           = toset(["firestore.googleapis.com", "firebaserules.googleapis.com"])
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
  lifecycle { prevent_destroy = true }
}
