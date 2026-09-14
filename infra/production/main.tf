terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  # Foundation identities, image storage and queue use protected private state.
  # Versioned, locked, private GCS state; supply only the bucket name at init.
  backend "gcs" {
    prefix = "production"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

variable "backend_project_id" { type = string }
variable "project_number" { type = string }
variable "region" { type = string }
variable "pause_room_recovery" {
  type        = bool
  default     = true
  description = "Keep periodic recovery paused while Firestore events deliver saved review work."
}
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
}
variable "image" {
  type    = string
  default = ""
  validation {
    condition     = var.image == "" || can(regex("@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Deploy only the verified immutable application image digest."
  }
}

provider "google" {
  project               = var.backend_project_id
  billing_project       = var.backend_project_id
  user_project_override = true
  access_token          = var.access_token
}

locals {
  labels = { app = "vibeestimate", environment = "production", managed-by = "terraform", dev-tutorial = "cloud-run-ai-challenge" }
  host   = "vibeestimate-${var.project_number}.${var.region}.run.app"
  origin = "https://${local.host}"
  deploy = var.image != ""
}

# These APIs were discovered disabled. APIs already managed by gemini-local or
# already enabled for builds/storage remain in their existing ownership scope.
resource "google_project_service" "required" {
  for_each           = toset(["run.googleapis.com", "cloudtasks.googleapis.com", "cloudscheduler.googleapis.com"])
  project            = var.backend_project_id
  service            = each.value
  disable_on_destroy = false
  lifecycle { prevent_destroy = true }
}

resource "google_service_account" "runtime" {
  project      = var.backend_project_id
  account_id   = "vibeestimate-runtime"
  display_name = "VibeEstimate production runtime"
}
resource "google_service_account" "build" {
  project      = var.backend_project_id
  account_id   = "vibeestimate-build"
  display_name = "VibeEstimate application image builder"
}
resource "google_service_account" "delivery" {
  project      = var.backend_project_id
  account_id   = "vibeestimate-delivery"
  display_name = "VibeEstimate authenticated review task delivery"
}

resource "google_project_iam_custom_role" "gemini" {
  project     = var.backend_project_id
  role_id     = "vibeestimateGeminiCaller"
  title       = "VibeEstimate publisher model inference"
  permissions = ["aiplatform.endpoints.predict", "serviceusage.services.use"]
}
resource "google_project_iam_member" "runtime_model" {
  project = var.backend_project_id
  role    = google_project_iam_custom_role.gemini.name
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_project_iam_member" "runtime_tasks" {
  project = var.backend_project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_service_account_iam_member" "enqueue_as_delivery" {
  service_account_id = google_service_account.delivery.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_artifact_registry_repository" "application" {
  project       = var.backend_project_id
  location      = var.region
  repository_id = "vibeestimate"
  format        = "DOCKER"
  labels        = local.labels
  lifecycle { prevent_destroy = true }
}
resource "google_artifact_registry_repository_iam_member" "build" {
  project    = var.backend_project_id
  location   = var.region
  repository = google_artifact_registry_repository.application.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.build.email}"
}
resource "google_storage_bucket" "source" {
  project                     = var.backend_project_id
  name                        = "vibeestimate-build-${var.project_number}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels
  lifecycle_rule {
    condition { age = 7 }
    action { type = "Delete" }
  }
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket_iam_member" "build_source" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build.email}"
}
resource "google_project_iam_member" "build_logs" {
  project = var.backend_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build.email}"
}


resource "google_cloud_tasks_queue" "reviews" {
  project  = var.backend_project_id
  location = var.region
  name     = "vibeestimate-reviews"
  rate_limits {
    max_concurrent_dispatches = 4
    max_dispatches_per_second = 2
  }
  retry_config {
    max_attempts       = 20
    max_retry_duration = "300s"
    min_backoff        = "2s"
    max_backoff        = "30s"
    max_doublings      = 4
  }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count      = local.deploy ? 1 : 0
  project    = var.backend_project_id
  location   = var.region
  name       = "vibeestimate"
  role       = "roles/run.invoker"
  member     = "allUsers"
  depends_on = [google_project_service.required]
}
resource "google_cloud_scheduler_job" "reconcile" {
  count     = local.deploy ? 1 : 0
  project   = var.backend_project_id
  region    = var.region
  name      = "vibeestimate-review-recovery"
  schedule  = "* * * * *"
  time_zone = "Etc/UTC"
  paused    = var.pause_room_recovery
  http_target {
    uri         = "${local.origin}/internal/reconcile"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.delivery.email
      audience              = local.origin
    }
  }
  depends_on = [google_cloud_run_v2_service_iam_member.public]
}

output "public_url" { value = local.origin }
output "source_bucket" { value = google_storage_bucket.source.name }
output "build_identity" { value = google_service_account.build.name }
output "image_repository" { value = "${var.region}-docker.pkg.dev/${var.backend_project_id}/${google_artifact_registry_repository.application.repository_id}/application" }
