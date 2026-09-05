mock_provider "vercel" {}

variables {
  api_token         = "synthetic-mock-token-never-used-for-cloud"
  team_id           = "team_synthetic"
  project_name      = "example-frontend"
  github_repository = "example-owner/example-repository"
  production_branch = "main"
  environment_versions = {
    BACKEND_ORIGIN                     = 1
    FIREBASE_WEB_CONFIG                = 1
    NEXT_PUBLIC_API_URL                = 1
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 1
    NEXT_PUBLIC_AUTH_MODE              = 1
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = 1
  }
  environment_values = {
    BACKEND_ORIGIN                     = "https://backend.example.test"
    FIREBASE_WEB_CONFIG                = "{\"projectId\":\"example-firebase\",\"apiKey\":\"synthetic-public-web-key\",\"authDomain\":\"example-firebase.firebaseapp.com\",\"appId\":\"synthetic-web-app\"}"
    NEXT_PUBLIC_API_URL                = ""
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "false"
    NEXT_PUBLIC_AUTH_MODE              = "guest"
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = "true"
  }
}

run "configure_main_git_deployments" {
  command = plan

  assert {
    condition = (
      vercel_project.frontend.team_id == var.team_id &&
      vercel_project.frontend.git_repository.repo == var.github_repository &&
      vercel_project.frontend.git_repository.production_branch == "main" &&
      vercel_project.frontend.git_repository.type == "github" &&
      vercel_project.frontend.git_provider_options.create_deployments
    )
    error_message = "The project must bind the explicit team/repository and main branch with automatic Git deployments enabled."
  }
  assert {
    condition = (
      vercel_project.frontend.root_directory == "frontend" &&
      vercel_project.frontend.framework == "nextjs" &&
      vercel_project.frontend.node_version == "22.x" &&
      vercel_project.frontend.install_command == "cd .. && npm ci" &&
      vercel_project.frontend.build_command == "npm run build" &&
      vercel_project.frontend.resource_config.function_default_regions == toset(["sin1"]) &&
      vercel_project.frontend.resource_config.function_default_timeout == 90
    )
    error_message = "The frontend must build from the workspace lockfile with a bounded Singapore runtime that accommodates its gateway timeout."
  }
  assert {
    condition = (
      vercel_project.frontend.vercel_authentication.deployment_type == "only_preview_deployments" &&
      vercel_project.frontend.password_protection == null &&
      vercel_project.frontend.trusted_ips == null &&
      !vercel_project.frontend.git_comments.on_commit &&
      !vercel_project.frontend.git_comments.on_pull_request &&
      vercel_project.frontend.git_fork_protection
    )
    error_message = "Production must be publicly accessible, previews protected, Git comments off, and fork protection retained."
  }
  assert {
    condition = alltrue([for item in vercel_project_environment_variable.production :
      item.target == toset(["production"]) && item.sensitive && item.value == null && item.value_wo == null && item.value_wo_version == 1
    ])
    error_message = "Values must use write-only arguments and production-only sensitive storage; values must not appear in the planned resource state."
  }
}

run "reject_missing_explicit_account" {
  command = plan
  variables {
    api_token = ""
    team_id   = ""
  }
  expect_failures = [var.api_token, var.team_id]
}

run "reject_repository_url_and_non_main_branch" {
  command = plan
  variables {
    github_repository = "https://github.com/example-owner/example-repository"
    production_branch = "release/example"
  }
  expect_failures = [var.github_repository, var.production_branch]
}

run "reject_emulator_or_direct_browser_backend" {
  command = plan
  variables {
    environment_values = {
      BACKEND_ORIGIN                     = "http://127.0.0.1:8080"
      FIREBASE_WEB_CONFIG                = "{\"projectId\":\"demo-example\",\"apiKey\":\"synthetic\",\"authDomain\":\"localhost\",\"appId\":\"synthetic\"}"
      NEXT_PUBLIC_API_URL                = "https://backend.example.test"
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true"
      NEXT_PUBLIC_AUTH_MODE              = "guest"
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = "true"
    }
  }
  expect_failures = [var.environment_values]
}

run "reject_backend_credential_keys_even_when_values_match" {
  command = plan
  variables {
    environment_versions = {
      BACKEND_ORIGIN                     = 1
      FIREBASE_WEB_CONFIG                = 1
      NEXT_PUBLIC_API_URL                = 1
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 1
      NEXT_PUBLIC_AUTH_MODE              = 1
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = 1
      GEMINI_API_KEY                     = 1
    }
    environment_values = {
      BACKEND_ORIGIN                     = "https://backend.example.test"
      FIREBASE_WEB_CONFIG                = "{\"projectId\":\"example-firebase\",\"apiKey\":\"synthetic\",\"authDomain\":\"example-firebase.firebaseapp.com\",\"appId\":\"synthetic\"}"
      NEXT_PUBLIC_API_URL                = ""
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "false"
      NEXT_PUBLIC_AUTH_MODE              = "guest"
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = "true"
      GEMINI_API_KEY                     = "synthetic-forbidden-value"
    }
  }
  expect_failures = [var.environment_versions]
}

run "reject_invalid_revisions_with_valid_keys" {
  command = plan
  variables {
    environment_versions = {
      BACKEND_ORIGIN                     = 0
      FIREBASE_WEB_CONFIG                = 1
      NEXT_PUBLIC_API_URL                = 1
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 1
      NEXT_PUBLIC_AUTH_MODE              = 1
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = 1
    }
  }
  expect_failures = [var.environment_versions]
}

run "reject_missing_value_for_a_revision" {
  command = plan
  variables {
    environment_values = {
      BACKEND_ORIGIN                     = "https://backend.example.test"
      FIREBASE_WEB_CONFIG                = "{\"projectId\":\"example-firebase\",\"apiKey\":\"synthetic\",\"authDomain\":\"example-firebase.firebaseapp.com\",\"appId\":\"synthetic\"}"
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "false"
      NEXT_PUBLIC_AUTH_MODE              = "guest"
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED    = "true"
    }
  }
  expect_failures = [var.environment_values]
}
