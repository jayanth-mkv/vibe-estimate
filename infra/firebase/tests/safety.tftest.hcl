mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  project_id                 = "example-app"
  access_token               = "unused-offline-test-token"
  firestore_location         = "asia-southeast1"
  runtime_region             = "asia-southeast1"
  authorized_domains         = ["example-app.firebaseapp.com", "app.example.com", "localhost"]
  web_config_secret_id       = "example-app-browser-config"
  firebase_web_config        = "{\"projectId\":\"example-app\",\"authDomain\":\"example-app.firebaseapp.com\",\"apiKey\":\"unused-test-key\",\"appId\":\"unused-test-app\",\"appNamespace\":\"main-app\",\"authMode\":\"google\"}"
  google_oauth_client_id     = "unused.apps.googleusercontent.com"
  google_oauth_client_secret = "unused-offline-test-secret"
}

run "firebase_resources_share_the_application_project_and_preserve_apis" {
  command = plan
  assert {
    condition = (
      google_firebase_project.destination.project == var.project_id &&
      toset(keys(google_project_service.destination)) == toset(["firestore.googleapis.com", "firebaserules.googleapis.com"]) &&
      alltrue([for api in google_project_service.destination : api.project == var.project_id && !api.disable_on_destroy]) &&
      google_project_service.signing["destination"].service == "iamcredentials.googleapis.com" &&
      !google_project_service.signing["destination"].disable_on_destroy
    )
    error_message = "Firebase must use the application project while preserving shared API activation."
  }
}

run "private_data_keeps_its_database_location_and_deny_all_client_rules" {
  command = plan
  assert {
    condition = (
      google_firestore_database.destination["destination"].project == var.project_id &&
      google_firestore_database.destination["destination"].name == "(default)" &&
      google_firestore_database.destination["destination"].location_id == var.firestore_location &&
      google_firestore_database.destination["destination"].type == "FIRESTORE_NATIVE" &&
      google_firestore_database.destination["destination"].delete_protection_state == "DELETE_PROTECTION_ENABLED" &&
      google_firestore_database.destination["destination"].deletion_policy == "ABANDON" &&
      strcontains(google_firebaserules_ruleset.destination["destination"].source[0].files[0].content, "allow read, write: if false;")
    )
    error_message = "The existing private database must keep its location, deletion protection and deny-all client rules."
  }
}

run "google_only_signin_preserves_accounts_and_explicit_domains" {
  command = plan
  assert {
    condition = (
      !google_identity_platform_config.destination["destination"].autodelete_anonymous_users &&
      !google_identity_platform_config.destination["destination"].sign_in[0].anonymous[0].enabled &&
      !google_identity_platform_config.destination["destination"].sign_in[0].email[0].enabled &&
      !google_identity_platform_config.destination["destination"].sign_in[0].phone_number[0].enabled &&
      google_identity_platform_default_supported_idp_config.google["destination"].enabled &&
      google_identity_platform_default_supported_idp_config.google["destination"].deletion_policy == "ABANDON" &&
      toset(google_identity_platform_config.destination["destination"].authorized_domains) == toset(var.authorized_domains)
    )
    error_message = "Google-only sign-in must retain saved accounts and all explicitly authorized production/development hosts."
  }
}

run "runtime_access_is_limited_to_firestore_auth_and_quota" {
  command = plan
  assert {
    condition = (
      toset(google_project_iam_custom_role.auth_verifier["destination"].permissions) == toset(["firebaseauth.users.get"]) &&
      toset(keys(google_project_iam_member.runtime_firebase)) == toset(["firestore", "auth", "quota"]) &&
      google_project_iam_member.runtime_firebase["firestore"].role == "roles/datastore.user" &&
      google_project_iam_member.runtime_firebase["quota"].role == "roles/serviceusage.serviceUsageConsumer" &&
      alltrue([for binding in google_project_iam_member.runtime_firebase : binding.project == var.project_id && binding.member == "serviceAccount:vibeestimate-runtime@${var.project_id}.iam.gserviceaccount.com"])
    )
    error_message = "The runtime needs only the selected project's Firestore, Auth-read and API-use grants."
  }
}

