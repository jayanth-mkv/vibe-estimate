# Temporary migration verification access

This root owns one conditional IAM member on the existing runtime service account. It uses the existing custom role only after verifying that its sole permission is `iam.serviceAccounts.signBlob`. An explicitly verified operator may then sign a short-lived Firebase custom token for the one imported Google UID to verify copied data and bounded event processing. This does not establish interactive Google consent.

All project, operator and timestamp values remain in private configuration. The grant defaults off, starts at an explicit approval time, expires within two hours and is removed through a reviewed Terraform plan after verification. It never grants a project-wide Token Creator role, creates an account/key, or owns the surrounding service-account IAM policy. Discover/import an exact pre-existing conditional member before applying; reject any different existing condition.

The private launcher binds the target/account to operator configuration, checks the existing role and policy, keeps tokens in memory, saves a hashed plan outside the checkout and allows exactly one member creation or its later deletion. Remote state uses the existing private GCS bucket under its separate `firebase-migration-verification` prefix.
