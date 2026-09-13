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

# The applied retirement plan separately verifies exact forget actions.
run "archived_configuration_remains_valid" { command = plan }

run "reject_emulator_project" {
  command = plan
  variables { firebase_project_id = "demo-example" }
  expect_failures = [var.firebase_project_id]
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
