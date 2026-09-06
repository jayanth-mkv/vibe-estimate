# Cost guardrails for the authorized backend project.
#
# A Cloud Billing budget measures and alerts; it does not stop spend. The
# enforcing caps for this application live elsewhere and stay there: the Cloud
# Run service template in infra/runtime bounds instances, concurrency, CPU,
# memory and request timeout, and the backend enforces its own bounded call
# limits. This root adds the missing observation layer, scoped to one project.

locals {
  budget_project = var.provision_guardrails ? ["projects/${var.project_number}"] : []
}

# Required to read or write budgets with this project as the quota project.
resource "google_project_service" "billing_budgets" {
  count   = var.provision_guardrails ? 1 : 0
  project = var.project_id
  service = "billingbudgets.googleapis.com"

  # Keep the API enabled if this root is ever removed; other reads depend on it.
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_billing_budget" "project_monthly" {
  count           = var.provision_guardrails ? 1 : 0
  billing_account = var.billing_account
  display_name    = "VibeEstimate monthly project allocation"

  budget_filter {
    projects               = local.budget_project
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.currency_code
      units         = var.budget_units
    }
  }

  dynamic "threshold_rules" {
    for_each = toset(var.threshold_percents)
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  # Warn once the run rate alone would exhaust the month's allocation.
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  # No all_updates_rule: alerts go to the billing account's own administrators
  # and users by email. A Pub/Sub or Monitoring channel would be a further
  # resource with its own IAM, and none is needed to observe this allocation.

  depends_on = [google_project_service.billing_budgets]
}
