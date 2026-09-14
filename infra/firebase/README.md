# Firebase

This root manages the application's Firebase membership, default Firestore
database, Google Authentication, client access rules, runtime permissions,
browser SDK secret and Firestore event delivery. All resources use the same
explicit project as the Cloud Run application.

Discover and import existing resources before managing them. Preserve their
resource IDs, database location, OAuth credentials and Terraform addresses.
The database, Firebase membership, web app and Auth configuration are protected
against accidental destruction. Client Firestore rules deny direct access;
the authenticated backend enforces ownership.

## Private configuration and state

The GCS backend has no committed bucket or prefix. Supply both from the
operator's private backend configuration, keeping the existing state object.
The state bucket must remain private, versioned and protected. Never initialize
against an empty prefix as a substitute for the existing state.

The required project, database location, runtime region and authorized domains
come from verified private configuration. Google sign-in is enabled; anonymous,
email/password and phone sign-up are disabled. Preserve each authorized
production hostname and `localhost` when connected development is authorized.
Existing OAuth client credentials remain private and are sensitive in state.

`web_config_secret_id` names the existing active Secret Manager secret.
`firebase_web_config` is an ephemeral input written through the provider's
write-only payload field. Keep `sdk_config_version` unchanged unless the payload
intentionally changes. The SDK project and Google-only policy are validated;
an optional app namespace is a lowercase name of at most 32 characters.
Preserve the current namespace so existing browser sessions keep the same
Firebase app identity.

## Review delivery

The document-created Eventarc trigger matches only `roomReviewOutbox/{jobId}`
in the default database. Its dedicated identity can invoke the existing
Cloud Run service at `/internal/firestore`. The API validates the event and
creates a named Cloud Task; the worker keeps ownership, retry and model limits.
The production root owns the queue and its paused recovery scheduler.

Review a full saved plan before applying any change. Ordinary application
releases update only the runtime root. This root's offline mock tests cover
project boundaries, private data protection, Google-only sign-in, narrow IAM,
event filtering, secret handling and SDK configuration validation.
