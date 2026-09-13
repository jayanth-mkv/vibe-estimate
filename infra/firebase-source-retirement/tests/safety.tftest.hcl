mock_provider "google" {}
variables {
  source_project_id      = "example-source"
  source_project_name    = "Existing source"
  destination_project_id = "example-backend"
  access_token           = "unused-offline-test-token"
}
run "adoption_keeps_the_exact_source_protected" {
  command = plan
  assert {
    condition = (
      length(google_project.source) == 1 &&
      google_project.source[0].project_id == var.source_project_id &&
      google_project.source[0].name == var.source_project_name &&
      google_project.source[0].deletion_policy == "PREVENT"
    )
    error_message = "Adoption must keep the discovered source protected; the private launcher additionally requires an imported project and rejects creates."
  }
}
run "deletion_policy_is_a_separate_stage" {
  command = plan
  variables { deletion_ready = true }
  assert {
    condition     = length(google_project.source) == 1 && google_project.source[0].deletion_policy == "DELETE"
    error_message = "Readiness changes only the imported project's Terraform deletion policy before removal is planned."
  }
}
run "retirement_removes_the_project_from_configuration" {
  command = plan
  variables {
    deletion_ready = true
    retire_source  = true
  }
  assert {
    condition     = length(google_project.source) == 0
    error_message = "Only the independently imported source project may be removed in this isolated root."
  }
}
run "reject_destination_as_source" {
  command = plan
  variables { source_project_id = "example-backend" }
  expect_failures = [var.source_project_id]
}
run "reject_retirement_before_readiness" {
  command = plan
  variables { retire_source = true }
  expect_failures = [var.retire_source]
}
