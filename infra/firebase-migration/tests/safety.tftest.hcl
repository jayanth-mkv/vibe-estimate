mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  target_project_id = "example-backend"
  access_token      = "unused-offline-test-token"
}

run "bootstrap_preserves_the_existing_project_and_limits_api_activation" {
  command = plan
  assert {
    condition = (
      google_firebase_project.destination.project == var.target_project_id &&
      toset(keys(google_project_service.destination)) == toset(["firestore.googleapis.com", "firebaserules.googleapis.com"]) &&
      alltrue([for api in google_project_service.destination : api.project == var.target_project_id && !api.disable_on_destroy])
    )
    error_message = "Bootstrap must adopt the existing destination and enable only the Firestore and Rules prerequisites without disabling shared APIs."
  }
}

run "reject_an_emulator_destination" {
  command = plan
  variables { target_project_id = "demo-example" }
  expect_failures = [var.target_project_id]
}

run "reject_missing_ephemeral_credentials" {
  command = plan
  variables { access_token = "" }
  expect_failures = [var.access_token]
}

run "bootstrap_does_not_initialize_database_auth_secrets_or_events" {
  command = plan
  assert {
    condition = (
      length(google_firestore_database.destination) == 0 &&
      length(google_identity_platform_config.destination) == 0 &&
      length(google_firebase_web_app.destination) == 0 &&
      length(google_secret_manager_secret.web_config) == 0 &&
      length(google_eventarc_trigger.outbox_created) == 0
    )
    error_message = "Bootstrap must leave all foundation and delivery resources disabled."
  }
}

run "foundation_protects_private_data_and_uses_minimum_runtime_permissions" {
  command = plan
  variables {
    enable_foundation  = true
    firestore_location = "asia-southeast1"
    authorized_domains = ["example-backend.firebaseapp.com", "app.example.com"]
  }
  assert {
    condition = (
      google_firestore_database.destination["destination"].project == var.target_project_id &&
      google_firestore_database.destination["destination"].name == "(default)" &&
      google_firestore_database.destination["destination"].location_id == var.firestore_location &&
      google_firestore_database.destination["destination"].type == "FIRESTORE_NATIVE" &&
      google_firestore_database.destination["destination"].delete_protection_state == "DELETE_PROTECTION_ENABLED" &&
      google_firestore_database.destination["destination"].deletion_policy == "ABANDON" &&
      strcontains(google_firebaserules_ruleset.destination["destination"].source[0].files[0].content, "allow read, write: if false;")
    )
    error_message = "The exact destination database must retain its chosen location, deletion protection, and deny-all browser rules."
  }
  assert {
    condition = (
      google_identity_platform_config.destination["destination"].autodelete_anonymous_users == false &&
      google_identity_platform_config.destination["destination"].sign_in[0].anonymous[0].enabled &&
      google_identity_platform_config.destination["destination"].sign_in[0].email[0].enabled &&
      google_identity_platform_config.destination["destination"].sign_in[0].email[0].password_required &&
      length(google_identity_platform_default_supported_idp_config.google) == 0 &&
      length(google_secret_manager_secret_version.web_config) == 0 &&
      google_secret_manager_secret.web_config["destination"].secret_id == "vibeestimate-migrated-web-config"
    )
    error_message = "Foundation must retain anonymous accounts and stage Google OAuth and SDK payload separately without colliding with the original secret."
  }
  assert {
    condition = (
      toset(google_project_iam_custom_role.auth_verifier["destination"].permissions) == toset(["firebaseauth.users.get"]) &&
      toset(google_project_iam_custom_role.self_signer["destination"].permissions) == toset(["iam.serviceAccounts.signBlob"]) &&
      google_service_account_iam_member.self_signer["destination"].service_account_id == "projects/${var.target_project_id}/serviceAccounts/vibeestimate-runtime@${var.target_project_id}.iam.gserviceaccount.com" &&
      google_service_account_iam_member.self_signer["destination"].member == "serviceAccount:vibeestimate-runtime@${var.target_project_id}.iam.gserviceaccount.com" &&
      google_project_iam_member.runtime_firebase["firestore"].role == "roles/datastore.user" &&
      alltrue([for binding in google_project_iam_member.runtime_firebase : binding.project == var.target_project_id])
    )
    error_message = "Runtime needs only destination Firestore/Auth access and self-scoped signBlob, never broad impersonation permissions."
  }
}

run "foundation_requires_database_inventory_location" {
  command = plan
  variables {
    enable_foundation  = true
    authorized_domains = ["example-backend.firebaseapp.com", "app.example.com"]
  }
  expect_failures = [var.firestore_location]
}

run "direct_events_are_document_scoped_and_service_authenticated" {
  command = plan
  variables {
    enable_foundation     = true
    enable_event_delivery = true
    firestore_location    = "asia-southeast1"
    authorized_domains    = ["example-backend.firebaseapp.com", "app.example.com"]
  }
  assert {
    condition = (
      toset(keys(google_project_service.events)) == toset(["eventarc.googleapis.com", "eventarcpublishing.googleapis.com", "pubsub.googleapis.com"]) &&
      google_eventarc_trigger.outbox_created["destination"].project == var.target_project_id &&
      google_eventarc_trigger.outbox_created["destination"].location == var.firestore_location &&
      google_eventarc_trigger.outbox_created["destination"].event_data_content_type == "application/protobuf" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "type"]) == "google.cloud.firestore.document.v1.created" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "database"]) == "(default)" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.value if filter.attribute == "document"]) == "roomReviewOutbox/{jobId}" &&
      one([for filter in google_eventarc_trigger.outbox_created["destination"].matching_criteria : filter.operator if filter.attribute == "document"]) == "match-path-pattern" &&
      google_eventarc_trigger.outbox_created["destination"].destination[0].cloud_run_service[0].service == "vibeestimate" &&
      google_eventarc_trigger.outbox_created["destination"].destination[0].cloud_run_service[0].path == "/internal/firestore" &&
      google_cloud_run_v2_service_iam_member.events["destination"].role == "roles/run.invoker" &&
      google_cloud_run_v2_service_iam_member.events["destination"].member == "serviceAccount:vibeestimate-events@${var.target_project_id}.iam.gserviceaccount.com" &&
      google_project_iam_member.event_receiver["destination"].role == "roles/eventarc.eventReceiver"
    )
    error_message = "Only created outbox documents may reach the same-project API through the dedicated Eventarc service identity."
  }
}

run "event_delivery_requires_foundation" {
  command = plan
  variables { enable_event_delivery = true }
  expect_failures = [var.enable_event_delivery]
}

run "sdk_config_rejects_source_project_or_missing_namespace" {
  command = plan
  variables {
    enable_foundation   = true
    enable_sdk_config   = true
    firestore_location  = "asia-southeast1"
    authorized_domains  = ["example-backend.firebaseapp.com", "app.example.com"]
    firebase_web_config = "{\"projectId\":\"example-old\",\"authDomain\":\"example-old.firebaseapp.com\",\"apiKey\":\"unused\",\"appId\":\"unused\"}"
  }
  expect_failures = [var.firebase_web_config]
}

run "google_signin_requires_private_operator_credentials" {
  command = plan
  variables {
    enable_foundation  = true
    enable_google_auth = true
    firestore_location = "asia-southeast1"
    authorized_domains = ["example-backend.firebaseapp.com", "app.example.com"]
  }
  expect_failures = [var.google_oauth_client_secret]
}
