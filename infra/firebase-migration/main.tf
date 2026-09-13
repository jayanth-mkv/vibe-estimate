terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "firebase-migration" }
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
  project               = var.target_project_id
  billing_project       = var.target_project_id
  user_project_override = true
  access_token          = var.access_token
}
provider "google-beta" {
  project               = var.target_project_id
  billing_project       = var.target_project_id
  user_project_override = true
  access_token          = var.access_token
}

# Existing destination Firebase membership is imported, never recreated.
resource "google_firebase_project" "destination" {
  provider = google-beta
  project  = var.target_project_id
  lifecycle { prevent_destroy = true }
}

# Bootstrap enables only these discovered prerequisites. Database creation is a
# separate reviewed stage after a successful destination database inventory.
resource "google_project_service" "destination" {
  for_each           = toset(["firestore.googleapis.com", "firebaserules.googleapis.com"])
  project            = var.target_project_id
  service            = each.key
  disable_on_destroy = false
  lifecycle { prevent_destroy = true }
}
