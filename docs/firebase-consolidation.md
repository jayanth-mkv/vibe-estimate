# Firebase consolidation

The operator selected migration into the existing application project, followed by full verification and retirement of the old Firebase project. The destination foundation and migration implementation are being prepared. Production cutover and source retirement are not yet complete.

## Verified destination and source

The application project already has Firebase enabled; it was imported rather than recreated. Terraform enabled its Firestore API, and a fresh database inventory confirmed that the destination was empty. The foundation plan adds a protected native database in the existing application region, Auth, a web app, deny-all rules and scoped runtime permissions. This uses the application's existing billing arrangement.

The source has saved homes, projects, shared rooms, immutable revisions and Auth users. Most accounts are anonymous. Some documents exist in subcollections beneath missing `users` parent documents. A root-document-only copy would omit these records. No source Cloud Storage bucket was found.

## Required implementation

1. Adopt the existing destination Firebase project through Terraform. Discover and import matching resources, then prepare any missing protected database, deny-all rules, indexes, web app and Auth configuration. Keep anonymous account auto-deletion disabled. The destination needs a verified Google OAuth client and provider configuration; creating a web app does not establish that client.
2. Export Auth records privately and preserve UIDs, provider identities, claims and disabled status. Reject target collisions instead of overwriting them. Inventory every Firestore collection and missing ancestor, preserving nested records, typed values, references and business timestamps. Google managed Firestore export/import requires billing on both projects; a bounded Admin SDK/REST copy is an alternative for a small database.
3. Implement and verify a temporary session-transfer endpoint before changing browser configuration. It must verify a source-project ID token, revocation and membership in the migration manifest, then mint a destination custom token for the same imported UID. Never accept a client-supplied UID as authority. Use scoped service-account signing with no downloaded private key.
4. Restore source browser sessions using the original Firebase app names and configuration, exchange them through that endpoint, and verify the destination session before continuing. Changing the project setting alone cannot preserve guest access. Keep source Auth available for returning browsers while this bridge is needed.
5. Take a private initial backup, then use a controlled write pause for final copying and reconciliation. Drain old revision requests and quiesce source Auth signups before the final snapshot; blocking application API requests alone does not prevent Firebase signups. Verify document paths, counts and content fingerprints, ownership, shared-room membership and revision history. Keep a private source snapshot and a defined rollback point. Retire the source only after the data, application and returning-account gates pass.
6. Update the pinned public-config secret, runtime Firebase target, scoped IAM and native delivery metadata through their owning Terraform roots. Install and test document-created event delivery in the destination, then disable recurring reconciliation only after successful real delivery.

## Release gates

Verify returning guest access, Google sign-in and linking, independent designer/client identities, cross-user denial, reopened homes/projects, preserved versions and agreements, real event/task processing, duplicate suppression and an idle-log interval without scheduled recovery calls. Emulator tests and a successful data copy cannot establish the browser-session or production-sign-in gates.

The immediate operator setup is the destination Google OAuth web client. The official Terraform workflow requires its existing client ID and secret for the Google provider. Download the client JSON into the external private workspace; Terraform consumes it without writing its secret into source control. Complete Google sign-in before production cutover.

The initial read-only backup captured **87 accounts and 131 documents**, including nested documents beneath absent parents. Its immutable snapshot and manifest are outside the checkout; shared ADC was unchanged. No production records have been copied into the destination yet.

## Transfer and retirement contract

`scripts/firebase-migration-data.mts` binds the source, destination and named account to private operator configuration. It exports typed Firestore values and supported Auth records, rejects identity/document collisions, uses create-only destination writes, compares complete fingerprints, and rechecks source stability before granting bridge access. Unsupported password, tenant or MFA accounts stop the migration before writes. Infrastructure remains Terraform-managed.

The bridge accepts only a verified, non-revoked root-project source identity whose imported UID appears in `firebaseMigrationUsers`. It checks the destination account and mints a custom token for that same UID using self-scoped IAM signing. A verified-UID limit bounds exchanges without grouping every Next gateway request under loopback IP. Source tokens never authorize ordinary destination API operations.

The private SDK configuration's `migrationSnapshotSha256` and each mapping's `snapshotSha256` must contain the SHA256 of **the immutable `manifest.json` file**, reported as `manifestSha256` by the runner. They do not contain the manifest's separate `snapshotSha256` field. This binds the bridge to the reviewed source, destination and complete snapshot inventory.

Browsers restore original Firebase app names for designer, client and recovered-room sessions, transfer access, and verify the returned UID before continuing. A failed transfer preserves the source session and exposes retry. The destination's `appNamespace: "migrated"` remains after the temporary legacy configuration is retired so stored destination sessions stay discoverable. Explicit sign-out clears both projects for only the selected identity.

Importing UIDs does not move project-bound refresh tokens. The old Auth project must remain available for guest browsers that still need to return and transfer. If the operator confirms these are disposable test sessions, fresh sign-in can replace that continuity requirement; this is a separate decision from copying and retaining their saved records. Source deletion must use Terraform after this decision and the completed production checks.

References: [Firebase on an existing Cloud project](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project), [Terraform authentication setup](https://firebase.google.com/codelabs/firebase-terraform), [Auth imports](https://firebase.google.com/docs/auth/admin/import-users), [custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Firestore migration](https://firebase.google.com/docs/firestore/manage-data/move-data).
