mock_provider "google" {}

run "no_resources_without_opt_in" {
  command = plan

  assert {
    condition     = length(google_project_service.billing_budgets) == 0 && length(google_billing_budget.project_monthly) == 0
    error_message = "Default configuration checks must provision no cloud resources."
  }
}

run "reject_emulator_project_for_cloud" {
  command = plan
  variables {
    provision_guardrails = true
    project_number       = "100000000000"
    billing_account      = "0000AA-0000BB-0000CC"
    access_token         = "mock-token-never-used-for-cloud"
  }
  expect_failures = [var.project_id]
}

run "reject_missing_billing_account" {
  command = plan
  variables {
    project_id           = "example-authorized-project"
    project_number       = "100000000000"
    provision_guardrails = true
    access_token         = "mock-token-never-used-for-cloud"
  }
  expect_failures = [var.billing_account]
}

run "reject_missing_project_number" {
  command = plan
  variables {
    project_id           = "example-authorized-project"
    billing_account      = "0000AA-0000BB-0000CC"
    provision_guardrails = true
    access_token         = "mock-token-never-used-for-cloud"
  }
  expect_failures = [var.project_number]
}

run "reject_missing_verified_token" {
  command = plan
  variables {
    project_id           = "example-authorized-project"
    project_number       = "100000000000"
    billing_account      = "0000AA-0000BB-0000CC"
    provision_guardrails = true
  }
  expect_failures = [var.access_token]
}

run "reject_fractional_allocation" {
  command = plan
  variables {
    budget_units = "1000.50"
  }
  expect_failures = [var.budget_units]
}

run "only_scoped_budget_and_its_api" {
  command = plan
  variables {
    project_id           = "example-authorized-project"
    project_number       = "100000000000"
    billing_account      = "0000AA-0000BB-0000CC"
    provision_guardrails = true
    budget_units         = "1000"
    currency_code        = "INR"
    access_token         = "mock-token-never-used-for-cloud"
  }

  assert {
    condition     = google_project_service.billing_budgets[0].service == "billingbudgets.googleapis.com" && google_project_service.billing_budgets[0].disable_on_destroy == false
    error_message = "The root must enable only the Budget API, and must not disable it on destroy."
  }

  assert {
    condition     = google_billing_budget.project_monthly[0].budget_filter[0].projects == toset(["projects/100000000000"])
    error_message = "The budget must measure only the one authorized project."
  }

  assert {
    condition     = google_billing_budget.project_monthly[0].budget_filter[0].calendar_period == "MONTH"
    error_message = "The allocation must reset each calendar month."
  }

  assert {
    condition     = google_billing_budget.project_monthly[0].amount[0].specified_amount[0].units == "1000" && google_billing_budget.project_monthly[0].amount[0].specified_amount[0].currency_code == "INR"
    error_message = "The allocation must be the explicitly configured whole amount and currency."
  }

  assert {
    condition     = length(google_billing_budget.project_monthly[0].threshold_rules) == 5
    error_message = "Four actual-spend thresholds and one forecast threshold must be configured."
  }

  assert {
    condition     = length([for rule in google_billing_budget.project_monthly[0].threshold_rules : rule if rule.spend_basis == "FORECASTED_SPEND" && rule.threshold_percent == 1]) == 1
    error_message = "A forecast alert at the full allocation must be present."
  }

  assert {
    condition     = length(google_billing_budget.project_monthly[0].all_updates_rule) == 0
    error_message = "Alerts must reach billing administrators by email without extra notification resources."
  }
}
