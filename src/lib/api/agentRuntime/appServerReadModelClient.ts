import { AppServerClient } from "@/lib/api/appServer";
import { projectAppServerSessionReadToThreadReadModel } from "./appServerReadModelProjection";
import type { AgentRuntimeThreadReadModel } from "./types";

export type AppServerSessionReadClient = Pick<AppServerClient, "readSession">;

export interface AppServerReadModelClientDeps {
  appServerClient?: AppServerSessionReadClient;
}

export function createAppServerReadModelClient({
  appServerClient = new AppServerClient(),
}: AppServerReadModelClientDeps = {}) {
  async function getAgentRuntimeThreadRead(
    sessionId: string,
  ): Promise<AgentRuntimeThreadReadModel> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required to read App Server session");
    }

    const response = await appServerClient.readSession({
      sessionId: normalizedSessionId,
    });
    return projectAppServerSessionReadToThreadReadModel(response.result);
  }

  return {
    getAgentRuntimeThreadRead,
  };
}
