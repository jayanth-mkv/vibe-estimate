mock_provider "restful" {}
variables {
  source_project_id          = "example-source"
  quota_project_id           = "example-backend"
  access_token               = "unused-offline-test-token"
  original_permissions       = { disabled_user_signup = false, disabled_user_deletion = false }
  original_anonymous_enabled = true
  original_email_enabled     = true
}
# The applied retirement plan separately verifies the exact forget action.
run "archived_configuration_remains_valid" { command = plan }

run "reject_destination_as_source" {
  command = plan
  variables { source_project_id = "example-backend" }
  expect_failures = [var.source_project_id]
}
