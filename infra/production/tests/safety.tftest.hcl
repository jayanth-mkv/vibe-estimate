# Mock providers: these tests make no cloud API call and create no infrastructure.
mock_provider "google" {}

# Identities and custom roles are referenced by the bindings under test, so they
# need values a mock provider would otherwise only produce at apply time.
override_resource {
  override_during = plan
  target          = google_service_account.runtime
  values          = { email = "example-runtime@example-backend.iam.gserviceaccount.com", name = "projects/example-backend/serviceAccounts/example-runtime@example-backend.iam.gserviceaccount.com" }
}

override_resource {
  override_during = plan
  target          = google_service_account.build
  values          = { email = "example-build@example-backend.iam.gserviceaccount.com", name = "projects/example-backend/serviceAccounts/example-build@example-backend.iam.gserviceaccount.com" }
}

override_resource {
  override_during = plan
  target          = google_service_account.delivery
  values          = { email = "example-delivery@example-backend.iam.gserviceaccount.com", name = "projects/example-backend/serviceAccounts/example-delivery@example-backend.iam.gserviceaccount.com" }
}

override_resource {
  override_during = plan
  target          = google_project_iam_custom_role.gemini
  values          = { name = "projects/example-backend/roles/vibeestimateGeminiCaller" }
}

override_resource {
  override_during = plan
  target          = google_artifact_registry_repository.application
  values          = { name = "vibeestimate" }
}

variables {
  backend_project_id = "example-backend"
  project_number     = "123456789012"
  region             = "asia-southeast1"
  access_token       = "synthetic-mock-token-never-used-for-cloud"
  image              = "asia-southeast1-docker.pkg.dev/example-backend/example/application@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

run "the_runtime_identity_gets_scoped_roles_and_no_project_administration" {
  command = plan

  assert {
    condition = (
      toset(google_project_iam_custom_role.gemini.permissions) == toset(["aiplatform.endpoints.predict", "serviceusage.services.use"])
    )
    error_message = "The backend custom role must stay limited to publisher-model inference; Firebase IAM belongs to the Firebase root."
  }
  assert {
    condition = (
      google_service_account_iam_member.enqueue_as_delivery.role == "roles/iam.serviceAccountUser" &&
      google_service_account_iam_member.enqueue_as_delivery.member == "serviceAccount:${google_service_account.runtime.email}" &&
      google_project_iam_member.runtime_tasks.role == "roles/cloudtasks.enqueuer"
    )
    error_message = "The runtime may enqueue tasks and act as the delivery identity only; no token-creator or project-wide grant is allowed."
  }
}

run "the_builder_may_publish_images_and_logs_but_not_read_secrets" {
  command = plan

  assert {
    condition = (
      google_artifact_registry_repository_iam_member.build.role == "roles/artifactregistry.writer" &&
      google_artifact_registry_repository_iam_member.build.member == "serviceAccount:${google_service_account.build.email}" &&
      google_project_iam_member.build_logs.role == "roles/logging.logWriter"
    )
    error_message = "The image builder must be limited to writing this repository and its build logs."
  }
}

run "storage_is_private_and_the_source_bucket_expires_its_objects" {
  command = plan

  assert {
    condition = (
      google_storage_bucket.source.uniform_bucket_level_access &&
      google_storage_bucket.source.public_access_prevention == "enforced" &&
      anytrue([for rule in google_storage_bucket.source.lifecycle_rule : anytrue([for condition in rule.condition : condition.age == 7])])
    )
    error_message = "The build-source bucket must be private and keep its short retention rule; it is not suitable for Terraform state."
  }
}

run "review_delivery_retries_are_bounded_and_authenticated" {
  command = plan

  assert {
    condition = (
      google_cloud_tasks_queue.reviews.location == var.region &&
      google_cloud_tasks_queue.reviews.rate_limits[0].max_concurrent_dispatches == 4 &&
      google_cloud_tasks_queue.reviews.retry_config[0].max_attempts == 20 &&
      google_cloud_tasks_queue.reviews.retry_config[0].max_retry_duration == "300s"
    )
    error_message = "The review queue must keep bounded concurrency and a bounded retry window."
  }
  assert {
    condition = (
      google_cloud_scheduler_job.reconcile[0].paused &&
      google_cloud_scheduler_job.reconcile[0].schedule == "* * * * *" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].uri == "https://vibeestimate-${var.project_number}.${var.region}.run.app/internal/reconcile" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].oidc_token[0].service_account_email == google_service_account.delivery.email
    )
    error_message = "Periodic recovery must remain paused by default while preserving the service-scoped OIDC target."
  }
}

run "explicit_recovery_override_preserves_the_existing_authenticated_target" {
  command = plan
  variables {
    pause_room_recovery = false
  }

  assert {
    condition = (
      length(google_cloud_scheduler_job.reconcile) == 1 &&
      !google_cloud_scheduler_job.reconcile[0].paused &&
      google_cloud_scheduler_job.reconcile[0].name == "vibeestimate-review-recovery" &&
      google_cloud_scheduler_job.reconcile[0].schedule == "* * * * *" &&
      google_cloud_scheduler_job.reconcile[0].time_zone == "Etc/UTC" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].http_method == "POST" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].uri == "https://vibeestimate-${var.project_number}.${var.region}.run.app/internal/reconcile" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].oidc_token[0].service_account_email == google_service_account.delivery.email &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].oidc_token[0].audience == "https://vibeestimate-${var.project_number}.${var.region}.run.app"
    )
    error_message = "An explicit recovery override must preserve the existing schedule, endpoint and OIDC identity."
  }
}

run "without_a_verified_image_no_public_access_or_scheduler_is_created" {
  command = plan
  variables {
    image = ""
  }

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public) == 0 && length(google_cloud_scheduler_job.reconcile) == 0
    error_message = "Public invocation and the recovery scheduler must not exist before a verified image is deployed."
  }
}

run "reject_a_mutable_image_reference" {
  command = plan
  variables {
    image = "asia-southeast1-docker.pkg.dev/example-backend/example/application:latest"
  }
  expect_failures = [var.image]
}
