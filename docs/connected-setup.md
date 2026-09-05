# Connected development

This is the operator-authorized local app using an existing real Firebase project and live Vertex Gemini. It is separate from `rtk npm run dev`, which uses a demo project and local emulators. Deployment remains deferred.

## Start the app

Before stopping an emulator stack, retain its data with `rtk proxy node scripts/local-emulator-state.mjs export`. Stop that stack so ports 3000 and 8080 are free. The local snapshot is preserved separately; fixture records and identities are not copied into the real database.

Keep all actual configuration outside this repository, for example under `../docs/private/`. The connected JSON has this shape; replace placeholders only in that private directory:

```json
{
  "firebaseProjectId": "your-firebase-project",
  "firestoreDatabaseId": "(default)",
  "webConfigPath": "./firebase-connected-web.json",
  "gcloudConfiguration": "your-authorized-profile",
  "account": "operator@example.com",
  "gcloudConfigDir": "./your-existing-gcloud-directory",
  "authProjectId": "your-backend-project",
  "geminiConfigPath": "./vertex-local.json",
  "frontendOrigin": "http://localhost:3000"
}
```

The web configuration is the flat Firebase Web SDK object: `apiKey`, `authDomain`, `projectId`, `appId` and optional SDK fields. Omit management API metadata such as `projectNumber` and `version`. The SDK project must match `firebaseProjectId`; its default Firebase Auth domain must match that project. The Vertex file follows [local setup](local-setup.md) and must match the explicitly authorized profile, account, backend project and gcloud directory. Relative paths resolve against their containing private JSON; all referenced paths must resolve outside the repository.

```powershell
rtk npm run dev:connected -- --config ../docs/private/firebase-connected.json
```

Open **http://localhost:3000**. Use this exact host for Firebase's existing authorized domain. The API remains at **http://127.0.0.1:8080**. The launcher starts only those two local processes, with no emulators and no deployment. Health must report `runtime=connected`, `auth=firebase`, `storageConnection=cloud`, `aiProvider=gemini`, and `geminiTransport=vertex`.

## Guest and client journey

1. Open the workspace and choose **Start a project** or a fictional example. Firebase establishes a guest identity without a login form.
2. Save the scope and client messages. Review with Gemini, or choose **Start shared room** to discuss changes with the client.
3. Choose **Invite client → Create invite link**. Share the locally generated QR, room code, or link. **Open client view** opens a separate client identity in another tab for an immediate two-person demonstration. Alternatively, open **Join a room** and enter the code.
4. Exchange messages. The observer reviews new messages; the designer uses **Prepare draft**, confirms quantity and price, then saves and explicitly shares the draft.
5. Revise and share again. Both shared versions remain available, while the designer retains private project access and export.

Guest work is stored online but is associated with that browser's Firebase identity. **Save access with Google** links the same identity and its existing work. An explicit **Continue with Google** action on an empty home opens a returning Google workspace. It is blocked if the guest has saved work or edits; failed linking does not sign out the guest. The app does not handle passwords.

A returning client opens the original room link and chooses **Continue with Google** on its recovery screen. This uses a separate Firebase app for that room, verifies client membership, and preserves any existing guest rooms in the browser. It remembers only the chosen app; the Firebase SDK manages credentials. Membership is checked again on reload and polling.

A QR containing `localhost` cannot reach this computer from another phone. The invitation explains this and supports a two-tab demonstration now. A cross-device link requires an accessible app address and corresponding Firebase authorized domain/CORS configuration; hosting remains a separate deferred step.

## Authentication and resource boundaries

The operator's existing Auth providers, web app, database and deny-all client Rules are used unchanged. The backend verifies Firebase tokens including revocation/disabled-user checks, derives ownership from the UID, and authorizes room membership separately from private project access. Its Firestore access is privileged, so backend checks remain mandatory.

The launcher gives the frontend only public Web SDK configuration. Named-profile metadata and all model credentials remain server-side. Backend Auth and Firestore use a shared, expiring in-memory OAuth token obtained from the explicitly verified gcloud profile. The app does not load, replace or refresh shared ADC. Firebase and Vertex targets remain explicit and distinct.

No infrastructure provisioning is part of starting this app. If APIs, IAM, domains, rules or providers need changes later, discover and adopt existing resources through Terraform first. Current discovery and any changes are recorded in [the inventory](infrastructure-inventory.md).

## Verify

`rtk npm run test:config` checks environment isolation and private-path guards without cloud access. Fixture and Rules suites stay on emulators and refuse a connected backend.

The bounded `rtk npm run test:connected` runner requires `CONNECTED_FIREBASE_PROJECT_ID` supplied privately to the process. It checks the UI's real token audiences, runs one desktop room journey with two independently created guests, permits at most two messages/observations, and has no automatic retries. It verifies QR decoding, code joining, source links, owner pricing, draft/revision sharing, replay, persistence, export and authorization. Browser traces, video and automatic screenshots are disabled. Only the completed synthetic room is captured after confirming no invitation dialog or fragment is present. Results use a fresh ignored `.cache/connected-firebase-runs/` directory. The runner accepts `--list` for discovery without cloud calls. `rtk npm run test:auth --workspace @vibeestimate/frontend` covers guest-preserving Google recovery without cloud calls.

The launcher checks the home, join and dynamic room pages before announcing readiness. If these pages return 404 while their source files exist, stop the app, preserve the generated `frontend/.next/dev` cache in an ignored backup, then restart so Next can rebuild it. Avoid changing generated manifests by hand. Keep production builds and the dev server sequential while investigating generated-state issues.

Executed results and remaining Google consent/AI Studio/deployment evidence are in [verification.md](verification.md) and [ai-studio-evidence.md](ai-studio-evidence.md).
