import { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface RoomTasks {
  enqueue(id: string): Promise<void>;
  verify(token: string): Promise<boolean>;
}

export function createRoomTasks(config: AppConfig): RoomTasks {
  if (config.appEnv !== "production" || !config.taskQueuePath || !config.taskServiceAccount) throw new Error("Managed room tasks require explicit production configuration.");
  const projectId = config.taskQueuePath.split("/")[1];
  const auth = new GoogleAuth({ projectId, clientOptions: { quotaProjectId: projectId }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const verifier = new OAuth2Client();
  return {
    async enqueue(id) {
      const client = await auth.getClient();
      await client.request({
        url: `https://cloudtasks.googleapis.com/v2/${config.taskQueuePath}/tasks`, method: "POST", timeout: 10000,
        data: { task: {
          scheduleTime: new Date(Date.now() + 2000).toISOString(), dispatchDeadline: "120s",
          httpRequest: { url: `${config.frontendOrigin}/internal/observer`, httpMethod: "POST",
            headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ roomId: id })).toString("base64"),
            oidcToken: { serviceAccountEmail: config.taskServiceAccount, audience: config.frontendOrigin },
          },
        } },
      });
    },
    async verify(token) {
      try {
        const ticket = await verifier.verifyIdToken({ idToken: token, audience: config.frontendOrigin });
        const identity = ticket.getPayload();
        return Boolean(identity && identity.email === config.taskServiceAccount && identity.email_verified === true);
      } catch { return false; }
    },
  };
}
