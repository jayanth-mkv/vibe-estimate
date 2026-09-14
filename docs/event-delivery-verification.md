# Event delivery verification

## Production evidence — 13 September 2026

The deployed application uses a direct Firestore-created Eventarc trigger and a Terraform-paused recovery scheduler.

A real canary verified Firestore creation → authenticated dispatcher → named Cloud Task → worker. A paused synthetic room consumed zero model calls, and an already completed outbox event was acknowledged without creating work. Unauthorized API/internal requests and anonymous account creation were denied. Test records were removed with ownership and update-time preconditions.

The managed Eventarc OIDC audience includes the canonical Cloud Run URL and `/internal/firestore`. Runtime validation and native-release guards accept that exact route while rejecting other paths, queries and fragments. Task delivery retains its independent audience.

Two synthetic designer messages each produced one created-event delivery, one completed outbox job and one persisted Gemini review. Replaying the first request produced no additional job or model call. A foreign-owner room and unauthorized internal calls were denied. Test records were conditionally removed, and the original records matched their pre-test fingerprints.

Cloud Run logs contained five successful event deliveries and three successful workers across both runs, with zero server errors or scheduled requests. One accepted job/worker pair was the paused-room canary; only the two message reviews called Gemini. The reconcile request was an expected unauthorized probe.

The 10:32:12–10:37:12 UTC idle window contained zero HTTP requests, internal calls or errors. The scheduler remained paused, the event trigger active and the queue empty. Temporary operator signing access was revoked after verification. Shared ADC was unchanged.

## Current regression coverage

Backend tests cover atomic outbox persistence, duplicate delivery, distinct internal identities, stale tasks, bounded failure, owner retry, pause and concurrent messages. Gateway tests cover binary event forwarding and required authentication headers. Real Firestore emulator tests cover rollback and delivery persistence across store instances.

The [current verification record](verification.md) reports executed suite counts, source/build status and deployment checks. The user's Google sign-in and saved-home access have also been confirmed; no automated Google consent check is claimed.
