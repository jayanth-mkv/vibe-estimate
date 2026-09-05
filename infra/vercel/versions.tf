terraform {
  required_version = ">= 1.13.5, < 2.0.0"

  # The operator must initialize this backend with an absolute state path outside
  # the checkout. Provider downloads and mock tests may use init -backend=false.
  backend "local" {}

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "= 5.14.0"
    }
  }
}

provider "vercel" {
  api_token = var.api_token
  team      = var.team_id
}
