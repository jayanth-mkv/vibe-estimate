# Connected development

Connected mode runs the local app against the operator-authorized Firebase database and live Vertex Gemini. The default `rtk npm run dev` remains isolated on demo Firebase emulators with fixture AI.

## Start the app

Before stopping an emulator stack, retain its data with `rtk proxy node scripts/local-emulator-state.mjs export`. Stop the stack so ports 3000 and 8080 are free. Local fixture records stay separate from the real database.

Keep actual configuration outside the repository, for example in `../docs/private/`. The connected JSON has this shape:

```json
{
  "firebaseProjectId": "your-application-project",
  "firestoreDatabaseId": "(default)",
  "webConfigPath": "./firebase-connected-web.json",
  "gcloudConfiguration": "your-authorized-profile",
  "account": "operator@example.com",
  "gcloudConfigDir": "./your-existing-gcloud-directory",
  "authProjectId": "your-application-project",
  "geminiConfigPath": "./vertex-local.json",
  "frontendOrigin": "http://localhost:3000"
}
```

The web file contains the public Firebase Web SDK fields and `authMode: "google"`. It may include a stable lowercase `appNamespace` of at most 32 characters. The SDK project must match `firebaseProjectId`; its default Auth domain must match that project. Omit management metadata and server settings.

The Vertex file follows [local setup](local-setup.md) and matches the authorized profile, account, application project and gcloud directory. Relative paths resolve against the containing private JSON; referenced files must stay outside this checkout.

```powershell
rtk npm run dev:connected -- --config ../docs/private/firebase-connected.json
```

Open **http://localhost:3000**, using that exact authorized host. The API remains at **http://127.0.0.1:8080**. The launcher starts those two local processes without emulators or deployment. Health must report connected runtime, Firebase Auth, cloud storage and live Vertex Gemini.

## Google sign-in and shared work

Sign in with Google to open the private home workspace. Saved projects belong to the verified UID. A homeowner joins an invited room using a separate Google identity; the API checks membership on every request. A returning client can use the original room link and its Google recovery action.

Firebase manages browser credentials. The app keeps designer and client sessions separate through named Firebase apps and preserves the configured namespace across releases. Anonymous identities are only used by explicit local fixtures.

A localhost invitation works only on this computer. Use two local browser contexts for local testing; a real phone needs a reachable authorized application address. Gemini actions use live quota and must stay within the intended test scope.

## Authentication and resource boundaries

The backend verifies Firebase tokens, including revocation and disabled-user checks, derives ownership from the UID and authorizes room membership separately from private projects. Privileged Firestore access bypasses client Rules, so backend checks remain mandatory.

The frontend receives only public SDK configuration. Profile metadata and model credentials stay server-side. Backend Auth and Firestore use a shared, expiring in-memory OAuth token from the verified gcloud profile. The launcher preserves shared ADC.

Starting connected mode provisions no resources. APIs, IAM, domains, rules and providers are managed through their [Terraform roots](terraform-setup.md).

## Verification

`rtk npm run test:config` checks environment isolation, SDK validation and private-path guards without cloud access. Unit, Rules and fixture-browser suites exercise session recovery and access denial on emulators. Actual Google sign-in is a manual check with the intended account.

The optional `test:connected` browser runner uses guest test identities and is incompatible with the Google-only production Auth policy. Use it only with a separately authorized disposable test configuration that explicitly allows those identities. Do not enable anonymous production access for that runner.

The launcher checks home, join and dynamic room pages before announcing readiness. If generated Next routes become stale, stop the app, preserve the generated `frontend/.next/dev` cache in an ignored backup and restart. Do not edit generated manifests by hand.

Executed source and production checks are recorded in [verification.md](verification.md).
