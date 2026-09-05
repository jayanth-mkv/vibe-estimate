locals {
  # IAM and Service Usage are discovered as already enabled and remain
  # unmanaged here. Resource Manager is a separate bootstrap dependency for
  # the Google provider's project-number discovery during service refresh.
  # Cloud Run, Firebase, Cloud Build, and Secret Manager
  # deployment resources are intentionally absent from this isolated root.
  required_new_apis = toset([
    "apikeys.googleapis.com",
    "generativelanguage.googleapis.com",
  ])
  key_collection = "/projects/${var.project_id}/locations/global/keys"
  key_path       = "${local.key_collection}/${var.key_id}"

  # GJSON multipath always yields an array, including when Google omits false
  # values. An operation with error.code cannot match the success sentinel.
  operation_poll = {
    url_locator       = "body.name"
    status_locator    = "body.[done,error.code]"
    default_delay_sec = 2
    status = {
      success = "[true]"
      pending = ["[]", "[false]"]
    }
  }
}

resource "google_project_service" "resource_manager" {
  count = var.provision_gemini ? 1 : 0

  project                    = var.project_id
  service                    = "cloudresourcemanager.googleapis.com"
  disable_on_destroy         = false
  disable_dependent_services = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_service" "gemini" {
  for_each = var.provision_gemini ? local.required_new_apis : toset([])

  project                    = var.project_id
  service                    = each.key
  disable_on_destroy         = false
  disable_dependent_services = false

  depends_on = [google_project_service.resource_manager]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_service" "vertex_ai" {
  count = var.provision_gemini && var.enable_vertex_ai ? 1 : 0

  project                    = var.project_id
  service                    = "aiplatform.googleapis.com"
  disable_on_destroy         = false
  disable_dependent_services = false

  # Local publisher-model requests use the verified user's OAuth identity.
  # This does not broaden the existing Gemini authorization key or SA roles.
  depends_on = [google_project_service.resource_manager]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "gemini" {
  count = var.provision_gemini ? 1 : 0

  project      = var.project_id
  account_id   = var.service_account_id
  display_name = "VibeEstimate local Gemini"
  description  = "Identity bound only to the VibeEstimate Generative Language API authorization key."

  lifecycle {
    prevent_destroy = true
  }
}

resource "restful_resource" "gemini_key" {
  count = var.provision_gemini ? 1 : 0

  path         = local.key_collection
  read_path    = local.key_path
  create_query = { keyId = [var.key_id] }
  body = {
    displayName         = "VibeEstimate local Gemini"
    serviceAccountEmail = google_service_account.gemini[0].email
    restrictions = {
      # A sole Gemini restriction is exempt from the default authorization-key
      # organization policy. Never disable or loosen that organization policy.
      apiTargets = [{ service = "generativelanguage.googleapis.com" }]
    }
  }

  update_method        = "PATCH"
  merge_patch_disabled = true
  update_query         = { updateMask = ["displayName,restrictions"] }
  force_new_attrs      = ["serviceAccountEmail"]
  poll_create          = local.operation_poll
  poll_update          = local.operation_poll
  poll_delete          = local.operation_poll

  # GetKey is metadata-only. Export an explicit allowlist anyway and mark it
  # sensitive, so an API addition cannot turn the state output into a key leak.
  output_attrs = [
    "name", "uid", "displayName", "serviceAccountEmail", "restrictions",
    "createTime", "updateTime", "etag",
  ]
  use_sensitive_output = true

  depends_on = [google_project_service.gemini]

  lifecycle {
    prevent_destroy = true
  }
}
