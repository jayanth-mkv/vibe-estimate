# Existing Firebase project billing link

This root manages one imported `google_billing_project_info` resource. It can
link the existing Firebase project to the same existing billing account as the
backend without adopting either project's lifecycle. It owns no APIs, IAM,
database, application service or budget.

The operator's private plan-only launcher verifies the named profile, existing
backend billing link, open account and private guardrails record. It imports the
Firebase project's current billing information into the existing private GCS
state bucket under `firebase-billing`, then requires a saved plan containing
exactly one in-place update and no resource creation, deletion or replacement.
The launcher has no apply operation. Billing changes require explicit approval
of that reviewed plan. Preparing/importing state does not enable billing.

`prevent_destroy` rejects removal while this configuration is present.
`deletion_policy = "ABANDON"` preserves the actual billing link if management is
later explicitly removed. Empty billing accounts are invalid inputs. The token
is ephemeral and enters only through the verified launcher's environment.

The existing backend budget is managed separately and this root does not extend
its project scope or create a spending limit. Actual account identifiers,
variables, plans and state stay outside the public checkout.

Offline checks use `terraform init -backend=false`, validation and mock-provider
tests. The provider's [billing information resource documentation](https://registry.terraform.io/providers/hashicorp/google/8.1.0/docs/resources/billing_project_info)
defines the import ID as `projects/<project-id>`.
