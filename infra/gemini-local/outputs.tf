output "managed_apis" {
  description = "API service metadata only."
  value = sort(concat(
    keys(google_project_service.gemini),
    [for api in google_project_service.resource_manager : api.service],
    [for api in google_project_service.vertex_ai : api.service],
  ))
}

output "key_resource_name" {
  description = "Non-secret API key resource name, for metadata verification and a private getKeyString read."
  value       = var.provision_gemini ? trimprefix(local.key_path, "/") : null
}

output "service_account_email" {
  description = "Non-secret bound service-account identity."
  value       = try(google_service_account.gemini[0].email, null)
}

output "gemini_api_restriction" {
  description = "The single API restriction; no credential payload is exported."
  value       = var.provision_gemini ? "generativelanguage.googleapis.com" : null
}
