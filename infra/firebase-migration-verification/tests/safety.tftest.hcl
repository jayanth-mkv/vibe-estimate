mock_provider "google" {
  mock_data "google_iam_role" {
    defaults = { included_permissions = ["iam.serviceAccounts.signBlob"] }
  }
}
variables {
  target_project_id       = "example-backend"
  runtime_service_account = "projects/example-backend/serviceAccounts/vibeestimate-runtime@example-backend.iam.gserviceaccount.com"
  operator_email          = "operator@example.invalid"
  approved_at             = "2026-09-13T10:00:00Z"
  expires_at              = "2026-09-13T11:00:00Z"
  access_token            = "unused-offline-test-token"
}
run "disabled_by_default" {
  command = plan
  assert {
    condition     = length(google_service_account_iam_member.verification) == 0
    error_message = "Verification access must require explicit enablement."
  }
}
run "one_user_one_account_one_permission_and_bounded_expiry" {
  command = plan
  variables { binding_enabled = true }
  assert {
    condition = (
      length(google_service_account_iam_member.verification) == 1 &&
      google_service_account_iam_member.verification[0].service_account_id == var.runtime_service_account &&
      google_service_account_iam_member.verification[0].role == "projects/example-backend/roles/vibeestimateSessionSigner" &&
      google_service_account_iam_member.verification[0].member == "user:operator@example.invalid" &&
      google_service_account_iam_member.verification[0].condition[0].expression == "request.time >= timestamp(\"2026-09-13T10:00:00Z\") && request.time < timestamp(\"2026-09-13T11:00:00Z\")"
    )
    error_message = "The reviewed temporary grant must stay user-specific, service-account-specific and time-bounded."
  }
}
run "reject_wrong_runtime_identity" {
  command = plan
  variables { runtime_service_account = "projects/example-backend/serviceAccounts/other@example-backend.iam.gserviceaccount.com" }
  expect_failures = [var.runtime_service_account]
}
run "reject_other_project" {
  command = plan
  variables { target_project_id = "another-project" }
  expect_failures = [var.runtime_service_account]
}
run "reject_group_member" {
  command = plan
  variables { operator_email = "group:operators@example.invalid" }
  expect_failures = [var.operator_email]
}
run "reject_service_account_member" {
  command = plan
  variables { operator_email = "other@example-backend.iam.gserviceaccount.com" }
  expect_failures = [var.operator_email]
}
run "reject_empty_expiry" {
  command = plan
  variables { expires_at = "" }
  expect_failures = [var.expires_at]
}
run "reject_expiry_before_approval" {
  command = plan
  variables { expires_at = "2026-09-13T09:59:59Z" }
  expect_failures = [var.expires_at]
}
run "reject_long_lived_grant" {
  command = plan
  variables { expires_at = "2026-09-13T12:00:01Z" }
  expect_failures = [var.expires_at]
}
run "reject_broadened_existing_role" {
  command = plan
  variables { binding_enabled = true }
  override_data {
    target = data.google_iam_role.session_signer[0]
    values = { included_permissions = ["iam.serviceAccounts.signBlob", "iam.serviceAccounts.getAccessToken"] }
  }
  expect_failures = [google_service_account_iam_member.verification[0]]
}
