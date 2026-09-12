# No live credentials, API calls, or infrastructure changes.
mock_provider "google" {}

variables {
  backend_project_id    = "example-backend"
  firebase_project_id   = "example-firebase"
  project_number        = "123456789012"
  region                = "asia-southeast1"
  firebase_location     = "nam5"
  firestore_database_id = "(default)"
  access_token          = "unused-offline-test-token"
}

run "source_uses_database_project_and_location" {
  command = plan
  assert {
    condition = (
      google_eventarc_trigger.outbox_created.project == var.firebase_project_id &&
      google_eventarc_trigger.outbox_created.location == var.firebase_location &&
      google_workflows_workflow.dispatch.project == var.firebase_project_id &&
      google_workflows_workflow.dispatch.region == var.region
    )
    error_message = "Firestore events must remain with the existing database; workflow region is independent."
  }
  assert {
    condition     = alltrue([for api in google_project_service.required : api.project == var.firebase_project_id && !api.disable_on_destroy])
    error_message = "Enable only source APIs in the explicit Firebase project and preserve shared API activation."
  }
}

run "only_created_outbox_jobs_trigger_delivery" {
  command = plan
  assert {
    condition = (
      length(google_eventarc_trigger.outbox_created.matching_criteria) == 3 &&
      anytrue([for filter in google_eventarc_trigger.outbox_created.matching_criteria : filter.attribute == "type" && filter.value == "google.cloud.firestore.document.v1.created"]) &&
      anytrue([for filter in google_eventarc_trigger.outbox_created.matching_criteria : filter.attribute == "database" && filter.value == var.firestore_database_id]) &&
      anytrue([for filter in google_eventarc_trigger.outbox_created.matching_criteria : filter.attribute == "document" && filter.value == "roomReviewOutbox/{jobId}" && filter.operator == "match-path-pattern"]) &&
      google_eventarc_trigger.outbox_created.event_data_content_type == "application/protobuf"
    )
    error_message = "Only creation of a job in the exact outbox collection may trigger delivery, avoiding update loops."
  }
}

run "bridge_can_only_invoke_the_existing_api" {
  command = plan
  assert {
    condition = (
      google_cloud_run_v2_service_iam_member.dispatcher.project == var.backend_project_id &&
      google_cloud_run_v2_service_iam_member.dispatcher.location == var.region &&
      google_cloud_run_v2_service_iam_member.dispatcher.name == "vibeestimate" &&
      google_cloud_run_v2_service_iam_member.dispatcher.role == "roles/run.invoker" &&
      google_cloud_run_v2_service_iam_member.dispatcher.member == "serviceAccount:vibeestimate-events@${var.firebase_project_id}.iam.gserviceaccount.com" &&
      google_workflows_workflow.dispatch.service_account == "projects/${var.firebase_project_id}/serviceAccounts/vibeestimate-events@${var.firebase_project_id}.iam.gserviceaccount.com" &&
      google_workflows_workflow.dispatch.user_env_vars["DISPATCH_ORIGIN"] == "https://vibeestimate-${var.project_number}.${var.region}.run.app"
    )
    error_message = "Use the dedicated workflow identity and only the existing backend service as destination."
  }
  assert {
    condition = (
      google_project_iam_member.event_receiver.role == "roles/eventarc.eventReceiver" &&
      google_project_iam_member.workflow_invoker.role == "roles/workflows.invoker" &&
      google_workflows_workflow.dispatch.call_log_level == "LOG_ERRORS_ONLY" &&
      google_workflows_workflow.dispatch.deletion_protection
    )
    error_message = "Keep source IAM scoped, log errors only, and preserve workflow executions."
  }
}

run "reject_emulator_project" {
  command = plan
  variables { firebase_project_id = "demo-example" }
  expect_failures = [var.firebase_project_id]
}

run "workflow_bounds_delivery_and_forwards_only_event_identifiers" {
  command = plan
  assert {
    condition = (
      toset(keys(yamldecode(google_workflows_workflow.dispatch.source_contents).main.steps[0].dispatch.try.args.body)) == toset(["id", "source", "subject", "type"]) &&
      yamldecode(google_workflows_workflow.dispatch.source_contents).main.steps[0].dispatch.try.args.auth.type == "OIDC" &&
      yamldecode(google_workflows_workflow.dispatch.source_contents).main.steps[0].dispatch.try.args.timeout == 20 &&
      yamldecode(google_workflows_workflow.dispatch.source_contents).main.steps[0].dispatch.retry.max_retries == 10 &&
      yamldecode(google_workflows_workflow.dispatch.source_contents).main.steps[0].dispatch.retry.backoff.max_delay == 60
    )
    error_message = "The workflow must authenticate, forward only identifiers, and bound delivery retries without source/model payloads."
  }
}

run "reject_missing_database_location" {
  command = plan
  variables { firebase_location = "global" }
  expect_failures = [var.firebase_location]
}

run "reject_empty_ephemeral_credential" {
  command = plan
  variables { access_token = "" }
  expect_failures = [var.access_token]
}
