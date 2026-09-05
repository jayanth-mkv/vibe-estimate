mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  firebase_project_id = "demo-vibe-auth"
}

run "no_implicit_firebase_adoption" {
  command = plan
  assert {
    condition     = length(google_firebase_project.existing) == 0 && length(google_firestore_database.existing) == 0 && length(google_firebaserules_release.firestore) == 0
    error_message = "Firebase adoption and rules publishing must be explicit."
  }
}

run "reject_unknown_database_location" {
  command = plan
  variables {
    adopt_firestore_database = true
  }
  expect_failures = [var.firestore_location]
}
