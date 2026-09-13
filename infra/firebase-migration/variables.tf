variable "target_project_id" {
  description = "Existing authorized backend project that becomes the Firebase destination."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.target_project_id)) && !startswith(var.target_project_id, "demo-")
    error_message = "Supply the existing explicitly authorized non-emulator destination project."
  }
}

variable "access_token" {
  description = "Short-lived token from the verified named profile, supplied in memory only."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = ""
  validation {
    condition     = length(trimspace(var.access_token)) > 0
    error_message = "A verified named-profile token is required."
  }
}

variable "enable_foundation" {
  description = "Enable only after API activation and a successful destination database inventory."
  type        = bool
  default     = false
}
variable "firestore_location" {
  description = "Discovered database location, or the explicitly selected location when inventory is empty."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_foundation || length(trimspace(var.firestore_location)) > 0
    error_message = "The database location requires completed destination discovery."
  }
}
variable "authorized_domains" {
  description = "Explicitly discovered application and destination Firebase Auth hostnames."
  type        = list(string)
  default     = []
  validation {
    condition = !var.enable_foundation || (length(var.authorized_domains) >= 2 && alltrue([
      for domain in var.authorized_domains : can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9-]+$", domain))
    ]))
    error_message = "Foundation requires explicit DNS hostnames for the application and Firebase Auth."
  }
}
variable "composite_indexes" {
  description = "Private source index inventory mapped to destination resources."
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
variable "enable_event_delivery" {
  description = "Enable only when the deployed API accepts authenticated Firestore CloudEvents."
  type        = bool
  default     = false
  validation {
    condition     = !var.enable_event_delivery || var.enable_foundation
    error_message = "Event delivery requires the destination foundation."
  }
}
variable "runtime_region" {
  type    = string
  default = "asia-southeast1"
}
variable "enable_sdk_config" {
  type    = bool
  default = false
  validation {
    condition     = !var.enable_sdk_config || var.enable_foundation
    error_message = "SDK configuration requires the destination foundation."
  }
}
variable "firebase_web_config" {
  description = "Validated private SDK payload, sent through a write-only Secret Manager field."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = ""
  validation {
    condition = !var.enable_sdk_config || try(
      jsondecode(var.firebase_web_config).projectId == var.target_project_id &&
      jsondecode(var.firebase_web_config).authDomain == "${var.target_project_id}.firebaseapp.com" &&
      jsondecode(var.firebase_web_config).appNamespace == "migrated" &&
      length(jsondecode(var.firebase_web_config).apiKey) > 0 &&
      length(jsondecode(var.firebase_web_config).appId) > 0, false
    )
    error_message = "SDK configuration must belong to the destination and use its permanent migrated app namespace."
  }
}
variable "sdk_config_version" {
  type    = number
  default = 1
  validation {
    condition     = var.sdk_config_version >= 1 && floor(var.sdk_config_version) == var.sdk_config_version
    error_message = "Use a positive integer write-only configuration version."
  }
}
variable "enable_google_auth" {
  type    = bool
  default = false
  validation {
    condition     = !var.enable_google_auth || var.enable_foundation
    error_message = "Google sign-in requires the destination foundation."
  }
}
variable "google_oauth_client_id" {
  type      = string
  sensitive = true
  default   = ""
}
variable "google_oauth_client_secret" {
  description = "Private operator-created web OAuth credential; retained only in protected remote Terraform state."
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = !var.enable_google_auth || (length(var.google_oauth_client_id) > 0 && length(var.google_oauth_client_secret) > 0)
    error_message = "Google sign-in requires the validated private OAuth web client."
  }
}
