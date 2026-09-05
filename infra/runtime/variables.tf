variable "backend_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.backend_project_id)) && !startswith(var.backend_project_id, "demo-")
    error_message = "Select the verified real backend project."
  }
}
variable "firebase_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.firebase_project_id)) && !startswith(var.firebase_project_id, "demo-")
    error_message = "Select the existing real Firebase project."
  }
}
variable "project_number" {
  type = string
  validation {
    condition     = can(regex("^[1-9][0-9]{5,19}$", var.project_number))
    error_message = "Supply the verified backend project number."
  }
}
variable "region" {
  type = string
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]$", var.region))
    error_message = "Supply the existing Cloud Run region, independently of the build connection region."
  }
}
variable "firestore_database_id" {
  type = string
  validation {
    condition     = var.firestore_database_id == "(default)" || can(regex("^[a-z][a-z0-9-]{2,61}[a-z0-9]$", var.firestore_database_id))
    error_message = "Supply the verified existing Firestore database ID."
  }
}
variable "gemini_model" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._-]+$", var.gemini_model))
    error_message = "Supply an explicitly verified Gemini model."
  }
}
variable "image" {
  type = string
  validation {
    condition     = can(regex("^${var.region}-docker[.]pkg[.]dev/${var.backend_project_id}/[a-z0-9._-]+/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Deploy only an immutable image digest from the selected backend project's regional Artifact Registry."
  }
}
variable "runtime_service_account" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]+@${var.backend_project_id}[.]iam[.]gserviceaccount[.]com$", var.runtime_service_account))
    error_message = "Supply the existing runtime service account in the backend project."
  }
}
variable "task_queue" {
  type = string
  validation {
    condition     = can(regex("^projects/${var.backend_project_id}/locations/${var.region}/queues/[A-Za-z0-9_-]+$", var.task_queue))
    error_message = "Supply the existing review queue in the backend project and service region."
  }
}
variable "task_service_account" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]+@${var.backend_project_id}[.]iam[.]gserviceaccount[.]com$", var.task_service_account))
    error_message = "Supply the existing task-delivery identity in the backend project."
  }
}
variable "firebase_web_config_secret" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+$", var.firebase_web_config_secret))
    error_message = "Supply the existing Secret Manager secret ID, never its payload."
  }
}
variable "firebase_web_config_version" {
  type = string
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.firebase_web_config_version))
    error_message = "Supply the existing numeric secret version; latest is not allowed."
  }
}
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
  default   = null
  validation {
    condition     = var.access_token == null ? true : length(trimspace(var.access_token)) > 0
    error_message = "Operator adoption requires a nonempty explicit short-lived token; CI uses its attached identity."
  }
}
