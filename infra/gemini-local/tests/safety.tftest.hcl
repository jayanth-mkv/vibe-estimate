mock_provider "google" {}
mock_provider "restful" {}

variables {
  enable_vertex_ai = false
}

run "no_resources_without_opt_in" {
  command = plan

  assert {
    condition     = length(google_project_service.gemini) == 0 && length(google_project_service.resource_manager) == 0 && length(google_project_service.vertex_ai) == 0 && length(google_service_account.gemini) == 0 && length(restful_resource.gemini_key) == 0
    error_message = "Default local testing must provision no cloud resources."
  }
}

run "reject_emulator_project_for_cloud" {
  command = plan
  variables {
    provision_gemini = true
    access_token     = "mock-token-never-used-for-cloud"
  }
  expect_failures = [var.project_id]
}

run "reject_missing_verified_token" {
  command = plan
  variables {
    project_id       = "example-authorized-project"
    provision_gemini = true
  }
  expect_failures = [var.access_token]
}

run "reject_vertex_without_cloud_opt_in" {
  command = plan
  variables {
    enable_vertex_ai = true
  }
  expect_failures = [var.enable_vertex_ai]
}

run "only_minimum_gemini_resources" {
  command = plan
  variables {
    project_id       = "example-authorized-project"
    provision_gemini = true
    access_token     = "mock-token-never-used-for-cloud"
  }

  override_resource {
    target          = google_service_account.gemini[0]
    override_during = plan
    values = {
      email = "vibeestimate-local-gemini@example-authorized-project.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = toset(keys(google_project_service.gemini)) == toset(["apikeys.googleapis.com", "generativelanguage.googleapis.com"])
    error_message = "Live Gemini must enable only the two discovered missing APIs."
  }
  assert {
    condition     = length(google_project_service.resource_manager) == 1 && google_project_service.resource_manager[0].service == "cloudresourcemanager.googleapis.com" && length(google_project_service.vertex_ai) == 0 && length(output.managed_apis) == 3
    error_message = "Resource Manager must be the sole additional API prerequisite for provider refresh."
  }
  assert {
    condition     = length(google_service_account.gemini) == 1 && length(restful_resource.gemini_key) == 1
    error_message = "Only one dedicated Gemini identity and auth key may be provisioned."
  }
  assert {
    condition     = restful_resource.gemini_key[0].body.serviceAccountEmail == google_service_account.gemini[0].email
    error_message = "The key must be service-account-bound to meet current Gemini requirements."
  }
  assert {
    condition     = length(restful_resource.gemini_key[0].body.restrictions.apiTargets) == 1 && restful_resource.gemini_key[0].body.restrictions.apiTargets[0].service == "generativelanguage.googleapis.com"
    error_message = "The authorization key must be restricted solely to Gemini."
  }
  assert {
    condition     = restful_resource.gemini_key[0].use_sensitive_output && !contains(restful_resource.gemini_key[0].output_attrs, "keyString")
    error_message = "No credential value may be returned through Terraform output."
  }
  assert {
    condition     = alltrue([for api in google_project_service.gemini : !api.disable_on_destroy && !api.disable_dependent_services]) && !google_project_service.resource_manager[0].disable_on_destroy && !google_project_service.resource_manager[0].disable_dependent_services
    error_message = "API management must not disable existing or dependent services."
  }
  assert {
    condition     = restful_resource.gemini_key[0].poll_create.status.success == "[true]" && restful_resource.gemini_key[0].poll_create.status_locator == "body.[done,error.code]"
    error_message = "Asynchronous key provisioning must wait for success and distinguish operation errors."
  }
}

run "vertex_adds_only_api_with_existing_auth_unchanged" {
  command = plan
  variables {
    project_id       = "example-authorized-project"
    provision_gemini = true
    enable_vertex_ai = true
    access_token     = "mock-token-never-used-for-cloud"
  }

  override_resource {
    target          = google_service_account.gemini[0]
    override_during = plan
    values = {
      email = "vibeestimate-local-gemini@example-authorized-project.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = length(google_project_service.vertex_ai) == 1 && google_project_service.vertex_ai[0].project == var.project_id && google_project_service.vertex_ai[0].service == "aiplatform.googleapis.com"
    error_message = "Explicit Vertex opt-in must manage only its API in the authorized backend project."
  }
  assert {
    condition     = toset(output.managed_apis) == toset(["apikeys.googleapis.com", "generativelanguage.googleapis.com", "cloudresourcemanager.googleapis.com", "aiplatform.googleapis.com"])
    error_message = "Vertex must add only one API to the existing three-API configuration."
  }
  assert {
    condition     = !google_project_service.vertex_ai[0].disable_on_destroy && !google_project_service.vertex_ai[0].disable_dependent_services
    error_message = "Vertex API management must preserve the API and dependent services."
  }
  assert {
    condition     = length(google_service_account.gemini) == 1 && length(restful_resource.gemini_key) == 1 && restful_resource.gemini_key[0].body.serviceAccountEmail == google_service_account.gemini[0].email
    error_message = "Vertex must not add credentials or change the existing service-account binding."
  }
  assert {
    condition     = length(restful_resource.gemini_key[0].body.restrictions.apiTargets) == 1 && restful_resource.gemini_key[0].body.restrictions.apiTargets[0].service == "generativelanguage.googleapis.com" && output.gemini_api_restriction == "generativelanguage.googleapis.com"
    error_message = "The existing Gemini authorization key must never be widened for Vertex OAuth calls."
  }
}
