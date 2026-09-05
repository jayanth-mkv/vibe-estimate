resource "vercel_project" "frontend" {
  name           = var.project_name
  team_id        = var.team_id
  framework      = "nextjs"
  root_directory = "frontend"
  node_version   = "22.x"

  # The lockfile and npm workspace declarations live one level above frontend/.
  # Builds run in frontend/ so next.config.ts also resolves the monorepo root.
  install_command = "cd .. && npm ci"
  build_command   = "npm run build"

  git_repository = {
    type              = "github"
    repo              = var.github_repository
    production_branch = var.production_branch
  }
  git_provider_options = {
    create_deployments = true
  }
  git_comments = {
    on_commit       = false
    on_pull_request = false
  }
  git_fork_protection = true

  # Explicitly expose production while retaining access control on previews.
  # Standard Protection's provider default also protects generated prod URLs.
  vercel_authentication = {
    deployment_type = "only_preview_deployments"
  }
  password_protection        = null
  trusted_ips                = null
  enable_production_feedback = false
  protected_sourcemaps       = true
  directory_listing          = false

  resource_config = {
    function_default_regions = ["sin1"]
    # The same-origin gateway waits up to 65s and declares maxDuration = 70.
    function_default_timeout = 90
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Do not add inline vercel_project.environment: it conflicts with these
# standalone resources. Version keys are nonsecret and non-ephemeral so they
# can identify resources; values never enter the plan or state.
resource "vercel_project_environment_variable" "production" {
  for_each = var.environment_versions

  team_id          = var.team_id
  project_id       = vercel_project.frontend.id
  key              = each.key
  target           = ["production"]
  sensitive        = true
  value_wo         = try(var.environment_values[each.key], "")
  value_wo_version = each.value
}

# GitHub pushes to main launch production builds through the project connection.
# Terraform owns project settings and environments, not individual deployments.
# There are no local-file, prebuilt, directory, or direct-upload resources.
