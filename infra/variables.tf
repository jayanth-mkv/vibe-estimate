variable "backend_project_id" {
  description = "Explicit existing GCP project for Cloud Run and its supporting resources. Do not infer from Firebase."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.backend_project_id))
    error_message = "Set the verified existing backend project ID."
  }
}

variable "firebase_project_id" {
  description = "Existing Firebase project deliberately selected by the user."
  type        = string
}

variable "region" {
  description = "Explicit Cloud Run and Artifact Registry region; independent of Firestore location."
  type        = string
  default     = "asia-south1"
}

variable "provision_backend_infrastructure" {
  description = "Opt in only after discovery/import and review. False creates no resources."
  type        = bool
  default     = false
}

variable "deploy_backend" {
  description = "Deploy an actual tested image after infrastructure and secret provisioning."
  type        = bool
  default     = false
  validation {
    condition     = !var.deploy_backend || var.provision_backend_infrastructure
    error_message = "Backend deployment requires provision_backend_infrastructure=true."
  }
}

variable "backend_image" {
  description = "Immutable image digest, e.g. REGION-docker.pkg.dev/PROJECT/REPO/backend@sha256:..."
  type        = string
  default     = ""
  validation {
    condition     = !var.deploy_backend || can(regex("^[a-z0-9-]+-docker[.]pkg[.]dev/.+@sha256:[a-f0-9]{64}$", var.backend_image))
    error_message = "Deployment requires a real Artifact Registry image pinned by its 64-character SHA256 digest."
  }
}

variable "frontend_origins" {
  description = "Single exact production HTTPS origin allowed by backend CORS, without trailing slash."
  type        = list(string)
  default     = []
  validation {
    condition     = !var.deploy_backend || (length(var.frontend_origins) == 1 && alltrue([for origin in var.frontend_origins : can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", origin))]))
    error_message = "Provide exactly one HTTPS frontend origin for this deployment."
  }
}

variable "gemini_model" {
  description = "A Gemini model verified as available for the intended API key at deployment time."
  type        = string
  default     = ""
  validation {
    condition     = !var.deploy_backend || length(trimspace(var.gemini_model)) > 0
    error_message = "Select and verify a Gemini model before deployment."
  }
}

variable "firestore_database_id" {
  type        = string
  description = "Existing Firestore database; discovery must confirm its existence/location before deployment."
  default     = "(default)"
}

variable "gemini_secret_version" {
  description = "Existing numeric Secret Manager version; never latest. Used when Terraform is not creating a version."
  type        = string
  default     = ""
  validation {
    condition     = !var.deploy_backend || var.write_gemini_secret_version || can(regex("^[1-9][0-9]*$", var.gemini_secret_version))
    error_message = "Use a known numeric secret version or explicitly write one with Terraform."
  }
}

variable "write_gemini_secret_version" {
  description = "Optional later secure provisioning: write-only ephemeral input, no secret payload in state."
  type        = bool
  default     = false
  validation {
    condition     = !var.write_gemini_secret_version || var.provision_backend_infrastructure
    error_message = "Secret provisioning requires infrastructure opt-in."
  }
}

variable "gemini_api_key" {
  description = "Supply interactively or via a short-lived environment variable; never a tfvars/CLI literal."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
}

variable "gemini_secret_rotation" {
  description = "Increment only when intentionally rotating the write-only secret payload."
  type        = number
  default     = 1
  validation {
    condition     = var.gemini_secret_rotation >= 1 && floor(var.gemini_secret_rotation) == var.gemini_secret_rotation
    error_message = "Use a positive integer rotation counter."
  }
}

variable "max_instances" {
  description = "Small capacity limit for this prototype; does not cap all cloud or Gemini charges."
  type        = number
  default     = 1
  validation {
    condition     = contains([1, 2], var.max_instances)
    error_message = "This prototype allows only 1 or 2 maximum instances."
  }
}

variable "cloudbuild_project_id" {
  description = "Project containing the user's existing Cloud Build connection."
  type        = string
}

variable "cloudbuild_region" {
  type        = string
  description = "Region of the existing connection, not inferred from the backend region."
  default     = "asia-south1"
}

variable "create_cloudbuild_trigger" {
  type        = bool
  description = "Opt in after discovering the complete existing repository resource name."
  default     = false
  validation {
    condition     = !var.create_cloudbuild_trigger || var.provision_backend_infrastructure
    error_message = "Cloud Build setup requires infrastructure opt-in."
  }
}

variable "cloudbuild_repository" {
  description = "Full existing projects/.../connections/.../repositories/... resource; connection alone is insufficient."
  type        = string
  default     = ""
  validation {
    condition     = !var.create_cloudbuild_trigger || can(regex("^projects/${var.cloudbuild_project_id}/locations/${var.cloudbuild_region}/connections/[^/]+/repositories/[^/]+$", var.cloudbuild_repository))
    error_message = "Supply the discovered repository child of the existing connection in the configured Cloud Build project/region."
  }
}

variable "enable_cloudbuild_trigger" {
  type        = bool
  description = "Created triggers remain disabled until an intentional release decision."
  default     = false
}

variable "cloudbuild_branch_pattern" {
  type        = string
  description = "RE2 branch pattern; only trusted code should be allowed to run as the build service account."
  default     = "^main$"
}
