# Separate state/root: imports only existing Firebase core resources.
# Both adoption switches default false. Missing remote IDs fail import instead
# of silently creating a replacement project or database.
terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project = var.firebase_project_id
}
provider "google-beta" {
  project = var.firebase_project_id
}

variable "firebase_project_id" {
  description = "Existing verified Firebase project, supplied from private configuration outside the repository."
  type        = string
}

variable "adopt_firebase_project" {
  type    = bool
  default = false
}

variable "adopt_firestore_database" {
  type    = bool
  default = false
}

variable "firestore_database_id" {
  type    = string
  default = "(default)"
  validation {
    condition     = !var.publish_firestore_rules || var.firestore_database_id == "(default)"
    error_message = "The prepared rules release targets (default). Configure the correct named-database release before publishing rules for another database."
  }
}

variable "firestore_location" {
  description = "Exact discovered database location; do not substitute the Cloud Run region."
  type        = string
  default     = ""
  validation {
    condition     = !var.adopt_firestore_database || length(trimspace(var.firestore_location)) > 0
    error_message = "Discover the existing Firestore location before adoption; location changes can replace a database."
  }
}

variable "publish_firestore_rules" {
  description = "Explicitly review and publish repository rules after importing the existing release."
  type        = bool
  default     = false
}

locals {
  firebase_adoption = var.adopt_firebase_project ? toset(["existing"]) : toset([])
  database_adoption = var.adopt_firestore_database ? toset(["existing"]) : toset([])
  rules_adoption    = var.publish_firestore_rules ? toset(["existing"]) : toset([])
}

resource "google_firebase_project" "existing" {
  provider = google-beta
  for_each = local.firebase_adoption
  project  = var.firebase_project_id
  lifecycle {
    prevent_destroy = true
  }
}
import {
  for_each = local.firebase_adoption
  to       = google_firebase_project.existing[each.key]
  id       = "projects/${var.firebase_project_id}"
}

resource "google_firestore_database" "existing" {
  for_each                = local.database_adoption
  project                 = var.firebase_project_id
  name                    = var.firestore_database_id
  location_id             = var.firestore_location
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"
  lifecycle {
    prevent_destroy = true
  }
}
import {
  for_each = local.database_adoption
  to       = google_firestore_database.existing[each.key]
  id       = "projects/${var.firebase_project_id}/databases/${var.firestore_database_id}"
}

resource "google_firebaserules_ruleset" "firestore" {
  for_each = local.rules_adoption
  project  = var.firebase_project_id
  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../firestore.rules")
    }
  }
  deletion_policy = "ABANDON"
}

resource "google_firebaserules_release" "firestore" {
  for_each        = local.rules_adoption
  project         = var.firebase_project_id
  name            = "cloud.firestore"
  ruleset_name    = "projects/${var.firebase_project_id}/rulesets/${google_firebaserules_ruleset.firestore[each.key].name}"
  deletion_policy = "ABANDON"
  lifecycle {
    prevent_destroy = true
  }
}
import {
  for_each = local.rules_adoption
  to       = google_firebaserules_release.firestore[each.key]
  id       = "projects/${var.firebase_project_id}/releases/cloud.firestore"
}
