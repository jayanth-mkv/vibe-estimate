# Review request recovery

One user action has one persisted request ID. The backend claims it transactionally before calling the provider. Repeating that action checks or saves its existing result; it does not generate another review or supersede a later saved draft. A different concurrent clarification is rejected before a provider call.

## User flow

The client remembers the request ID and clarification in session storage scoped to the verified user and project. Lost responses show **Check review status**. A stored generated result shows **Finish saving**. Neither starts a new model call. Reload restores the recovery record from the server and, when available, that browser's saved request note. Storage failures keep recovery in memory and show a keep-this-page-open notice.

Only a server-confirmed failed, expired or stale request offers **Retry review**. This explicitly starts another provider attempt with a new ID, linked to the previous request. The user may correct a failed clarification. Existing sources, previous results and drafts remain visible; checking a request preserves current pricing edits. Normal reload restores saved draft values.

## API contract

`POST /api/projects/:id/analyze` retains the successful `{ project }` shape. Existing callers without request IDs remain supported. An immediately repeated normalized clarification, including historical projects predating request receipts, returns the current project without reapplying the review.

| Action | Body | Behavior |
| --- | --- | --- |
| Start | `{ requestId, clarification? }` | Claim one action, then dispatch once. |
| Check or finish saving | `{ requestId, resumeOnly: true }` | Resume an existing action only; an unknown ID returns `REVIEW_REQUEST_NOT_FOUND` without dispatch. |
| Deliberate retry | `{ requestId: newId, retryOf: priorId, clarification? }` | Requires the current interrupted action. Omitted clarification inherits its original value. |
| Completed replay | A known completed ID and its original payload, or a status check | Return the current project, preserving later reviews and drafts. |

Project responses and relevant errors expose only `reviewRequest: { requestId, status, retryAllowed, retryAfterMs? }`. Errors nest it under `error`; a successful project nests it under `project`. Source text, hashes, receipts, provider conversation and pending generated output remain private. A status check of an unknown ID may carry metadata for a newer active request; clients must retain that authoritative request.

| Status | Control / next action |
| --- | --- |
| `running` | Check later; no automatic redispatch. |
| `save_pending` | Finish applying the already-stored result. |
| `failed` | Check or explicitly retry. |
| `unknown` | The result of an expired/interrupted attempt is uncertain; check before a deliberate retry. |
| `stale` | Newer project work prevents applying the old result; preserve that work and explicitly review again if needed. |

The claim expires after 90 seconds. Expiry means the outcome is unknown, not that a previous provider call was canceled or uncharged. A late result cannot overwrite an explicit replacement request. A staged result stores only its analysis and two appended conversation turns, then applies them under the existing project version check. Failed result writes retry only the held output, never regeneration. Receipt storage is bounded to 100 requests; the existing ten-review conversation limit remains enforced.

## Threats and enforcement

| Threat or failure | Control | Meaningful verification |
| --- | --- | --- |
| Duplicate billing from concurrent/retried requests | Durable claim, completed receipts and explicit retries | Provider-spy API tests for identical/different concurrent actions and cross-instance recovery |
| Lost persistence response or process interruption | Staged output, conservative unknown state, no automatic paid retry | Result/final-save failure, expiry and late-result transaction tests |
| Replayed clarification supersedes a newer draft | Return current project on replay; preserve version check | API tests and desktop/mobile lost-response browser journey |
| Foreign owner reads or resumes an action | Verified UID and owned-project transaction | Read/check/retry denial before dispatch; explicit public projection |
| Browser identity changes expose prior work | UID-scoped notes and cleared displayed project/recovery | Frontend identity/recovery tests; independent guest browser journeys |
| A status button starts an unaccepted action | `resumeOnly` fails closed | Unknown-ID API tests and lost-before-dispatch browser journey |

Executed counts and browser outcomes belong in [verification.md](verification.md). These controls do not claim exactly-once billing across an external provider crash; an explicit retry may incur another charge.
