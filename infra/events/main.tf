terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  backend "gcs" { prefix = "events" }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project               = var.firebase_project_id
  billing_project       = var.firebase_project_id
  user_project_override = true
  access_token          = var.access_token
}

locals {
  origin         = "https://vibeestimate-${var.project_number}.${var.region}.run.app"
  workflow_email = "vibeestimate-events@${var.firebase_project_id}.iam.gserviceaccount.com"
  trigger_email  = "vibeestimate-event-trigger@${var.firebase_project_id}.iam.gserviceaccount.com"
  labels         = { app = "vibeestimate", environment = "production", managed-by = "terraform" }
  required_apis  = toset(["eventarc.googleapis.com", "eventarcpublishing.googleapis.com", "workflows.googleapis.com", "workflowexecutions.googleapis.com", "pubsub.googleapis.com"])
}

# Source infrastructure stays with the existing Firestore database. This root
# neither creates a database nor changes the existing application service.
resource "google_project_service" "required" {
  for_each           = local.required_apis
  project            = var.firebase_project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_service_account" "workflow" {
  project      = var.firebase_project_id
  account_id   = "vibeestimate-events"
  display_name = "VibeEstimate outbox delivery"
}

resource "google_service_account" "trigger" {
  project      = var.firebase_project_id
  account_id   = "vibeestimate-event-trigger"
  display_name = "VibeEstimate Firestore events"
}

resource "google_project_iam_member" "event_receiver" {
  project    = var.firebase_project_id
  role       = "roles/eventarc.eventReceiver"
  member     = "serviceAccount:${local.trigger_email}"
  depends_on = [google_service_account.trigger, google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "dispatcher" {
  project    = var.backend_project_id
  location   = var.region
  name       = "vibeestimate"
  role       = "roles/run.invoker"
  member     = "serviceAccount:${local.workflow_email}"
  depends_on = [google_service_account.workflow]
}

resource "google_workflows_workflow" "dispatch" {
  project             = var.firebase_project_id
  region              = var.region
  name                = "vibeestimate-review-dispatch"
  description         = "Deliver created review outbox jobs to the existing authenticated API. Failed executions remain available for investigation; jobs remain in Firestore for owner retry."
  service_account     = "projects/${var.firebase_project_id}/serviceAccounts/${local.workflow_email}"
  call_log_level      = "LOG_ERRORS_ONLY"
  deletion_protection = true
  labels              = local.labels
  user_env_vars       = { DISPATCH_ORIGIN = local.origin }
  source_contents     = file("${path.module}/dispatch.yaml")
  depends_on          = [google_project_service.required, google_service_account.workflow, google_cloud_run_v2_service_iam_member.dispatcher]
  lifecycle { prevent_destroy = true }
}

# Workflows IAM grants are supported at project level (there is no per-workflow
# IAM policy). This dedicated identity gets only the predefined invoker role.
resource "google_project_iam_member" "workflow_invoker" {
  project    = var.firebase_project_id
  role       = "roles/workflows.invoker"
  member     = "serviceAccount:${local.trigger_email}"
  depends_on = [google_service_account.trigger, google_project_service.required]
}

resource "google_eventarc_trigger" "outbox_created" {
  project                 = var.firebase_project_id
  location                = var.firebase_location
  name                    = "vibeestimate-review-outbox"
  service_account         = local.trigger_email
  event_data_content_type = "application/protobuf"
  labels                  = local.labels
  matching_criteria {
    attribute = "type"
    value     = "google.cloud.firestore.document.v1.created"
  }
  matching_criteria {
    attribute = "database"
    value     = var.firestore_database_id
  }
  matching_criteria {
    attribute = "document"
    value     = "roomReviewOutbox/{jobId}"
    operator  = "match-path-pattern"
  }
  destination { workflow = google_workflows_workflow.dispatch.id }
  depends_on = [google_project_iam_member.event_receiver, google_project_iam_member.workflow_invoker]
  lifecycle { prevent_destroy = true }
}

output "event_service_account" { value = local.workflow_email }
output "trigger" { value = google_eventarc_trigger.outbox_created.id }
output "workflow" { value = google_workflows_workflow.dispatch.id }
output "transport_subscription" { value = try(google_eventarc_trigger.outbox_created.transport[0].pubsub[0].subscription, null) }
