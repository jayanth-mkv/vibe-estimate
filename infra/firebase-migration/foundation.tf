locals {
  foundation    = var.enable_foundation ? toset(["destination"]) : toset([])
  runtime_email = "vibeestimate-runtime@${var.target_project_id}.iam.gserviceaccount.com"
  labels        = { app = "vibeestimate", environment = "production", managed-by = "terraform" }
}

resource "google_project_service" "signing" {
  for_each           = local.foundation
  project            = var.target_project_id
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
  lifecycle { prevent_destroy = true }
}

resource "google_firestore_database" "destination" {
  for_each                = local.foundation
  project                 = var.target_project_id
  name                    = "(default)"
  location_id             = var.firestore_location
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"
  depends_on              = [google_project_service.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_firebase_web_app" "destination" {
  provider        = google-beta
  for_each        = local.foundation
  project         = var.target_project_id
  display_name    = "VibeEstimate"
  deletion_policy = "ABANDON"
  depends_on      = [google_firebase_project.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_identity_platform_config" "destination" {
  for_each                   = local.foundation
  project                    = var.target_project_id
  autodelete_anonymous_users = false
  authorized_domains         = var.authorized_domains
  sign_in {
    allow_duplicate_emails = false
    anonymous { enabled = true }
    email {
      enabled           = true
      password_required = true
    }
    phone_number { enabled = false }
  }
  depends_on = [google_firebase_project.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  for_each        = var.enable_google_auth ? local.foundation : toset([])
  project         = var.target_project_id
  idp_id          = "google.com"
  client_id       = var.google_oauth_client_id
  client_secret   = var.google_oauth_client_secret
  enabled         = true
  deletion_policy = "ABANDON"
  depends_on      = [google_identity_platform_config.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_firebaserules_ruleset" "destination" {
  for_each = local.foundation
  project  = var.target_project_id
  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../firestore.rules")
    }
  }
  deletion_policy = "ABANDON"
  depends_on      = [google_project_service.destination]
}

resource "google_firebaserules_release" "destination" {
  for_each        = local.foundation
  project         = var.target_project_id
  name            = "cloud.firestore"
  ruleset_name    = "projects/${var.target_project_id}/rulesets/${google_firebaserules_ruleset.destination[each.key].name}"
  deletion_policy = "ABANDON"
  depends_on      = [google_firestore_database.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_firestore_index" "destination" {
  for_each        = var.enable_foundation ? var.composite_indexes : {}
  project         = var.target_project_id
  database        = "(default)"
  collection      = each.value.collection
  query_scope     = each.value.query_scope
  deletion_policy = "ABANDON"
  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path   = fields.value.field_path
      order        = fields.value.order
      array_config = fields.value.array_config
    }
  }
  depends_on = [google_firestore_database.destination]
  lifecycle { prevent_destroy = true }
}

resource "google_project_iam_custom_role" "auth_verifier" {
  for_each    = local.foundation
  project     = var.target_project_id
  role_id     = "vibeestimateAuthVerifier"
  title       = "VibeEstimate token revocation checks"
  permissions = ["firebaseauth.users.get"]
}

resource "google_project_iam_member" "runtime_firebase" {
  for_each = var.enable_foundation ? {
    firestore = "roles/datastore.user"
    quota     = "roles/serviceusage.serviceUsageConsumer"
    auth      = "projects/${var.target_project_id}/roles/vibeestimateAuthVerifier"
  } : {}
  project    = var.target_project_id
  role       = each.value
  member     = "serviceAccount:${local.runtime_email}"
  depends_on = [google_project_iam_custom_role.auth_verifier]
}

# Custom-token migration needs only self-signing; this role cannot impersonate
# arbitrary service identities or mint access/identity tokens.
resource "google_project_iam_custom_role" "self_signer" {
  for_each    = local.foundation
  project     = var.target_project_id
  role_id     = "vibeestimateSessionSigner"
  title       = "VibeEstimate session migration signing"
  permissions = ["iam.serviceAccounts.signBlob"]
}

resource "google_service_account_iam_member" "self_signer" {
  for_each           = local.foundation
  service_account_id = "projects/${var.target_project_id}/serviceAccounts/${local.runtime_email}"
  role               = google_project_iam_custom_role.self_signer[each.key].name
  member             = "serviceAccount:${local.runtime_email}"
  depends_on         = [google_project_service.signing]
}

# Separate ownership from the original production SDK secret, retained intact
# until migration and rollback verification are complete.
resource "google_secret_manager_secret" "web_config" {
  for_each  = local.foundation
  project   = var.target_project_id
  secret_id = "vibeestimate-migrated-web-config"
  labels    = local.labels
  replication {
    auto {}
  }
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "web_config" {
  for_each  = local.foundation
  project   = var.target_project_id
  secret_id = google_secret_manager_secret.web_config[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.runtime_email}"
}

resource "google_secret_manager_secret_version" "web_config" {
  for_each               = var.enable_sdk_config ? local.foundation : toset([])
  secret                 = google_secret_manager_secret.web_config[each.key].id
  secret_data_wo         = var.firebase_web_config
  secret_data_wo_version = var.sdk_config_version
  deletion_policy        = "ABANDON"
}

output "sdk_secret_id" {
  value = try(google_secret_manager_secret.web_config["destination"].secret_id, null)
}
output "destination_database_location" {
  value = try(google_firestore_database.destination["destination"].location_id, null)
}
