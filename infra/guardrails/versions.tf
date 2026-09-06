terraform {
  required_version = ">= 1.13.5, < 2.0.0"

  # Billing guardrails are a small, separately reviewed concern with different
  # permissions from the application roots. The launcher supplies an absolute
  # path under the operator's private directory; no state belongs in the
  # public checkout.
  backend "local" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

# The budget is a billing-account resource, but the Budget API is billed and
# quota-counted against the authorized backend project.
provider "google" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
  access_token          = var.access_token
}
