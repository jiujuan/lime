import type {
  AdditionalContextEntry,
  TurnStartParams,
} from "@limecloud/app-server-client";

export const AGENT_RUNTIME_RENDERER_EVENT_NAME_CONTEXT_KEY =
  "rendererEventName";

export interface AgentUserInputOp {
  type: "user_input";
  eventName: string;
  turn: TurnStartParams;
}

export interface AgentInterruptOp {
  type: "interrupt";
  sessionId: string;
  turnId?: string;
}

export interface AgentRetryOp {
  type: "retry";
  sessionId: string;
  turnId: string;
}

export interface AgentConfigUpdateOp {
  type: "config_update";
  sessionId: string;
  key: string;
  value: unknown;
}

export interface AgentShutdownOp {
  type: "shutdown";
  sessionId?: string;
}

export type AgentOp =
  | AgentUserInputOp
  | AgentInterruptOp
  | AgentRetryOp
  | AgentConfigUpdateOp
  | AgentShutdownOp;

export function createAgentSessionTurnStartParamsFromUserInputOp(
  op: AgentUserInputOp,
): TurnStartParams {
  const threadId = op.turn.threadId.trim();
  if (!threadId) {
    throw new Error("threadId is required to start App Server turn");
  }
  const rendererContext = createApplicationAdditionalContext({
    [AGENT_RUNTIME_RENDERER_EVENT_NAME_CONTEXT_KEY]:
      op.eventName.trim() || undefined,
  });
  const { additionalContext: turnContext, ...turn } = op.turn;
  const additionalContext = {
    ...(turnContext ?? {}),
    ...rendererContext,
  };
  return {
    ...turn,
    threadId,
    ...(Object.keys(additionalContext).length > 0 ? { additionalContext } : {}),
  };
}

export function createApplicationAdditionalContext(
  values: Record<string, unknown>,
): Record<string, AdditionalContextEntry> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => {
      if (value === undefined) {
        return [];
      }
      return [
        [
          key,
          {
            kind: "application" as const,
            value: typeof value === "string" ? value : JSON.stringify(value),
          },
        ],
      ];
    }),
  );
}
