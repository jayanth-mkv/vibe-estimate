resource "google_service_account" "build" {
  count        = var.create_cloudbuild_trigger ? 1 : 0
  project      = var.cloudbuild_project_id
  account_id   = "vibeestimate-build"
  display_name = "VibeEstimate image builder (no deployment permission)"
  depends_on   = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "build_push" {
  count      = var.create_cloudbuild_trigger ? 1 : 0
  project    = var.backend_project_id
  location   = var.region
  repository = google_artifact_registry_repository.backend[0].name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.build[0].email}"
}

resource "google_project_iam_member" "build_logs" {
  count   = var.create_cloudbuild_trigger ? 1 : 0
  project = var.cloudbuild_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build[0].email}"
}

resource "google_cloudbuild_trigger" "backend" {
  count           = var.create_cloudbuild_trigger ? 1 : 0
  project         = var.cloudbuild_project_id
  location        = var.cloudbuild_region
  name            = "vibeestimate-backend-build"
  description     = "Build and publish only; reviewed Terraform change deploys an immutable image digest."
  disabled        = !var.enable_cloudbuild_trigger
  filename        = "cloudbuild.yaml"
  service_account = google_service_account.build[0].id
  repository_event_config {
    repository = var.cloudbuild_repository
    push {
      branch = var.cloudbuild_branch_pattern
    }
  }
  included_files = ["backend/**", "package.json", "package-lock.json", "cloudbuild.yaml"]
  substitutions = {
    _IMAGE_REPOSITORY = "${var.region}-docker.pkg.dev/${var.backend_project_id}/vibeestimate/backend"
  }
  depends_on = [google_artifact_registry_repository_iam_member.build_push, google_project_iam_member.build_logs]
}
