variable "project_id" {
  description = "Existing authorized project shared by Firebase and the application runtime."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !startswith(var.project_id, "demo-")
    error_message = "Supply the explicitly authorized non-emulator application project."
  }
}

variable "access_token" {
  description = "Short-lived token from the verified named profile, supplied in memory only."
  type        = string
  sensitive   = true
  ephemeral   = true
  validation {
    condition     = length(trimspace(var.access_token)) > 0
    error_message = "A verified named-profile token is required."
  }
}

variable "firestore_location" {
  description = "Exact discovered location of the existing default database."
  type        = string
  validation {
    condition     = length(trimspace(var.firestore_location)) > 0
    error_message = "Preserve the existing database's verified location."
  }
}

variable "authorized_domains" {
  description = "Explicit application and Firebase Auth hostnames, including authorized loopback development."
  type        = list(string)
  validation {
    condition = length(var.authorized_domains) >= 2 && alltrue([
      for domain in var.authorized_domains : domain == "localhost" || (length(domain) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9-]+$", domain)))
    ])
    error_message = "Supply explicit DNS hostnames without schemes or ports; localhost is allowed for authorized connected development."
  }
}

variable "composite_indexes" {
  description = "Verified composite indexes managed on the default database."
  type = map(object({
    collection  = string
    query_scope = string
    fields = list(object({
      field_path   = string
      order        = optional(string)
      array_config = optional(string)
    }))
  }))
  default = {}
}

variable "runtime_region" {
  description = "Region of the existing Cloud Run application and review queue."
  type        = string
}

variable "web_config_secret_id" {
  description = "Exact existing browser SDK secret ID; changing it requires a separately reviewed ownership decision."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,255}$", var.web_config_secret_id))
    error_message = "Supply the existing Secret Manager secret ID, without a project path."
  }
}

variable "firebase_web_config" {
  description = "Validated Google-only SDK payload, sent through a write-only Secret Manager field."
  type        = string
  sensitive   = true
  ephemeral   = true
  validation {
    condition = try(
      jsondecode(var.firebase_web_config).projectId == var.project_id &&
      jsondecode(var.firebase_web_config).authDomain == "${var.project_id}.firebaseapp.com" &&
      jsondecode(var.firebase_web_config).authMode == "google" &&
      (!contains(keys(jsondecode(var.firebase_web_config)), "appNamespace") || can(regex("^[a-z][a-z0-9-]{0,31}$", jsondecode(var.firebase_web_config).appNamespace))) &&
      length(jsondecode(var.firebase_web_config).apiKey) > 0 &&
      length(jsondecode(var.firebase_web_config).appId) > 0, false
    )
    error_message = "SDK configuration must match the application project, use Google sign-in, and have a valid optional app namespace."
  }
}

variable "sdk_config_version" {
  description = "Existing write-only payload revision; increment only for an intentional SDK configuration change."
  type        = number
  default     = 1
  validation {
    condition     = var.sdk_config_version >= 1 && floor(var.sdk_config_version) == var.sdk_config_version
    error_message = "Use a positive integer write-only configuration version."
  }
}

variable "google_oauth_client_id" {
  description = "Existing Google OAuth web client ID."
  type        = string
  sensitive   = true
}

variable "google_oauth_client_secret" {
  description = "Existing OAuth web client credential, retained only in protected private Terraform state."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.google_oauth_client_id) > 0 && length(var.google_oauth_client_secret) > 0
    error_message = "Google sign-in requires the validated private OAuth web client."
  }
}
