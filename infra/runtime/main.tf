terraform {
  required_version = ">= 1.13.5, < 2.0.0"
  # Bucket and the fixed runtime prefix are supplied by the native build trigger.
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.1.0"
    }
  }
}

provider "google" {
  project               = var.backend_project_id
  billing_project       = var.backend_project_id
  user_project_override = true
  # CI uses its attached build identity. Operator adoption uses an explicitly
  # supplied short-lived token, preserving the workstation's shared ADC.
  access_token = var.access_token
}

locals {
  origin = "https://vibeestimate-${var.project_number}.${var.region}.run.app"
  labels = { app = "vibeestimate", environment = "production", managed-by = "terraform", dev-tutorial = "cloud-run-ai-challenge" }
}

# Adopt the existing service before enabling its native main-branch trigger.
# This root owns no IAM, APIs, queues, scheduler, secrets, or Firebase settings.
resource "google_cloud_run_v2_service" "application" {
  project             = var.backend_project_id
  name                = "vibeestimate"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels
  template {
    service_account                  = var.runtime_service_account
    timeout                          = "120s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "2", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      startup_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 2
        period_seconds        = 3
        failure_threshold     = 30
      }
      dynamic "env" {
        for_each = {
          APP_ENV                    = "production", NODE_ENV = "production", AI_PROVIDER = "gemini",
          GEMINI_TRANSPORT           = "vertex", GEMINI_MODEL = var.gemini_model, VERTEX_AUTH_MODE = "runtime",
          VERTEX_PROJECT_ID          = var.backend_project_id, VERTEX_LOCATION = "global",
          FIREBASE_PROJECT_ID        = var.firebase_project_id, FIRESTORE_DATABASE_ID = var.firestore_database_id,
          GOOGLE_CLOUD_QUOTA_PROJECT = var.firebase_project_id, FRONTEND_ORIGIN = local.origin,
          ROOM_TASK_QUEUE            = var.task_queue, ROOM_TASK_SERVICE_ACCOUNT = var.task_service_account
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "FIREBASE_WEB_CONFIG"
        value_source {
          secret_key_ref {
            secret  = var.firebase_web_config_secret
            version = var.firebase_web_config_version
          }
        }
      }
    }
  }
  lifecycle { prevent_destroy = true }
}

output "public_url" { value = local.origin }
