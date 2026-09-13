mock_provider "restful" {}
override_resource {
  override_during = plan
  target          = restful_resource.source_permissions
  values          = { id = "/projects/example-source/config" }
}
variables {
  source_project_id          = "example-source"
  quota_project_id           = "example-backend"
  access_token               = "unused-offline-test-token"
  original_permissions       = { disabled_user_signup = false, disabled_user_deletion = false }
  original_anonymous_enabled = true
  original_email_enabled     = true
}
run "freeze_blocks_new_accounts_without_deleting_existing_identities" {
  command = plan
  variables { freeze = true }
  assert {
    condition = (
      restful_resource.source_permissions.path == "/projects/${var.source_project_id}/config" &&
      restful_resource.source_permissions.update_method == "PATCH" &&
      restful_resource.source_permissions.body.client.permissions.disabledUserSignup &&
      restful_resource.source_permissions.body.client.permissions.disabledUserDeletion &&
      !restful_resource.source_permissions.body.signIn.anonymous.enabled &&
      !restful_resource.source_permissions.body.signIn.email.enabled &&
      restful_resource.source_permissions.update_query.updateMask[0] == "client.permissions.disabledUserSignup,client.permissions.disabledUserDeletion,signIn.anonymous.enabled,signIn.email.enabled"
    )
    error_message = "Freeze must change only signup/deletion and local provider enable flags on the authorized source."
  }
}
run "rollback_restores_discovered_settings" {
  command = plan
  assert {
    condition = (
      !restful_resource.source_permissions.body.client.permissions.disabledUserSignup &&
      !restful_resource.source_permissions.body.client.permissions.disabledUserDeletion &&
      restful_resource.source_permissions.body.signIn.anonymous.enabled &&
      restful_resource.source_permissions.body.signIn.email.enabled &&
      restful_resource.source_permissions.read_query.fields[0] == "client(permissions),signIn(anonymous,email(enabled))" &&
      toset(keys(restful_resource.source_permissions.body)) == toset(["client", "signIn"])
    )
    error_message = "Rollback must restore the discovered flags without reading credentials or replacing domain ownership."
  }
}
run "reject_destination_as_source" {
  command = plan
  variables { source_project_id = "example-backend" }
  expect_failures = [var.source_project_id]
}
