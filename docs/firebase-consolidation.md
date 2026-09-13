# Firebase consolidation

The operator selected migration into the existing application project, followed by full verification and retirement of the old Firebase project. Production uses Google-only sign-in. Native delivery of `e3ee954` completed the initial Google account and saved-work cutover. A subsequent explicit request expands data migration to formerly guest-owned work, assigning ownership to the existing Google workspace without importing anonymous Auth accounts. Source retirement remains gated on verification of this expanded data set and the operator's actual Google sign-in and saved-work check.

## Verified destination and source

The application project already had Firebase enabled; it was imported rather than recreated. An initial database inventory confirmed that the destination was empty. Terraform applied a protected native database in the application region, Auth, a web app, deny-all rules and scoped runtime permissions. The operator's existing Google provider was adopted. This uses the application's existing billing arrangement.

The source has saved homes, projects, shared rooms, immutable revisions and Auth users. Most accounts are anonymous. Some documents exist in subcollections beneath missing `users` parent documents. A root-document-only copy would omit these records. No source Cloud Storage bucket was found.

## Required implementation

1. Adopt the existing destination Firebase project through Terraform. Discover and import matching resources, then prepare any missing protected database, deny-all rules, indexes, web app and Auth configuration. Keep anonymous account auto-deletion disabled. The destination needs a verified Google OAuth client and provider configuration; creating a web app does not establish that client.
2. Export Auth records privately and preserve UIDs, provider identities, claims and disabled status. Reject target collisions instead of overwriting them. Inventory every Firestore collection and missing ancestor, preserving nested records, typed values, references and business timestamps. Google managed Firestore export/import requires billing on both projects; a bounded Admin SDK/REST copy is an alternative for a small database.
3. Select only Google-linked identities and their complete owned document graph from the immutable full snapshot. Validate related records, ownership and references before copying; stop on unsupported or excluded dependencies. Do not import guest accounts or create guest transfer mappings for this rollout.
4. Configure the destination with `authMode: "google"` and the permanent destination app namespace, without legacy SDK settings. Require Google sign-in in the interface and verified Google provider identity in the API. Disable anonymous, email/password and phone creation in destination Auth through Terraform. Import the existing Google UID so signing in restores ownership of its copied work.
5. Take a private initial backup, then use a controlled write pause for final copying and reconciliation. Drain old revision requests and quiesce source Auth signups before the final snapshot; blocking application API requests alone does not prevent Firebase signups. Verify document paths, counts and content fingerprints, ownership, shared-room membership and revision history. Keep a private source snapshot and a defined rollback point. Retire the source only after the data, application and returning-account gates pass.
6. Update the pinned public-config secret, runtime Firebase target, scoped IAM and native delivery metadata through their owning Terraform roots. Install and test document-created event delivery in the destination, then disable recurring reconciliation only after successful real delivery.

## Release gates

Verify Google sign-in, anonymous-creation denial, independent designer/client identities, cross-user denial, reopened homes/projects, preserved versions and agreements, real event/task processing, duplicate suppression and an idle-log interval without scheduled recovery calls. Emulator tests and a successful data copy cannot establish the production Google sign-in gate. Guest-session continuity is excluded by the operator's scope decision.

The operator enabled Google sign-in in the destination Firebase console. A read through the explicitly authorized cloud account verified the enabled provider and matching web app. Terraform adopts that existing provider using credentials read directly into private configuration; a separate downloaded OAuth client is unnecessary. Complete the real Google sign-in check against the deployed destination before retirement.

The final frozen backup captured **87 accounts and 131 documents**, including nested documents beneath absent parents, with unchanged fingerprints from the initial backup. The Google-only copy verified **one account and 15 documents** in the destination, with **86 accounts and 116 documents excluded** and no transfer mappings. The selected graph has no guest identity dependency. The full snapshot and manifest remain private; the copier rechecked the complete source before and after writing and verified every selected destination record. Shared ADC was unchanged.

