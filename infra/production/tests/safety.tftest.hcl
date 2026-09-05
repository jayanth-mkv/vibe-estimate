# Mock providers: these tests make no cloud API call and create no infrastructure.
mock_provider "google" {}
mock_provider "restful" {}

# The Firebase config resource is adopted by an `import` block, which a mock
# provider cannot service. Override it so the tests still check the configured
# request shape and the merged domain list.
override_resource {
  override_during = plan
  target          = restful_resource.auth_domains
  values          = { id = "/projects/example-firebase/config" }
}

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
  target          = google_project_iam_custom_role.firebase_auth
  values          = { name = "projects/example-firebase/roles/vibeestimateAuthVerifier" }
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

override_resource {
  override_during = plan
  target          = google_secret_manager_secret.web_config
  values          = { id = "projects/example-backend/secrets/vibeestimate-web-config" }
}

variables {
  backend_project_id    = "example-backend"
  firebase_project_id   = "example-firebase"
  project_number        = "123456789012"
  region                = "asia-southeast1"
  firestore_database_id = "(default)"
  gemini_model          = "synthetic-model"
  existing_auth_domains = ["localhost", "example-firebase.firebaseapp.com", "example-firebase.web.app"]
  extra_auth_domains    = []
  access_token          = "synthetic-mock-token-never-used-for-cloud"
  firebase_web_config   = "{\"apiKey\":\"synthetic-public-sdk-key\",\"appId\":\"synthetic-app\",\"authDomain\":\"example-firebase.firebaseapp.com\",\"projectId\":\"example-firebase\"}"
  image                 = "asia-southeast1-docker.pkg.dev/example-backend/example/application@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

run "the_runtime_identity_gets_scoped_roles_and_no_project_administration" {
  command = plan

  assert {
    condition = (
      toset(google_project_iam_custom_role.firebase_auth.permissions) == toset(["firebaseauth.users.get"]) &&
      toset(google_project_iam_custom_role.gemini.permissions) == toset(["aiplatform.endpoints.predict", "serviceusage.services.use"])
    )
    error_message = "Custom roles must stay limited to revocation checks and publisher-model inference."
  }
  assert {
    condition = alltrue([
      for binding in values(google_project_iam_member.firebase) :
      binding.project == var.firebase_project_id && binding.member == "serviceAccount:${google_service_account.runtime.email}"
    ])
    error_message = "Firebase-side bindings must grant only the runtime identity in the Firebase project."
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
  assert {
    condition = (
      google_secret_manager_secret_iam_member.web_config.role == "roles/secretmanager.secretAccessor" &&
      google_secret_manager_secret_iam_member.web_config.member == "serviceAccount:${google_service_account.runtime.email}"
    )
    error_message = "Only the runtime identity may read the browser SDK configuration secret."
  }
}

run "the_browser_config_secret_never_stores_its_payload_in_state" {
  command = plan

  assert {
    condition = (
      google_secret_manager_secret.web_config.secret_id == "vibeestimate-web-config" &&
      length(google_secret_manager_secret.web_config.replication[0].auto) == 1
    )
    error_message = "The browser SDK configuration must live in the named automatically replicated secret."
  }
  assert {
    condition     = google_secret_manager_secret_version.web_config.secret_data == null && google_secret_manager_secret_version.web_config.deletion_policy == "ABANDON"
    error_message = "The secret version must use the write-only argument, leaving no payload in state, and must abandon rather than destroy versions."
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
      google_cloud_scheduler_job.reconcile[0].http_target[0].uri == "https://vibeestimate-${var.project_number}.${var.region}.run.app/internal/reconcile" &&
      google_cloud_scheduler_job.reconcile[0].http_target[0].oidc_token[0].service_account_email == google_service_account.delivery.email
    )
    error_message = "Recovery must call this service's own origin with a verified OIDC identity, never an unauthenticated request."
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

run "authorized_domains_add_this_service_and_keep_every_existing_one" {
  command = plan
  variables {
    extra_auth_domains = ["app.example.com"]
  }

  assert {
    condition = (
      alltrue([for domain in var.existing_auth_domains : contains(restful_resource.auth_domains.body.authorizedDomains, domain)]) &&
      contains(restful_resource.auth_domains.body.authorizedDomains, "vibeestimate-${var.project_number}.${var.region}.run.app") &&
      contains(restful_resource.auth_domains.body.authorizedDomains, "app.example.com") &&
      length(distinct(restful_resource.auth_domains.body.authorizedDomains)) == length(restful_resource.auth_domains.body.authorizedDomains)
    )
    error_message = "Every discovered domain must survive, this service's hostname must be present, and the list must not contain duplicates."
  }
  assert {
    condition = (
      restful_resource.auth_domains.update_method == "PATCH" &&
      restful_resource.auth_domains.merge_patch_disabled &&
      contains(restful_resource.auth_domains.update_query.updateMask, "authorizedDomains") &&
      toset(restful_resource.auth_domains.output_attrs) == toset(["authorizedDomains"])
    )
    error_message = "Only authorizedDomains may be read and patched; sign-in providers and hashing configuration must stay untouched."
  }
}

run "reject_a_domain_that_is_a_url_rather_than_a_hostname" {
  command = plan
  variables {
    extra_auth_domains = ["https://app.example.com/path"]
  }
  expect_failures = [var.extra_auth_domains]
}

run "reject_a_wildcard_domain" {
  command = plan
  variables {
    extra_auth_domains = ["*.example.com"]
  }
  expect_failures = [var.extra_auth_domains]
}
