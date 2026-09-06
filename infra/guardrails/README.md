# Cost guardrails

This root manages the Cloud Billing budget that measures the authorized backend
project's monthly spend, plus the Budget API it needs. It owns nothing else:
no identity, no application resource, no notification channel.

## What a budget does and does not do

A budget **observes and alerts**. It never blocks an API call, throttles a
service, or stops spend. Read every claim about this root with that limit in
mind.

The caps that actually bound cost stay where they already are, and this root
does not duplicate or replace them:

| Enforcing control | Where it lives |
| --- | --- |
| Maximum 2 instances, 8 concurrent requests per instance, 2 vCPU / 1 GiB, 120s request timeout, scale to zero when idle | [`runtime/`](../runtime/README.md) service template |
| Bounded model call, message and retry limits | Backend application code |

## Configuration

The budget is scoped by project number, so it measures one project even though
it belongs to the billing account. `currency_code` must equal the billing
account's own currency; the API rejects any other code. `budget_units` is a
whole-currency amount — the Budget API does not use minor units.

Alerts reach the billing account's administrators and users by email. There is
deliberately no `all_updates_rule`: a Pub/Sub topic or Monitoring channel would
be further resources with their own IAM, and none is needed to watch one
allocation.

`disable_on_destroy = false` keeps the Budget API enabled if this root is ever
removed, so that budget reads elsewhere keep working.

## Running it

Actual project, project number and billing account come from a private tfvars
file outside the checkout; the committed example holds placeholders only. State
stays in the operator's private directory, and provisioning requires both the
explicit `provision_guardrails` opt-in and a short-lived access token from the
verified profile. Shared ADC is never used and is hashed before and after.

Offline configuration checks need no credential and create nothing:

```powershell
rtk proxy node infra/scripts/check.mjs
```

Executed resource changes belong in the
[infrastructure inventory](../../docs/infrastructure-inventory.md).