After cutover, production verification authenticated that imported UID and read the saved home, project and all ten revisions through the API. Two synthetic messages completed real Eventarc/Cloud Tasks/Gemini processing, and replay did not add work. Access-denial checks passed. Conditional test cleanup restored the exact owner index and verified all fifteen original records unchanged. This used a programmatic Firebase token; the operator's Google browser sign-in remains a separate retirement gate. See the [event verification record](event-delivery-verification.md).

## Optional transfer capability and retirement contract

### Explicit consolidation of guest-owned work

`scripts/firebase-workspace-consolidation.mts` builds an offline, bounded plan against an immutable source manifest and a fresh destination backup. It rewrites owner paths and ownership fields, merges the four owner indexes, preserves current destination data and adds historical usage to current counters. A private mapping receipt records original ownership without exposing migration metadata in ordinary home/project responses. No anonymous identities, guest login bridge, delivery outbox records or model calls are created.

Original client IDs, message senders and decision actors remain unchanged. Historical acceptance must not become acceptance by the new owner. Shared draft and agreement history is retained; imported rooms are paused. Reserved review-snapshot project IDs may remain unmaterialized until the ordinary prepare-draft action. Imported room IDs receive a server-only allowance that preserves the destination's remaining room-creation slots; malformed metadata grants no extra capacity and spent model limits remain enforced.

The private executor backs up the current target, rechecks the frozen source, binds the exact plan hash and commits the complete change atomically. Creates require absence; merged indexes require their original update times. A concurrent change stops the import. Reads at the returned commit time compare the entire destination against the reviewed plan, including every untouched pre-existing record. The source is rechecked afterward and no Auth writes occur. A deterministic receipt prevents replay from overwriting later user edits. See [Firestore atomic commits](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit) and [write preconditions](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Precondition).

The earlier one-account/fifteen-document copy below remains historical evidence only. Retirement must additionally bind successful expanded-data verification, the matching application release and the operator's Google sign-in/reopen confirmation.

### Earlier optional session bridge

`scripts/firebase-migration-data.mts` binds the source, destination and named account to private operator configuration. It exports typed Firestore values and supported Auth records, rejects identity/document collisions, uses create-only destination writes, compares complete fingerprints, and rechecks source stability before granting bridge access. Unsupported password, tenant or MFA accounts stop the migration before writes. Infrastructure remains Terraform-managed.

The bridge accepts only a verified, non-revoked root-project source identity whose imported UID appears in `firebaseMigrationUsers`. It checks the destination account and mints a custom token for that same UID using self-scoped IAM signing. A verified-UID limit bounds exchanges without grouping every Next gateway request under loopback IP. Source tokens never authorize ordinary destination API operations.

The private SDK configuration's `migrationSnapshotSha256` and each mapping's `snapshotSha256` must contain the SHA256 of **the immutable `manifest.json` file**, reported as `manifestSha256` by the runner. They do not contain the manifest's separate `snapshotSha256` field. This binds the bridge to the reviewed source, destination and complete snapshot inventory.

Browsers restore original Firebase app names for designer, client and recovered-room sessions, transfer access, and verify the returned UID before continuing. A failed transfer preserves the source session and exposes retry. The destination's `appNamespace: "migrated"` remains after the temporary legacy configuration is retired so stored destination sessions stay discoverable. Explicit sign-out clears both projects for only the selected identity.

Importing UIDs does not move project-bound refresh tokens. The implementation can support a temporary guest transfer bridge, but anonymous Auth migration remains excluded. The selected destination configuration omits the legacy bridge and requires a fresh Google sign-in. Source deletion must use Terraform after the expanded data and production checks pass; original guest records remain in the immutable private source backup after their work is consolidated.

References: [Firebase on an existing Cloud project](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project), [Terraform authentication setup](https://firebase.google.com/codelabs/firebase-terraform), [Auth imports](https://firebase.google.com/docs/auth/admin/import-users), [custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Firestore migration](https://firebase.google.com/docs/firestore/manage-data/move-data).
