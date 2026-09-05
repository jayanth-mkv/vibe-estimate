import path from "node:path";

export type NamedGcloudTarget = {
  projectId: string;
  gcloudConfiguration: string;
  gcloudAccount: string;
  gcloudConfigDir: string;
};
export type LocalVertexTarget = NamedGcloudTarget & { location: string };

export function validateNamedGcloudTarget(input: Partial<NamedGcloudTarget>): NamedGcloudTarget {
  const projectId = input.projectId?.trim() ?? "";
  const gcloudConfiguration = input.gcloudConfiguration?.trim() ?? "";
  const gcloudAccount = input.gcloudAccount?.trim() ?? "";
  const gcloudConfigDir = input.gcloudConfigDir?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || projectId.startsWith("demo-") ||
      !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(gcloudConfiguration) ||
      !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(gcloudAccount) || /\.gserviceaccount\.com$/i.test(gcloudAccount) ||
      !path.isAbsolute(gcloudConfigDir) || /[\r\n\u0000]/.test(gcloudConfigDir)) {
    throw new Error("Named-profile authentication requires an explicit valid project, named gcloud configuration, user account, and absolute private gcloud configuration directory.");
  }
  return { projectId, gcloudConfiguration, gcloudAccount, gcloudConfigDir };
}

export function validateVertexTarget(input: Partial<LocalVertexTarget>): LocalVertexTarget {
  const target = validateNamedGcloudTarget(input);
  const location = input.location?.trim() ?? "";
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(location)) throw new Error("Local Vertex mode requires an explicit valid location.");
  return { ...target, location };
}
