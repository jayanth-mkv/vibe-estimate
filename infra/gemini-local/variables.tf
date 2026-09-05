variable "project_id" {
  description = "Explicit authorized backend project, supplied from private operator configuration."
  type        = string
  default     = "demo-vibeestimate"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Supply a valid, explicit Google Cloud project ID."
  }

  validation {
    condition     = !var.provision_gemini || !startswith(var.project_id, "demo-")
    error_message = "Cloud provisioning requires an explicitly authorized non-emulator project."
  }
}

variable "provision_gemini" {
  description = "Explicit opt-in after authorized project/identity verification and credential discovery."
  type        = bool
  default     = false
}

variable "enable_vertex_ai" {
  description = "Optional Vertex AI API for local Gemini calls using the verified user profile's OAuth token. Retain this private opt-in after management begins."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_vertex_ai || var.provision_gemini
    error_message = "Vertex AI enablement requires the same explicit authorized cloud provisioning opt-in."
  }
}

variable "access_token" {
  description = "Short-lived access token from the verified authorized profile, supplied only through TF_VAR_access_token. Shared ADC is never used."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = ""

  validation {
    condition     = !var.provision_gemini || length(trimspace(var.access_token)) > 0
    error_message = "The verified-profile launcher must supply a short-lived access token before provisioning."
  }
}

variable "key_id" {
  description = "Stable API key resource ID; discover/import an existing matching resource before applying."
  type        = string
  default     = "vibeestimate-local-gemini"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,61}[a-z0-9]$", var.key_id))
    error_message = "The key ID must contain 6-63 lowercase letters, digits, or hyphens, beginning with a letter and ending alphanumeric."
  }
}

variable "service_account_id" {
  description = "Dedicated Gemini identity with no service-account private key and no broad project roles."
  type        = string
  default     = "vibeestimate-local-gemini"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.service_account_id))
    error_message = "Service account ID must contain 6-30 lowercase letters, digits, or hyphens."
  }
}
