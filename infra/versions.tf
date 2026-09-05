terraform {
  required_version = ">= 1.13.5, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project = var.backend_project_id
  region  = var.region
}
