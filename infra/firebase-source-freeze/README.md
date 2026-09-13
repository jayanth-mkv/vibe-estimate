> Archived after same-project Firebase consolidation. The current root contains only `removed` blocks with `destroy = false`; it cannot restore the historical resources/settings described below. Review/apply its exact state-forgetting plan through the private ownership-retirement launcher. Previous implementation and tests remain in Git history.

# Temporary source Auth freeze

This root adopts four existing Identity Platform configuration leaves through masked reads and PATCH requests. Its separate private GCS state does not overlap the production root's `authorizedDomains` ownership. It never creates an Auth project, reads password hashes, deletes users, or revokes stored sessions.

Record the original anonymous/email enable flags and client signup/deletion permissions privately before import. With `freeze = true`, new source accounts and end-user account deletion are disabled, along with anonymous and email sign-in. Existing OAuth provider configuration remains intact so returning imported sessions can be verified. The destination project supplies explicit request quota through the authorized named profile's short-lived token; shared ADC is unchanged.

Apply only during the coordinated application maintenance window, after draining active requests and pausing the old scheduled recovery job. A freeze does not prevent an existing user's direct SDK profile change or sign-in metadata update: the data migration tool must still verify that its immutable source fingerprints did not change before and after copy. Restore the recorded settings through `freeze = false` only for an explicit rollback.

Google's [client permissions documentation](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config#Permissions) defines `disabledUserSignup` across all end-user API methods. Administrator import is separately authenticated and is not used against the source.
