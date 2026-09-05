output "project_id" {
  description = "Managed or imported Vercel project ID; contains no credential."
  value       = vercel_project.frontend.id
}

output "project_name" {
  description = "Managed project name used to discover its production domain before launch."
  value       = vercel_project.frontend.name
}
