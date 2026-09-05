locals {
  labels = {
    app          = "vibeestimate"
    environment  = "ideathon"
    managed-by   = "terraform"
    dev-tutorial = "cloud-run-ai-challenge"
  }
  backend_apis = var.provision_backend_infrastructure ? {
    for api in ["run.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "serviceusage.googleapis.com"] :
    "${var.backend_project_id}/${api}" => { project = var.backend_project_id, service = api }
  } : {}
  firebase_apis = var.provision_backend_infrastructure ? {
    "${var.firebase_project_id}/firestore.googleapis.com" = { project = var.firebase_project_id, service = "firestore.googleapis.com" }
  } : {}
  build_apis = var.create_cloudbuild_trigger ? {
    for api in ["cloudbuild.googleapis.com", "iam.googleapis.com", "logging.googleapis.com"] :
    "${var.cloudbuild_project_id}/${api}" => { project = var.cloudbuild_project_id, service = api }
  } : {}
  runtime_email = "vibeestimate-runtime@${var.backend_project_id}.iam.gserviceaccount.com"
  build_email   = "vibeestimate-build@${var.cloudbuild_project_id}.iam.gserviceaccount.com"
}

resource "google_project_service" "required" {
  for_each           = merge(local.backend_apis, local.firebase_apis, local.build_apis)
  project            = each.value.project
  service            = each.value.service
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "backend" {
  count         = var.provision_backend_infrastructure ? 1 : 0
  project       = var.backend_project_id
  location      = var.region
  repository_id = "vibeestimate"
  description   = "Tested VibeEstimate backend images; immutable digest deployment."
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.required]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "runtime" {
  count        = var.provision_backend_infrastructure ? 1 : 0
  project      = var.backend_project_id
  account_id   = "vibeestimate-runtime"
  display_name = "VibeEstimate backend runtime"
  depends_on   = [google_project_service.required]
}

resource "google_project_iam_member" "runtime_firestore" {
  count   = var.provision_backend_infrastructure ? 1 : 0
  project = var.firebase_project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime[0].email}"
}

resource "google_secret_manager_secret" "gemini" {
  count     = var.provision_backend_infrastructure ? 1 : 0
  project   = var.backend_project_id
  secret_id = "vibeestimate-gemini-api-key"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_gemini" {
  count     = var.provision_backend_infrastructure ? 1 : 0
  project   = var.backend_project_id
  secret_id = google_secret_manager_secret.gemini[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[0].email}"
}

# A sensitive-only variable still persists in state. This resource intentionally
# uses an ephemeral variable plus the provider's write-only attribute instead.
resource "google_secret_manager_secret_version" "gemini" {
  count                  = var.write_gemini_secret_version ? 1 : 0
  secret                 = google_secret_manager_secret.gemini[0].id
  secret_data_wo         = var.gemini_api_key
  secret_data_wo_version = var.gemini_secret_rotation
  deletion_policy        = "ABANDON"
}
