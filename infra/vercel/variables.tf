variable "api_token" {
  description = "Explicitly verified Vercel CLI account token, supplied in memory by the operator. Never persist or print it."
  type        = string
  sensitive   = true
  ephemeral   = true
  nullable    = false

  validation {
    condition     = length(trimspace(var.api_token)) > 0
    error_message = "Supply the verified account token explicitly. Ambient Vercel authentication is not used."
  }
}

variable "team_id" {
  description = "Verified Vercel team ID that owns the project; no ambient team selection."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^team_[A-Za-z0-9]+$", var.team_id))
    error_message = "Supply an explicit verified Vercel team ID."
  }
}

variable "project_name" {
  description = "Verified existing project name to import, or the approved new Vercel project name."
  type        = string
  nullable    = false

  validation {
    condition     = length(var.project_name) <= 100 && can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.project_name))
    error_message = "Use a lowercase project name of at most 100 letters, digits, or internal hyphens."
  }
}

variable "github_repository" {
  description = "Verified GitHub owner/repository with the Vercel GitHub installation already authorized."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$", var.github_repository))
    error_message = "Use owner/repository, without a URL, credentials, ref, or query string."
  }
}

variable "production_branch" {
  description = "Explicit main branch for the authorized automatic production deployment workflow."
  type        = string
  nullable    = false

  validation {
    condition     = var.production_branch == "main"
    error_message = "Production deploys from main. Supply production_branch = main explicitly."
  }
}

variable "environment_versions" {
  description = "Production frontend environment keys and positive write-only revision numbers. Increment a key's revision whenever its value changes."
  type        = map(number)
  nullable    = false

  validation {
    condition = (
      alltrue([for version in values(var.environment_versions) : version >= 1 && floor(version) == version]) &&
      length(setsubtract(toset(keys(var.environment_versions)), toset([
        "BACKEND_ORIGIN", "FIREBASE_WEB_CONFIG", "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "NEXT_PUBLIC_AUTH_MODE",
        "NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "NEXT_TELEMETRY_DISABLED",
      ]))) == 0 &&
      length(setsubtract(toset([
        "BACKEND_ORIGIN", "FIREBASE_WEB_CONFIG", "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "NEXT_PUBLIC_AUTH_MODE",
        "NEXT_PUBLIC_GOOGLE_AUTH_ENABLED",
      ]), toset(keys(var.environment_versions)))) == 0
    )
    error_message = "Provide all six frontend environment keys with positive integer revisions; only NEXT_TELEMETRY_DISABLED is additionally allowed. Backend/cloud credentials are forbidden here."
  }
}

variable "environment_values" {
  description = "Production frontend values from external private configuration. Ephemeral input feeds only write-only provider arguments."
  type        = map(string)
  sensitive   = true
  ephemeral   = true
  nullable    = false

  validation {
    condition     = toset(keys(var.environment_values)) == toset(keys(var.environment_versions))
    error_message = "Environment values and revision keys must match exactly."
  }

  validation {
    condition = (
      try(var.environment_values["NEXT_PUBLIC_API_URL"] == "", false) &&
      try(var.environment_values["NEXT_PUBLIC_USE_FIREBASE_EMULATORS"] == "false", false) &&
      try(var.environment_values["NEXT_PUBLIC_AUTH_MODE"] == "guest", false) &&
      try(var.environment_values["NEXT_PUBLIC_GOOGLE_AUTH_ENABLED"] == "true", false) &&
      try(var.environment_values["NEXT_TELEMETRY_DISABLED"] == "1", true)
    )
    error_message = "Production must use the same-origin gateway, real Firebase, guest access, and optional Google recovery. Telemetry, when configured, must be disabled."
  }

  validation {
    condition     = can(regex("^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\\.[a-z]{2,}$", try(var.environment_values["BACKEND_ORIGIN"], "")))
    error_message = "BACKEND_ORIGIN must be an explicit HTTPS hostname origin without credentials, port, path, query, or fragment."
  }

  validation {
    condition = try(
      alltrue([for key in ["projectId", "apiKey", "authDomain", "appId"] :
        length(trimspace(tostring(jsondecode(var.environment_values["FIREBASE_WEB_CONFIG"])[key]))) > 0
      ]) &&
      !startswith(tostring(jsondecode(var.environment_values["FIREBASE_WEB_CONFIG"])["projectId"]), "demo-") &&
      length(setsubtract(toset(keys(jsondecode(var.environment_values["FIREBASE_WEB_CONFIG"]))), toset([
        "projectId", "apiKey", "authDomain", "appId", "storageBucket", "messagingSenderId", "measurementId",
      ]))) == 0,
      false
    )
    error_message = "FIREBASE_WEB_CONFIG must contain the four nonempty public Firebase SDK fields for a real project, and only public SDK fields."
  }
}
