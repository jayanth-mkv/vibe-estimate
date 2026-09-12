variable "backend_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.backend_project_id)) && !startswith(var.backend_project_id, "demo-")
    error_message = "Supply the verified existing backend project ID."
  }
}
variable "firebase_project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.firebase_project_id)) && !startswith(var.firebase_project_id, "demo-")
    error_message = "Supply the verified existing Firebase project ID."
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
    error_message = "Supply the existing backend region."
  }
}
variable "firebase_location" {
  type = string
  validation {
    condition     = can(regex("^([a-z]+-[a-z]+[0-9]|nam[0-9]|eur[0-9])$", var.firebase_location))
    error_message = "Supply the independently discovered existing Firestore location."
  }
}
variable "firestore_database_id" {
  type = string
  validation {
    condition     = var.firestore_database_id == "(default)" || can(regex("^[a-z][a-z0-9-]{2,61}[a-z0-9]$", var.firestore_database_id))
    error_message = "Supply the verified existing Firestore database ID."
  }
}
variable "access_token" {
  type      = string
  sensitive = true
  ephemeral = true
  nullable  = false
  validation {
    condition     = length(trimspace(var.access_token)) > 0
    error_message = "Use an explicit short-lived token from the authorized named profile."
  }
}
