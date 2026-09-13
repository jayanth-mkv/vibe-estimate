# Mock provider: these tests make no cloud API call and create no infrastructure.
mock_provider "google" {}

variables {
  backend_project_id          = "example-backend"
  firebase_project_id         = "example-firebase"
  project_number              = "123456789012"
  region                      = "asia-southeast1"
  firestore_database_id       = "(default)"
  gemini_model                = "synthetic-model"
  runtime_service_account     = "example-runtime@example-backend.iam.gserviceaccount.com"
  task_queue                  = "projects/example-backend/locations/asia-southeast1/queues/example-reviews"
  task_service_account        = "example-task@example-backend.iam.gserviceaccount.com"
  firebase_web_config_secret  = "example-web-config"
  firebase_web_config_version = "1"
  image                       = "asia-southeast1-docker.pkg.dev/example-backend/example/application@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

run "this_root_owns_only_the_protected_existing_service" {
  command = plan

  assert {
    condition = (
      google_cloud_run_v2_service.application.name == "vibeestimate" &&
      google_cloud_run_v2_service.application.project == var.backend_project_id &&
      google_cloud_run_v2_service.application.location == var.region &&
      google_cloud_run_v2_service.application.deletion_protection &&
      google_cloud_run_v2_service.application.ingress == "INGRESS_TRAFFIC_ALL"
    )
    error_message = "The release root must target the one existing protected service in the verified project and region."
  }
  assert {
    condition     = google_cloud_run_v2_service.application.labels["dev-tutorial"] == "cloud-run-ai-challenge" && google_cloud_run_v2_service.application.labels["managed-by"] == "terraform"
    error_message = "The challenge and ownership labels must stay on the deployed service."
  }
}

run "only_an_immutable_digest_is_deployed" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.application.template[0].containers[0].image == var.image
    error_message = "The service must deploy exactly the verified image input."
  }
  assert {
    condition = (
      google_cloud_run_v2_service.application.template[0].service_account == var.runtime_service_account &&
      google_cloud_run_v2_service.application.template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.application.template[0].scaling[0].max_instance_count == 2 &&
      google_cloud_run_v2_service.application.template[0].containers[0].ports[0].container_port == 8080 &&
      google_cloud_run_v2_service.application.template[0].containers[0].startup_probe[0].http_get[0].path == "/health"
    )
    error_message = "The existing runtime identity, scale-to-zero bound, container port and health probe must be preserved."
  }
}

run "reject_a_mutable_image_reference" {
  command = plan
  variables {
    image = "asia-southeast1-docker.pkg.dev/example-backend/example/application:latest"
  }
  expect_failures = [var.image]
}

run "reject_an_image_from_another_project" {
  command = plan
  variables {
    image = "asia-southeast1-docker.pkg.dev/other-backend/example/application@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  expect_failures = [var.image]
}

run "runtime_calls_vertex_with_its_own_identity_and_no_key" {
  command = plan

  assert {
    condition = alltrue([
      for name in ["APP_ENV", "NODE_ENV", "AI_PROVIDER", "GEMINI_TRANSPORT", "VERTEX_AUTH_MODE", "FRONTEND_ORIGIN"] :
      length([for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env if env.name == name]) == 1
    ])
    error_message = "The production runtime settings must all be present exactly once."
  }
  assert {
    condition = alltrue([
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env.name == "GEMINI_TRANSPORT" ? env.value == "vertex" : true
    ])
    error_message = "Production must call Gemini through Vertex, not the Developer API."
  }
  assert {
    condition = length([
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env if can(regex("(?i)(api_key|apikey|token|password|credential|secret_data)", env.name)) && env.value != null && env.value != ""
    ]) == 0
    error_message = "No credential may be supplied to the service as a plain environment value."
  }
}

run "the_frontend_origin_is_this_service_own_url" {
  command = plan

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env.name == "FRONTEND_ORIGIN" && env.value == "https://vibeestimate-${var.project_number}.${var.region}.run.app"
    ])
    error_message = "One Cloud Run origin serves the frontend and the API, so FRONTEND_ORIGIN must be this service's own URL."
  }
}

