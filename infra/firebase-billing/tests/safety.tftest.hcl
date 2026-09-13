# Mock-only validation: no billing account or project is changed.
mock_provider "google" {}

variables {
  backend_project_id  = "example-backend"
  firebase_project_id = "example-firebase"
  billing_account     = "000000-000000-000000"
  access_token        = "unused-offline-test-token"
}

# The applied retirement plan separately verifies exact forget actions.
run "archived_configuration_remains_valid" { command = plan }

run "reject_backend_as_the_source_firebase_project" {
  command = plan
  variables { firebase_project_id = "example-backend" }
  expect_failures = [var.firebase_project_id]
}

run "reject_emulator_firebase_project" {
  command = plan
  variables { firebase_project_id = "demo-example" }
  expect_failures = [var.firebase_project_id]
}

run "reject_emulator_backend_project" {
  command = plan
  variables { backend_project_id = "demo-example" }
  expect_failures = [var.backend_project_id]
}

run "reject_billing_disable" {
  command = plan
  variables { billing_account = "" }
  expect_failures = [var.billing_account]
}

run "reject_a_billing_account_resource_path" {
  command = plan
  variables { billing_account = "billingAccounts/000000-000000-000000" }
  expect_failures = [var.billing_account]
}

run "reject_missing_ephemeral_token" {
  command = plan
  variables { access_token = "" }
  expect_failures = [var.access_token]
}
