locals {
  events      = toset(["destination"])
  event_email = "vibeestimate-events@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_project_service" "events" {
  for_each           = toset(["eventarc.googleapis.com", "eventarcpublishing.googleapis.com", "pubsub.googleapis.com"])
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
  lifecycle { prevent_destroy = true }
}

resource "google_service_account" "events" {
  for_each     = local.events
  project      = var.project_id
  account_id   = "vibeestimate-events"
  display_name = "VibeEstimate Firestore event delivery"
}

resource "google_project_iam_member" "event_receiver" {
  for_each   = local.events
  project    = var.project_id
  role       = "roles/eventarc.eventReceiver"
  member     = "serviceAccount:${local.event_email}"
  depends_on = [google_service_account.events, google_project_service.events]
}

resource "google_cloud_run_v2_service_iam_member" "events" {
  for_each   = local.events
  project    = var.project_id
  location   = var.runtime_region
  name       = "vibeestimate"
  role       = "roles/run.invoker"
  member     = "serviceAccount:${local.event_email}"
  depends_on = [google_service_account.events]
}

resource "google_eventarc_trigger" "outbox_created" {
  for_each                = local.events
  project                 = var.project_id
  location                = var.firestore_location
  name                    = "vibeestimate-review-outbox"
  service_account         = local.event_email
  event_data_content_type = "application/protobuf"
  labels                  = local.labels
  matching_criteria {
    attribute = "type"
    value     = "google.cloud.firestore.document.v1.created"
  }
  matching_criteria {
    attribute = "database"
    value     = "(default)"
  }
  matching_criteria {
    attribute = "document"
    value     = "roomReviewOutbox/{jobId}"
    operator  = "match-path-pattern"
  }
  destination {
    cloud_run_service {
      service = "vibeestimate"
      region  = var.runtime_region
      path    = "/internal/firestore"
    }
  }
  depends_on = [google_firestore_database.destination, google_project_iam_member.event_receiver, google_cloud_run_v2_service_iam_member.events]
  lifecycle { prevent_destroy = true }
}

output "event_service_account" { value = local.event_email }
output "event_trigger" { value = try(google_eventarc_trigger.outbox_created["destination"].id, null) }
