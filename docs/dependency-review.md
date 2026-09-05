# Dependency review

Checked 5 September 2026 against the installed npm lockfile. Vitest was updated to 3.2.6 and the compatible automated fixes were applied. The subsequent audit reports no critical or high findings; 13 moderate package reports remain across upstream dependency branches. This is an installed-source review, not exploit testing or proof of complete security.

| Dependency | Scope and inspected path | Follow-up |
| --- | --- | --- |
| uuid 9 through gaxios and Cloud Storage | Present in runtime dependencies, but inspected callers use v4 without a buffer. The application uses node:crypto.randomUUID and does not call Firebase Storage. The advisory targets v3/v5/v6 with a supplied buffer. | Track upstream releases; reassess if Storage or UUID call sites change. |
| OpenTelemetry core through Firebase CLI/PubSub | Development dependency. Inspected PubSub code uses the trace-context propagator; the advisory affects baggage extraction. | Keep CLI out of the runtime image; reassess when adding telemetry. |
| stream-json through Firebase CLI | Development dependency. Vulnerable path filters are used in separate CLI import operations. This application uses Auth/Firestore emulator services. | Do not feed untrusted/deep JSON to CLI import operations; track upstream update. |
| qs through Firebase CLI/exegesis | Development dependency branches remain constrained by upstream Express/body-parser versions. The application accepts bounded JSON and does not perform the affected serialization round trip. | Track compatible upstream updates and recheck emulator behavior after changing constraints. |

The audit's force-fix suggestion would downgrade Firebase Admin and Firebase CLI across several major versions. It has not been applied. Different-major overrides for OpenTelemetry or stream-json have not been introduced without compatibility evidence.

Primary advisories: [Vitest](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [OpenTelemetry](https://github.com/advisories/GHSA-8988-4f7v-96qf), [stream-json](https://github.com/uhop/stream-json/security/advisories/GHSA-528h-pc64-c93x), [qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
