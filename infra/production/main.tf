terraform {
  required_version = ">= 1.13.5, < 2.0.0"
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

variable "backend_project_id" { type = string }
variable "firebase_project_id" { type = string }
variable "project_number" { type = string }
variable "region" { type = string }
variable "existing_auth_domains" { type = list(string) }
variable "firestore_database_id" { type = string }
variable "gemini_model" { type = string }
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
}
variable "firebase_web_config" {
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
provider "restful" {
  base_url = "https://identitytoolkit.googleapis.com/admin/v2"
  security = { http = { token = { token = var.access_token } } }
  header   = { "X-Goog-User-Project" = var.firebase_project_id }
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

resource "google_project_iam_custom_role" "firebase_auth" {
  project     = var.firebase_project_id
  role_id     = "vibeestimateAuthVerifier"
  title       = "VibeEstimate token revocation checks"
  permissions = ["firebaseauth.users.get"]
}
resource "google_project_iam_member" "firebase" {
  for_each = { firestore = "roles/datastore.user", quota = "roles/serviceusage.serviceUsageConsumer", auth = google_project_iam_custom_role.firebase_auth.name }
  project  = var.firebase_project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"
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

# Public browser SDK configuration is injected at runtime, never placed in
# the repository, image build context or Terraform state. This is not a Gemini key.
resource "google_secret_manager_secret" "web_config" {
  project   = var.backend_project_id
  secret_id = "vibeestimate-web-config"
  labels    = local.labels
  replication {
    auto {}
  }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_version" "web_config" {
  secret                 = google_secret_manager_secret.web_config.id
  secret_data_wo         = var.firebase_web_config
  secret_data_wo_version = 1
  deletion_policy        = "ABANDON"
}
resource "google_secret_manager_secret_iam_member" "web_config" {
  project   = var.backend_project_id
  secret_id = google_secret_manager_secret.web_config.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Import only authorizedDomains, with a partial GET and PATCH. Never retrieve
# password hashing configuration or adopt/change the existing sign-in providers.
resource "restful_resource" "auth_domains" {
  path                 = "/projects/${var.firebase_project_id}/config"
  read_query           = { fields = ["authorizedDomains"] }
  query                = { fields = ["authorizedDomains"] }
  update_method        = "PATCH"
  merge_patch_disabled = true
  update_query         = { updateMask = ["authorizedDomains"], fields = ["authorizedDomains"] }
  body                 = { authorizedDomains = distinct(concat(var.existing_auth_domains, [local.host])) }
  output_attrs         = ["authorizedDomains"]
  lifecycle { prevent_destroy = true }
}
import {
  to = restful_resource.auth_domains
  id = jsonencode({
    id    = "/projects/${var.firebase_project_id}/config", path = "/projects/${var.firebase_project_id}/config",
    query = { fields = ["authorizedDomains"] }, body = { authorizedDomains = null }
  })
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

resource "google_cloud_run_v2_service" "application" {
  count               = local.deploy ? 1 : 0
  project             = var.backend_project_id
  name                = "vibeestimate"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels
  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "120s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "2", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      startup_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 2
        period_seconds        = 3
        failure_threshold     = 30
      }
      dynamic "env" {
        for_each = {
          APP_ENV                    = "production", NODE_ENV = "production", AI_PROVIDER = "gemini",
          GEMINI_TRANSPORT           = "vertex", GEMINI_MODEL = var.gemini_model, VERTEX_AUTH_MODE = "runtime",
          VERTEX_PROJECT_ID          = var.backend_project_id, VERTEX_LOCATION = "global",
          FIREBASE_PROJECT_ID        = var.firebase_project_id, FIRESTORE_DATABASE_ID = var.firestore_database_id,
          GOOGLE_CLOUD_QUOTA_PROJECT = var.firebase_project_id, FRONTEND_ORIGIN = local.origin,
          ROOM_TASK_QUEUE            = google_cloud_tasks_queue.reviews.id, ROOM_TASK_SERVICE_ACCOUNT = google_service_account.delivery.email
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "FIREBASE_WEB_CONFIG"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.web_config.secret_id
            version = google_secret_manager_secret_version.web_config.version
          }
        }
      }
    }
  }
  depends_on = [google_project_service.required, google_project_iam_member.firebase, google_project_iam_member.runtime_model, google_secret_manager_secret_iam_member.web_config]
}
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = local.deploy ? 1 : 0
  project  = var.backend_project_id
  location = var.region
  name     = google_cloud_run_v2_service.application[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
resource "google_cloud_scheduler_job" "reconcile" {
  count     = local.deploy ? 1 : 0
  project   = var.backend_project_id
  region    = var.region
  name      = "vibeestimate-review-recovery"
  schedule  = "* * * * *"
  time_zone = "Etc/UTC"
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
