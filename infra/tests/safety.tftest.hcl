# Mock provider: these tests make no cloud API calls and create no infrastructure.
mock_provider "google" {}

variables {
  backend_project_id    = "demo-vibe-api"
  firebase_project_id   = "demo-vibe-auth"
  cloudbuild_project_id = "demo-vibe-api"
}

run "local_defaults_create_nothing" {
  command = plan
  assert {
    condition     = length(google_project_service.required) == 0 && length(google_cloud_run_v2_service.backend) == 0 && length(google_secret_manager_secret.gemini) == 0 && length(google_cloudbuild_trigger.backend) == 0
    error_message = "Local setup must not create infrastructure, secrets, deployments, or triggers by default."
  }
  assert {
    condition     = output.project_mapping.firebase == "demo-vibe-auth" && output.project_mapping.cloudbuild == "demo-vibe-api"
    error_message = "The distinct user-supplied Firebase and Cloud Build projects must remain explicit."
  }
}

run "reject_deployment_without_infrastructure" {
  command = plan
  variables {
    deploy_backend        = true
    backend_image         = "asia-south1-docker.pkg.dev/demo-vibe-api/vibeestimate/backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    frontend_origins      = ["https://vibeestimate.example.com"]
    gemini_model          = "test-only-model"
    gemini_secret_version = "1"
  }
  expect_failures = [var.deploy_backend]
}

run "reject_placeholder_image" {
  command = plan
  variables {
    provision_backend_infrastructure = true
    deploy_backend                   = true
    backend_image                    = "us-docker.pkg.dev/cloudrun/container/hello"
    frontend_origins                 = ["https://vibeestimate.example.com"]
    gemini_model                     = "test-only-model"
    gemini_secret_version            = "1"
  }
  expect_failures = [var.backend_image]
}

run "reject_trigger_without_repository" {
  command = plan
  variables {
    provision_backend_infrastructure = true
    create_cloudbuild_trigger        = true
  }
  expect_failures = [var.cloudbuild_repository]
}

run "backend_is_bounded_and_secret_scoped" {
  command = plan
  variables {
    provision_backend_infrastructure = true
    deploy_backend                   = true
    backend_image                    = "asia-south1-docker.pkg.dev/demo-vibe-api/vibeestimate/backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    frontend_origins                 = ["https://vibeestimate.example.com"]
    gemini_model                     = "test-only-model"
    gemini_secret_version            = "1"
  }
  assert {
    condition     = google_cloud_run_v2_service.backend[0].template[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.backend[0].template[0].scaling[0].max_instance_count == 1 && google_cloud_run_v2_service.backend[0].scaling[0].max_instance_count == 1
    error_message = "Cloud Run must scale to zero and default to one maximum instance."
  }
  assert {
    condition     = google_cloud_run_v2_service.backend[0].labels["dev-tutorial"] == "cloud-run-ai-challenge"
    error_message = "Keep the required codelab label."
  }
  assert {
    condition     = google_project_iam_member.runtime_firestore[0].project == "demo-vibe-auth" && google_project_iam_member.runtime_firestore[0].role == "roles/datastore.user" && google_secret_manager_secret_iam_member.runtime_gemini[0].role == "roles/secretmanager.secretAccessor"
    error_message = "Runtime access must target the Firebase project and dedicated Gemini secret."
  }
}
