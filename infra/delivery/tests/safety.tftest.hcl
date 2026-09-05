mock_provider "google" {
  override_during = plan
}

override_resource {
  override_during = plan
  target          = google_project_iam_custom_role.release
  values          = { name = "projects/example-backend/roles/vibeestimateReleaseUpdater" }
}

override_resource {
  override_during = plan
  target          = google_project_iam_custom_role.release_operations
  values          = { name = "projects/example-backend/roles/vibeestimateReleaseOperations" }
}

override_resource {
  override_during = plan
  target          = google_cloudbuildv2_repository.application
  values          = { id = "projects/example-backend/locations/us-central1/connections/example/repositories/vibeestimate" }
}

variables {
  backend_project_id      = "example-backend"
  backend_region          = "asia-south1"
  connection_location     = "us-central1"
  cloud_build_connection  = "projects/example-backend/locations/us-central1/connections/example"
  github_repository       = "example-owner/example-repository"
  state_bucket_name       = "example-vibeestimate-runtime-state"
  image_repository        = "asia-south1-docker.pkg.dev/example-backend/images/api"
  build_service_account   = "example-builder@example-backend.iam.gserviceaccount.com"
  runtime_service_account = "example-runtime@example-backend.iam.gserviceaccount.com"
  access_token            = "synthetic-mock-token-never-used-for-cloud"
  runtime_variables = {
    backend_project_id          = "example-backend"
    firebase_project_id         = "example-firebase"
    project_number              = "123456789012"
    region                      = "asia-south1"
    firestore_database_id       = "(default)"
    gemini_model                = "synthetic-model"
    runtime_service_account     = "example-runtime@example-backend.iam.gserviceaccount.com"
    task_queue                  = "example-observer"
    task_service_account        = "example-task@example-backend.iam.gserviceaccount.com"
    firebase_web_config_secret  = "example-public-web-config"
    firebase_web_config_version = "1"
  }
}

run "main_push_uses_the_connected_repository_and_existing_builder" {
  command = plan

  assert {
    condition = (
      google_cloudbuild_trigger.main.filename == "cloudbuild.yaml" &&
      !google_cloudbuild_trigger.main.disabled &&
      google_cloudbuild_trigger.main.location == var.connection_location &&
      google_cloudbuild_trigger.main.service_account == "projects/${var.backend_project_id}/serviceAccounts/${var.build_service_account}" &&
      google_cloudbuild_trigger.main.repository_event_config[0].repository == google_cloudbuildv2_repository.application.id &&
      google_cloudbuild_trigger.main.repository_event_config[0].push[0].branch == "^main$" &&
      google_cloudbuild_trigger.main.repository_event_config[0].push[0].invert_regex != true &&
      length(google_cloudbuild_trigger.main.repository_event_config[0].pull_request) == 0 &&
      length(google_cloudbuild_trigger.main.build) == 0
    )
    error_message = "Only an exact main push through the connected repository may run the checked-in build file using the explicit existing build identity."
  }
  assert {
    condition = (
      google_cloudbuildv2_repository.application.project == var.backend_project_id &&
      google_cloudbuildv2_repository.application.location == var.connection_location &&
      google_cloudbuildv2_repository.application.parent_connection == var.cloud_build_connection &&
      google_cloudbuildv2_repository.application.remote_uri == "https://github.com/${var.github_repository}.git" &&
      toset(keys(google_cloudbuild_trigger.main.substitutions)) == toset(["_STATE_BUCKET", "_RUNTIME_VARS_B64", "_IMAGE_REPOSITORY", "_GITHUB_REPOSITORY"]) &&
      jsondecode(base64decode(google_cloudbuild_trigger.main.substitutions["_RUNTIME_VARS_B64"])) == var.runtime_variables
    )
    error_message = "Repository, connection location and bounded runtime metadata must remain explicit; backend and connection locations are independently configured."
  }
}

run "runtime_state_is_private_versioned_and_has_no_expiration" {
  command = plan

  assert {
    condition = (
      google_storage_bucket.runtime_state.project == var.backend_project_id &&
      lower(google_storage_bucket.runtime_state.location) == var.backend_region &&
      google_storage_bucket.runtime_state.uniform_bucket_level_access &&
      google_storage_bucket.runtime_state.public_access_prevention == "enforced" &&
      google_storage_bucket.runtime_state.versioning[0].enabled &&
      !google_storage_bucket.runtime_state.force_destroy &&
      length(google_storage_bucket.runtime_state.lifecycle_rule) == 0
    )
    error_message = "State must retain object versions in a private bucket without lifecycle expiry or forced deletion."
  }
  assert {
    condition = (
      google_storage_bucket_iam_member.runtime_state.bucket == google_storage_bucket.runtime_state.name &&
      google_storage_bucket_iam_member.runtime_state.role == "roles/storage.objectAdmin" &&
      google_storage_bucket_iam_member.runtime_state.member == "serviceAccount:${var.build_service_account}"
    )
    error_message = "The build identity may manage state objects only in the dedicated bucket, without project-wide storage administration."
  }
}

run "service_updates_are_scoped_and_project_permissions_are_read_only" {
  command = plan

  assert {
    condition = (
      toset(google_project_iam_custom_role.release.permissions) == toset(["run.services.get", "run.services.update"]) &&
      google_cloud_run_v2_service_iam_member.release.project == var.backend_project_id &&
      google_cloud_run_v2_service_iam_member.release.location == var.backend_region &&
      google_cloud_run_v2_service_iam_member.release.name == "vibeestimate" &&
      google_cloud_run_v2_service_iam_member.release.role == google_project_iam_custom_role.release.name &&
      google_cloud_run_v2_service_iam_member.release.member == "serviceAccount:${var.build_service_account}"
    )
    error_message = "The updater may get/update only the existing VibeEstimate service; it must not create/delete services, administer IAM or read secret payloads."
  }
  assert {
    condition = (
      toset(google_project_iam_custom_role.release_operations.permissions) == toset(["run.operations.get", "serviceusage.services.use"]) &&
      google_project_iam_member.release_operations.project == var.backend_project_id &&
      google_project_iam_member.release_operations.role == google_project_iam_custom_role.release_operations.name &&
      google_project_iam_member.release_operations.member == "serviceAccount:${var.build_service_account}"
    )
    error_message = "Project-wide permissions must remain limited to operation polling and API usage, without service updates or infrastructure/secret administration."
  }
  assert {
    condition = (
      google_service_account_iam_member.runtime_identity.service_account_id == "projects/${var.backend_project_id}/serviceAccounts/${var.runtime_service_account}" &&
      google_service_account_iam_member.runtime_identity.role == "roles/iam.serviceAccountUser" &&
      google_service_account_iam_member.runtime_identity.member == "serviceAccount:${var.build_service_account}"
    )
    error_message = "Act-as access must target only the explicit runtime identity, without token-creator or project-wide service-account grants."
  }
}
