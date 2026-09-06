variable "project_id" {
  description = "Explicit authorized backend project, supplied from private operator configuration. Only this project's spend is measured."
  type        = string
  default     = "demo-vibeestimate"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Supply a valid, explicit Google Cloud project ID."
  }

  validation {
    condition     = !var.provision_guardrails || !startswith(var.project_id, "demo-")
    error_message = "Cloud provisioning requires an explicitly authorized non-emulator project."
  }
}

variable "project_number" {
  description = "Numeric ID of the same authorized project. The budget filter accepts only projects/<number>."
  type        = string
  default     = ""

  validation {
    condition     = var.project_number == "" || can(regex("^[1-9][0-9]{4,24}$", var.project_number))
    error_message = "Supply the project's numeric ID, without the projects/ prefix."
  }

  validation {
    condition     = !var.provision_guardrails || var.project_number != ""
    error_message = "Scoping the budget to one project requires its verified numeric ID."
  }
}

variable "billing_account" {
  description = "Billing account that owns the project, supplied from private operator configuration."
  type        = string
  default     = ""

  validation {
    condition     = var.billing_account == "" || can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "Supply the billing account ID in XXXXXX-XXXXXX-XXXXXX form."
  }

  validation {
    condition     = !var.provision_guardrails || var.billing_account != ""
    error_message = "Budget creation requires the explicitly verified billing account."
  }
}

variable "provision_guardrails" {
  description = "Explicit opt-in after authorized account/project verification and budget discovery."
  type        = bool
  default     = false
}

variable "budget_units" {
  description = "Whole-currency allocation for this project per calendar month. Minor units are never used by the Budget API."
  type        = string
  default     = "1000"

  validation {
    condition     = can(regex("^[1-9][0-9]{0,8}$", var.budget_units))
    error_message = "The allocation must be a whole positive amount without separators."
  }
}

variable "currency_code" {
  description = "Must equal the billing account's own currency; the API rejects any other code."
  type        = string
  default     = "INR"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.currency_code))
    error_message = "Use the billing account's ISO 4217 currency code."
  }
}

variable "threshold_percents" {
  description = "Actual-spend alert points as fractions of the allocation. A forecast alert at full allocation is always added."
  type        = list(number)
  default     = [0.5, 0.75, 0.9, 1.0]

  validation {
    condition     = length(var.threshold_percents) > 0 && alltrue([for percent in var.threshold_percents : percent > 0 && percent <= 1])
    error_message = "Supply at least one threshold greater than 0 and at most 1."
  }
}

variable "access_token" {
  description = "Short-lived access token from the verified authorized profile, supplied only through TF_VAR_access_token. Shared ADC is never used."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = ""

  validation {
    condition     = !var.provision_guardrails || length(trimspace(var.access_token)) > 0
    error_message = "The verified-profile launcher must supply a short-lived access token before provisioning."
  }
}
