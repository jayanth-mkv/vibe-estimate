resource "google_cloud_run_v2_service" "backend" {
  count               = var.deploy_backend ? 1 : 0
  project             = var.backend_project_id
  name                = "vibeestimate-api"
  location            = var.region
  description         = "VibeEstimate authenticated API; Firebase ID-token authorization is enforced in the application."
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels

  scaling {
    max_instance_count = var.max_instances
  }

  template {
    service_account                  = google_service_account.runtime[0].email
    timeout                          = "60s"
    max_instance_request_concurrency = 20
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
    containers {
      image = var.backend_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      dynamic "env" {
        for_each = {
          NODE_ENV              = "production"
          APP_ENV               = "production"
          AI_PROVIDER           = "gemini"
          FIREBASE_PROJECT_ID   = var.firebase_project_id
          FIRESTORE_DATABASE_ID = var.firestore_database_id
          FRONTEND_ORIGIN       = one(var.frontend_origins)
          GEMINI_MODEL          = var.gemini_model
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini[0].secret_id
            version = var.write_gemini_secret_version ? google_secret_manager_secret_version.gemini[0].version : var.gemini_secret_version
          }
        }
      }
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        timeout_seconds       = 2
        failure_threshold     = 12
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.runtime_gemini, google_project_iam_member.runtime_firestore]
}

# Browser clients have Firebase tokens, not Cloud Run IAM identity tokens.
# Transport is public; every data/AI endpoint must verify Firebase identity/UID.
resource "google_cloud_run_v2_service_iam_member" "browser_transport" {
  count    = var.deploy_backend ? 1 : 0
  project  = var.backend_project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
