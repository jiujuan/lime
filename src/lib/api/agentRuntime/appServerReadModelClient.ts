import {
  AppServerClient,
  type AppServerAgentSessionReadResponse,
} from "@/lib/api/appServer";
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
    return projectAppServerSessionReadResult(response.result);
  }

  return {
    getAgentRuntimeThreadRead,
  };
}

export function projectAppServerSessionReadResult(
  value: unknown,
): AgentRuntimeThreadReadModel {
  assertAgentSessionReadResponse(value);
  return projectAppServerSessionReadToThreadReadModel(value);
}

export function assertAgentSessionReadResponse(
  value: unknown,
): asserts value is AppServerAgentSessionReadResponse {
  if (!isAgentSessionReadResponse(value)) {
    throw new Error("agentSession/read did not return session read model");
  }
}

function isAgentSessionReadResponse(
  value: unknown,
): value is AppServerAgentSessionReadResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    isAgentSession(response.session) &&
    Array.isArray(response.turns) &&
    response.turns.every(isAgentTurn)
  );
}

function isAgentSession(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const session = value as Record<string, unknown>;
  return (
    isNonEmptyString(session.sessionId) &&
    isNonEmptyString(session.threadId) &&
    isNonEmptyString(session.appId) &&
    isAgentSessionStatus(session.status) &&
    typeof session.createdAt === "string" &&
    typeof session.updatedAt === "string"
  );
}

function isAgentTurn(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const turn = value as Record<string, unknown>;
  return (
    isNonEmptyString(turn.turnId) &&
    isNonEmptyString(turn.sessionId) &&
    isNonEmptyString(turn.threadId) &&
    isAgentTurnStatus(turn.status) &&
    optionalString(turn.startedAt) &&
    optionalString(turn.completedAt)
  );
}

function isAgentSessionStatus(value: unknown): boolean {
  return (
    value === "idle" ||
    value === "running" ||
    value === "waitingAction" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

function isAgentTurnStatus(value: unknown): boolean {
  return (
    value === "accepted" ||
    value === "queued" ||
    value === "running" ||
    value === "waitingAction" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return typeof value === "undefined" || typeof value === "string";
}
