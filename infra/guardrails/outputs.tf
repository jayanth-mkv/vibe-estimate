output "budget_name" {
  description = "Resource name of the managed budget, for readback verification. Empty until provisioning is opted into."
  value       = one(google_billing_budget.project_monthly[*].name)
}

output "allocation" {
  description = "Allocated amount per calendar month, as configured."
  value       = "${var.budget_units} ${var.currency_code}"
}
