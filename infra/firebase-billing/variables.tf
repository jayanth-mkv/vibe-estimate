variable "backend_project_id" {
  description = "Existing billed backend project, verified by the private launcher as the source of the existing billing account."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.backend_project_id)) && !startswith(var.backend_project_id, "demo-")
    error_message = "Supply the explicitly authorized non-emulator backend project."
  }
}

variable "firebase_project_id" {
  description = "Existing independently configured Firebase project whose billing information is imported before a link is planned."
  type        = string
  validation {
    condition = (
      can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.firebase_project_id)) &&
      !startswith(var.firebase_project_id, "demo-") && var.firebase_project_id != var.backend_project_id
    )
    error_message = "Supply the existing non-emulator Firebase project, separate from the backend project."
  }
}

variable "billing_account" {
  description = "Existing open billing account already linked to the backend; the private launcher verifies the live account and private guardrails record agree."
  type        = string
  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "Supply the verified existing billing account ID; an empty value that would disable billing is forbidden."
  }
}

variable "access_token" {
  description = "Short-lived token from the verified named profile, supplied in memory only; never persisted in a saved plan."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = ""
  validation {
    condition     = length(trimspace(var.access_token)) > 0
    error_message = "A short-lived token from the explicit verified profile is required."
  }
}
