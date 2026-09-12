# Firebase consolidation assessment

The operator requested investigating a single application/Firebase project as an alternative to the cross-project event dispatcher. This is a read-only feasibility assessment, not a completed migration.

## Verified destination and source

The application project already has Firebase enabled, so it must be imported rather than recreated. It has no registered web app or initialized Auth configuration. The Firestore API is disabled; that alone does not establish whether an old database exists. Discover the database after API activation before creating anything.

The source has saved homes, projects, shared rooms, immutable revisions and Auth users. Most accounts are anonymous. Some documents exist in subcollections beneath missing `users` parent documents. A root-document-only copy would omit these records. No source Cloud Storage bucket was found.

## Required implementation

1. Adopt the existing destination Firebase project through Terraform. Discover and import matching resources, then prepare any missing protected database, deny-all rules, indexes, web app and Auth configuration. Keep anonymous account auto-deletion disabled. The destination needs a verified Google OAuth client and provider configuration; creating a web app does not establish that client.
2. Export Auth records privately and preserve UIDs, provider identities, claims and disabled status. Reject target collisions instead of overwriting them. Inventory every Firestore collection and missing ancestor, preserving nested records, typed values, references and business timestamps. Google managed Firestore export/import requires billing on both projects; a bounded Admin SDK/REST copy is an alternative for a small database.
3. Implement and verify a temporary session-transfer endpoint before changing browser configuration. It must verify a source-project ID token, revocation and membership in the migration manifest, then mint a destination custom token for the same imported UID. Never accept a client-supplied UID as authority. Use scoped service-account signing with no downloaded private key.
4. Restore source browser sessions using the original Firebase app names and configuration, exchange them through that endpoint, and verify the destination session before continuing. Changing the project setting alone cannot preserve guest access. Keep source Auth available for returning browsers while this bridge is needed.
5. Take a verified initial copy, then use a controlled write pause for final copying and reconciliation. Verify document paths, counts and content fingerprints, ownership, shared-room membership and revision history. Keep a private source snapshot and a defined rollback point; do not delete the source project.
6. Update the pinned public-config secret, runtime Firebase target, scoped IAM and native delivery metadata through their owning Terraform roots. Install and test document-created event delivery in the destination, then disable recurring reconciliation only after successful real delivery.

## Release gates

Verify returning guest access, Google sign-in and linking, independent designer/client identities, cross-user denial, reopened homes/projects, preserved versions and agreements, real event/task processing, duplicate suppression and an idle-log interval without scheduled recovery calls. Emulator tests and a successful data copy cannot establish the browser-session or production-sign-in gates.

The immediate unresolved setup is the destination Google OAuth client. The official Terraform workflow requires an existing client ID and secret for the Google provider. No compatible destination client or source-client redirect configuration was verified during this assessment. No users or documents have been exported or migrated.

References: [Firebase on an existing Cloud project](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project), [Terraform authentication setup](https://firebase.google.com/codelabs/firebase-terraform), [Auth imports](https://firebase.google.com/docs/auth/admin/import-users), [custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Firestore migration](https://firebase.google.com/docs/firestore/manage-data/move-data).