run "event_delivery_uses_the_dedicated_firebase_project_identity" {
  command = plan
  variables { event_delivery_enabled = true }

  assert {
    condition = [
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env.value if env.name == "ROOM_EVENT_SERVICE_ACCOUNT"
    ] == ["vibeestimate-events@${var.firebase_project_id}.iam.gserviceaccount.com"]
    error_message = "Event delivery must trust exactly the dedicated event identity in the configured Firebase project."
  }
  assert {
    condition = [
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env.value if env.name == "ROOM_EVENT_AUDIENCE"
    ] == ["https://vibeestimate-${var.project_number}.${var.region}.run.app"]
    error_message = "An absent explicit audience must retain the existing workflow audience."
  }
}

run "direct_eventarc_can_use_its_exact_canonical_service_audience" {
  command = plan
  variables {
    event_delivery_enabled  = true
    event_delivery_audience = "https://vibeestimate-example-as.a.run.app"
  }
  assert {
    condition = (
      [for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env.value if env.name == "ROOM_EVENT_AUDIENCE"] == [var.event_delivery_audience] &&
      [for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env.value if env.name == "FRONTEND_ORIGIN"] == ["https://vibeestimate-${var.project_number}.${var.region}.run.app"] &&
      [for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env.value if env.name == "ROOM_TASK_SERVICE_ACCOUNT"] == [var.task_service_account]
    )
    error_message = "Only Eventarc verification may use the separately configured audience; task and frontend settings stay unchanged."
  }
}

run "reject_event_audience_without_event_delivery" {
  command = plan
  variables { event_delivery_audience = "https://service.run.app" }
  expect_failures = [var.event_delivery_audience]
}

run "reject_event_audience_with_a_path" {
  command = plan
  variables {
    event_delivery_enabled  = true
    event_delivery_audience = "https://service.run.app/internal/firestore"
  }
  expect_failures = [var.event_delivery_audience]
}

run "reject_event_audience_outside_native_cloud_run" {
  command = plan
  variables {
    event_delivery_enabled  = true
    event_delivery_audience = "https://service.run.app.unrelated.example"
  }
  expect_failures = [var.event_delivery_audience]
}

run "ordinary_releases_keep_api_access_and_legacy_delivery_until_explicit_cutover" {
  command = plan
  assert {
    condition = (
      length([for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env if env.name == "ROOM_EVENT_SERVICE_ACCOUNT"]) == 0 &&
      length([for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env if env.name == "ROOM_EVENT_AUDIENCE"]) == 0 &&
      [for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env.value if env.name == "APP_MAINTENANCE"] == ["false"]
    )
    error_message = "Neither maintenance nor event delivery may be enabled implicitly during the preparatory release."
  }
}

run "migration_maintenance_is_an_explicit_reversible_runtime_setting" {
  command = plan
  variables { maintenance_mode = true }
  assert {
    condition     = [for env in google_cloud_run_v2_service.application.template[0].containers[0].env : env.value if env.name == "APP_MAINTENANCE"] == ["true"]
    error_message = "The frozen-copy stage must block application mutations through its explicit maintenance setting."
  }
}

run "the_browser_sdk_config_arrives_by_pinned_secret_version" {
  command = plan

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.application.template[0].containers[0].env :
      env.name == "FIREBASE_WEB_CONFIG" &&
      length(env.value_source) == 1 &&
      env.value_source[0].secret_key_ref[0].secret == var.firebase_web_config_secret &&
      env.value_source[0].secret_key_ref[0].version == var.firebase_web_config_version &&
      (env.value == null || env.value == "")
    ])
    error_message = "The browser SDK configuration must come from the existing secret at a pinned numeric version, never as an inline value."
  }
}

run "reject_a_floating_secret_version" {
  command = plan
  variables {
    firebase_web_config_version = "latest"
  }
  expect_failures = [var.firebase_web_config_version]
}

run "reject_a_placeholder_project" {
  command = plan
  variables {
    backend_project_id = "demo-backend"
  }
  expect_failures = [var.backend_project_id]
}

run "reject_a_task_queue_outside_the_service_project_and_region" {
  command = plan
  variables {
    task_queue = "projects/other-backend/locations/us-central1/queues/example-reviews"
  }
  expect_failures = [var.task_queue]
}
