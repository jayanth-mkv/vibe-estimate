terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  # This root provisions the bucket below; the bucket already exists, so its own state lives there too.
  # Versioned, locked, private GCS state; supply only the bucket name at init.
  backend "gcs" {
    prefix = "delivery"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

variable "backend_project_id" { type = string }
variable "backend_region" { type = string }
variable "connection_location" { type = string }
variable "cloud_build_connection" { type = string }
variable "github_repository" { type = string }
variable "state_bucket_name" { type = string }
variable "image_repository" { type = string }
variable "build_service_account" { type = string }
variable "runtime_service_account" { type = string }
variable "runtime_variables" {
  description = "Nonsecret runtime metadata. No credential or secret payload may be included."
  type = object({
    backend_project_id         = string, firebase_project_id = string, project_number = string,
    region                     = string, firestore_database_id = string, gemini_model = string,
    runtime_service_account    = string, task_queue = string, task_service_account = string,
    firebase_web_config_secret = string, firebase_web_config_version = string
  })
}
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
}

provider "google" {
  project               = var.backend_project_id
  billing_project       = var.backend_project_id
  user_project_override = true
  access_token          = var.access_token
}

locals {
  build_member = "serviceAccount:${var.build_service_account}"
  labels       = { app = "vibeestimate", environment = "production", managed-by = "terraform" }
}

resource "google_storage_bucket" "runtime_state" {
  project                     = var.backend_project_id
  name                        = var.state_bucket_name
  location                    = var.backend_region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket_iam_member" "runtime_state" {
  bucket = google_storage_bucket.runtime_state.name
  role   = "roles/storage.objectAdmin"
  member = local.build_member
}

# The existing image builder can update this service, but cannot create/delete it,
# administer Firebase, read secret payloads or grant IAM. The pipeline's plan
# check additionally permits only the one imported Cloud Run service.
resource "google_project_iam_custom_role" "release" {
  project     = var.backend_project_id
  role_id     = "vibeestimateReleaseUpdater"
  title       = "VibeEstimate runtime release updater"
  permissions = ["run.services.get", "run.services.update"]
}
resource "google_cloud_run_v2_service_iam_member" "release" {
  project  = var.backend_project_id
  location = var.backend_region
  name     = "vibeestimate"
  role     = google_project_iam_custom_role.release.name
  member   = local.build_member
}
resource "google_project_iam_custom_role" "release_operations" {
  project     = var.backend_project_id
  role_id     = "vibeestimateReleaseOperations"
  title       = "VibeEstimate release operation polling"
  permissions = ["run.operations.get", "serviceusage.services.use"]
}
resource "google_project_iam_member" "release_operations" {
  project = var.backend_project_id
  role    = google_project_iam_custom_role.release_operations.name
  member  = local.build_member
}
resource "google_service_account_iam_member" "runtime_identity" {
  service_account_id = "projects/${var.backend_project_id}/serviceAccounts/${var.runtime_service_account}"
  role               = "roles/iam.serviceAccountUser"
  member             = local.build_member
}

# The OAuth connection was created by the operator and remains untouched.
# Discovery must confirm no matching child repository exists before creation.
resource "google_cloudbuildv2_repository" "application" {
  project           = var.backend_project_id
  location          = var.connection_location
  name              = "vibeestimate"
  parent_connection = var.cloud_build_connection
  remote_uri        = "https://github.com/${var.github_repository}.git"
  lifecycle { prevent_destroy = true }
}

resource "google_cloudbuild_trigger" "main" {
  project         = var.backend_project_id
  location        = var.connection_location
  name            = "vibeestimate-main"
  description     = "Push main: verify, build immutable image, deploy Cloud Run with Terraform"
  filename        = "cloudbuild.yaml"
  service_account = "projects/${var.backend_project_id}/serviceAccounts/${var.build_service_account}"
  disabled        = false
  repository_event_config {
    repository = google_cloudbuildv2_repository.application.id
    push { branch = "^main$" }
  }
  substitutions = {
    _STATE_BUCKET      = google_storage_bucket.runtime_state.name
    _RUNTIME_VARS_B64  = base64encode(jsonencode(var.runtime_variables))
    _IMAGE_REPOSITORY  = var.image_repository
    _GITHUB_REPOSITORY = var.github_repository
  }
  depends_on = [google_storage_bucket_iam_member.runtime_state, google_cloud_run_v2_service_iam_member.release, google_project_iam_member.release_operations, google_service_account_iam_member.runtime_identity]
  lifecycle { prevent_destroy = true }
}

output "state_bucket" { value = google_storage_bucket.runtime_state.name }
output "trigger_id" { value = google_cloudbuild_trigger.main.id }
output "repository_id" { value = google_cloudbuildv2_repository.application.id }
