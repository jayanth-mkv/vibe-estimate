# Firebase destination migration

This separate Terraform state prepares an existing, explicitly authorized backend
project to become the application's Firebase project. It never adopts the Google
Cloud project itself or changes the source Firebase project, billing, budgets, or
the Cloud Run revision.

Use private discovery and named-profile authentication outside the checkout.
Supply the existing private state bucket at initialization; the fixed state
prefix is `firebase-migration`. Credentials are short-lived and must not be
written into variable files or shared Application Default Credentials.

Apply reviewed saved plans in stages:

1. Import existing Firebase membership and enabled prerequisite APIs. Bootstrap
   enables missing Firestore and Rules APIs only.
2. After API activation, list destination databases and import any existing
   default database. Preserve its actual location. If the inventory is empty,
   select the new location explicitly before enabling `enable_foundation`.
   Import existing matching Auth, web app, rules, IAM and secret resources before
   planning. Inventory source indexes; standard default indexes need no resource.
3. Foundation creates a protected native default database, deny-all client rules,
   anonymous/password Auth with anonymous auto-delete disabled, the web app,
   limited runtime permissions, and a separate empty SDK secret. Runtime signing
   uses only `iam.serviceAccounts.signBlob`, bound to its own service account.
4. Read the destination web SDK configuration privately. Enable its write-only
   secret version separately after validating the destination and permanent
   `appNamespace: "migrated"`. A temporary session bridge additionally requires
   the source SDK fields and the final verified migration snapshot fingerprint.
5. Google sign-in requires an operator-created OAuth web client validated against
   the destination project and its Firebase Auth origin and redirect. Its client
   secret is sensitive and retained only in protected remote Terraform state.
6. Enable direct Eventarc delivery only after the API accepts authenticated
   Firestore CloudEvents. Only created `roomReviewOutbox/{jobId}` documents in the
   default database reach the existing Cloud Run service's `/internal/firestore`
   route, using a dedicated event service identity.

The SDK, Google provider and event flags default off. Database/Auth/web-app/rules
protection prevents accidental destruction. Source retirement is a separate,
verified operation after cutover; this root does not perform it.

Offline mock tests verify stage separation, database/rules protection, anonymous
retention, minimum IAM, event filtering and SDK/OAuth input guards. The repository
infrastructure check runs with `-backend=false` and does not use cloud credentials.
