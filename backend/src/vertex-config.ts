import path from "node:path";

export type LocalVertexTarget = {
  projectId: string;
  location: string;
  gcloudConfiguration: string;
  gcloudAccount: string;
  gcloudConfigDir: string;
};

export function validateVertexTarget(input: Partial<LocalVertexTarget>): LocalVertexTarget {
  const projectId = input.projectId?.trim() ?? "";
  const location = input.location?.trim() ?? "";
  const gcloudConfiguration = input.gcloudConfiguration?.trim() ?? "";
  const gcloudAccount = input.gcloudAccount?.trim() ?? "";
  const gcloudConfigDir = input.gcloudConfigDir?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || projectId.startsWith("demo-") ||
      !/^[a-z][a-z0-9-]{1,62}$/.test(location) ||
      !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(gcloudConfiguration) ||
      !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(gcloudAccount) || /\.gserviceaccount\.com$/i.test(gcloudAccount) ||
      !path.isAbsolute(gcloudConfigDir) || /[\r\n\u0000]/.test(gcloudConfigDir)) {
    throw new Error("Local Vertex mode requires an explicit valid project, location, named gcloud configuration, user account, and absolute private gcloud configuration directory.");
  }
  return { projectId, location, gcloudConfiguration, gcloudAccount, gcloudConfigDir };
}