run "sdk_secret_uses_the_existing_configured_id_and_write_only_payload" {
  command = plan
  assert {
    condition = (
      google_secret_manager_secret.web_config["destination"].secret_id == var.web_config_secret_id &&
      google_secret_manager_secret_version.web_config["destination"].secret_data == null &&
      google_secret_manager_secret_version.web_config["destination"].deletion_policy == "ABANDON" &&
      google_secret_manager_secret_iam_member.web_config["destination"].role == "roles/secretmanager.secretAccessor" &&
      google_secret_manager_secret_iam_member.web_config["destination"].member == "serviceAccount:vibeestimate-runtime@${var.project_id}.iam.gserviceaccount.com"
    )
    error_message = "The active SDK secret must retain its explicitly configured ID, private write-only payload and runtime-only access."
  }
}

run "direct_events_are_document_scoped_and_service_authenticated" {
  command = plan
  assert {
    condition = (
      toset(keys(google_project_service.events)) == toset(["eventarc.googleapis.com", "eventarcpublishing.googleapis.com", "pubsub.googleapis.com"]) &&
      google_eventarc_trigger.outbox_created["destination"].project == var.project_id &&
      google_eventarc_trigger.outbox_created["destination"].location == var.firestore_location &&
      google_eventarc_trigger.outbox_created["destination"].event_data_content_type == "application/protobuf" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "type"]) == "google.cloud.firestore.document.v1.created" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "database"]) == "(default)" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "document"]) == "roomReviewOutbox/{jobId}" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.operator if filter.attribute == "document"]) == "match-path-pattern" &&
      google_eventarc_trigger.outbox_created["destination"].destination[0].cloud_run_service[0].service == "vibeestimate" &&
      google_eventarc_trigger.outbox_created["destination"].destination[0].cloud_run_service[0].path == "/internal/firestore" &&
      google_cloud_run_v2_service_iam_member.events["destination"].role == "roles/run.invoker" &&
      google_cloud_run_v2_service_iam_member.events["destination"].member == "serviceAccount:vibeestimate-events@${var.project_id}.iam.gserviceaccount.com" &&
      google_project_iam_member.event_receiver["destination"].role == "roles/eventarc.eventReceiver"
    )
    error_message = "Only created outbox documents may reach this project's API through its dedicated Eventarc identity."
  }
}

run "reject_an_emulator_project" {
  command = plan
  variables { project_id = "demo-example" }
  expect_failures = [var.project_id]
}

run "reject_missing_ephemeral_credentials" {
  command = plan
  variables { access_token = "" }
  expect_failures = [var.access_token]
}

run "reject_missing_database_location" {
  command = plan
  variables { firestore_location = "" }
  expect_failures = [var.firestore_location]
}

run "reject_sdk_config_for_another_project" {
  command = plan
  variables {
    firebase_web_config = "{\"projectId\":\"example-other\",\"authDomain\":\"example-other.firebaseapp.com\",\"apiKey\":\"unused\",\"appId\":\"unused\",\"authMode\":\"google\"}"
  }
  expect_failures = [var.firebase_web_config]
}

run "sdk_namespace_is_optional_and_not_tied_to_a_rollout" {
  command = plan
  variables {
    firebase_web_config = "{\"projectId\":\"example-app\",\"authDomain\":\"example-app.firebaseapp.com\",\"apiKey\":\"unused\",\"appId\":\"unused\",\"authMode\":\"google\"}"
  }
}

run "reject_invalid_sdk_namespace" {
  command = plan
  variables {
    firebase_web_config = "{\"projectId\":\"example-app\",\"authDomain\":\"example-app.firebaseapp.com\",\"apiKey\":\"unused\",\"appId\":\"unused\",\"authMode\":\"google\",\"appNamespace\":\"Invalid/Name\"}"
  }
  expect_failures = [var.firebase_web_config]
}

run "reject_missing_google_oauth_credentials" {
  command = plan
  variables { google_oauth_client_secret = "" }
  expect_failures = [var.google_oauth_client_secret]
}

run "reject_a_secret_path_instead_of_its_id" {
  command = plan
  variables { web_config_secret_id = "projects/example-app/secrets/example-config" }
  expect_failures = [var.web_config_secret_id]
}

run "authorized_domains_reject_schemes_and_ports" {
  command = plan
  variables { authorized_domains = ["example-app.firebaseapp.com", "http://localhost:3000"] }
  expect_failures = [var.authorized_domains]
}
