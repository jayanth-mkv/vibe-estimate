terraform {
  required_version = ">= 1.13.5, < 2.0.0"

  # The secure launcher must supply an absolute path under the operator's
  # private directory. No state or plan belongs in the public checkout.
  backend "local" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
    restful = {
      source  = "magodo/restful"
      version = "0.25.2"
    }
  }
}

provider "google" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
  access_token          = var.access_token
}

# Google provider 8.1.0 does not expose the API Keys serviceAccountEmail field.
# This provider retains Terraform CRUD, drift detection, and asynchronous
# operation polling while calling the documented API Keys v2 endpoint.
provider "restful" {
  base_url = "https://apikeys.googleapis.com/v2"
  security = {
    http = {
      token = {
        token = var.access_token
      }
    }
  }
  header = {
    "X-Goog-User-Project" = var.project_id
  }
  client = {
    retry = {
      status_codes    = [429, 500, 502, 503, 504]
      count           = 3
      wait_in_sec     = 2
      max_wait_in_sec = 15
    }
  }
}
