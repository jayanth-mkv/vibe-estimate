# Infrastructure

Local development uses emulators. This directory prepares a later Terraform deployment; no cloud resources are provisioned by default.

- [Setup, validation, import and release steps](../docs/terraform-setup.md)
- [Resource and cost inventory](../docs/infrastructure-inventory.md)
- Main root: Cloud Run, Artifact Registry, runtime identity, Secret Manager, optional image-build trigger.
- `firebase-adoption/`: separate state, explicit imports of an existing Firebase project/database/rules release. It never assumes a new Firebase project is needed.
- Public examples contain generic IDs. Actual account/project mapping remains in private configuration outside this public checkout.

Use the local launcher from this directory:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 fmt -check -recursive
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 test -no-color
```

The tests mock Google providers. A passing test is evidence about configuration, not a live-cloud deployment or IAM integration test.
