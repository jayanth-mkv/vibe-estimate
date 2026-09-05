output "project_mapping" {
  value = {
    backend    = var.backend_project_id
    firebase   = var.firebase_project_id
    cloudbuild = var.cloudbuild_project_id
  }
}

output "backend_url" {
  value       = var.deploy_backend ? google_cloud_run_v2_service.backend[0].uri : null
  description = "Null until a real image is deployed."
}

output "image_repository" {
  value = var.provision_backend_infrastructure ? "${var.region}-docker.pkg.dev/${var.backend_project_id}/vibeestimate/backend" : null
}

output "runtime_service_account" {
  value = var.provision_backend_infrastructure ? google_service_account.runtime[0].email : null
}

output "gemini_secret_resource" {
  value       = var.provision_backend_infrastructure ? google_secret_manager_secret.gemini[0].id : null
  description = "Metadata only; no secret payload is output."
}
