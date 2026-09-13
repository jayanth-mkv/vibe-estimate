# Source project retirement

This isolated root imports the exact existing source Google Cloud project. It defaults to a protected adoption, retains discovered metadata, and never creates a replacement project. Account, project, state bucket, inventory, plans and credentials remain in the private operator directory.

The private plan guard must reject every resource except `google_project.source[0]`, reject all creates/replacements, and allow only the explicitly reviewed deletion-policy transition or exact source-project deletion. A delete preview does not establish readiness to delete.

Before enabling `deletion_ready`, verify the selected destination account/data fingerprints, deployed destination Firebase configuration, Google sign-in and ownership, event delivery, retained export/backup, and the source resource inventory. The old project may contain a default empty Hosting site and automatically enabled APIs; inspect actual resources and Hosting release history before identifying anything as unused.

Retire the old state ownership before final project deletion:

- The production state owns source Firebase IAM roles/members and its separately masked authorized-domain configuration. Remove those source-only declarations with reviewed Terraform `removed` blocks using `destroy = false`; retain target backend services, queue, Gemini and secrets.
- The historical cross-project events state owns enabled source APIs. Retire that root through reviewed `removed` blocks without disabling shared APIs or creating its never-applied Workflow/trigger resources.
- The abandoned billing proposal owns only imported source billing information. Remove that ownership without linking billing or modifying the destination account.
- The source-freeze state owns four masked source Auth leaves. Retain the freeze until deletion, then retire its ownership without attempting to restore providers.
- Inspect any Firebase adoption state and release metadata for remaining source references. Keep the permanent destination app namespace, and remove obsolete source-only launch paths so later runs cannot recreate the old arrangement.

Apply a reviewed `deletion_ready = true` plan only after those checks. It changes the Terraform deletion policy while keeping the project present. Then set `retire_source = true`, refresh and inspect a new saved plan, and apply only the one source-project deletion. Record the resulting Cloud Resource Manager lifecycle state and final target health. Google retains a recovery window after project shutdown; a requested shutdown is distinct from eventual permanent deletion.
