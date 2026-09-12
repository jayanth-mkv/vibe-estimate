import { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { AppConfig } from "./config.js";
import { z } from "zod";

export interface RoomTasks {
  enqueue(id: string): Promise<void>;
  enqueueDelivery(id: string): Promise<void>;
  verify(token: string, purpose?: "task" | "event"): Promise<boolean>;
}

export function createRoomTasks(config: AppConfig): RoomTasks {
  if (config.appEnv !== "production" || !config.taskQueuePath || !config.taskServiceAccount) throw new Error("Managed room tasks require explicit production configuration.");
  const projectId = config.taskQueuePath.split("/")[1];
  const auth = new GoogleAuth({ projectId, clientOptions: { quotaProjectId: projectId }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const verifier = new OAuth2Client();
  const enqueue = async (id: string, outbox: boolean) => {
    z.string().uuid().parse(id);
    const client = await auth.getClient();
    try {
      await client.request({
        url: `https://cloudtasks.googleapis.com/v2/${config.taskQueuePath}/tasks`, method: "POST", timeout: 10000,
        data: { task: {
          ...(outbox ? { name: `${config.taskQueuePath}/tasks/review-${id}` } : {}),
          scheduleTime: new Date(Date.now() + 2000).toISOString(), dispatchDeadline: "120s",
          httpRequest: { url: `${config.frontendOrigin}/internal/observer`, httpMethod: "POST",
            headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify(outbox ? { deliveryId: id } : { roomId: id })).toString("base64"),
            oidcToken: { serviceAccountEmail: config.taskServiceAccount, audience: config.frontendOrigin },
          },
        } },
      });
    } catch (error) {
      // A lost acknowledgement is safe to retry: this immutable delivery has a stable task name.
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (!outbox || status !== 409) throw error;
    }
  };
  return {
    enqueue: id => enqueue(id, false),
    enqueueDelivery: id => enqueue(id, true),
    async verify(token, purpose = "task") {
      try {
        const expected = purpose === "event" ? config.eventServiceAccount : config.taskServiceAccount;
        if (!expected) return false;
        const ticket = await verifier.verifyIdToken({ idToken: token, audience: config.frontendOrigin });
        const identity = ticket.getPayload();
        return Boolean(identity && identity.email === expected && identity.email_verified === true);
      } catch { return false; }
    },
  };
}
