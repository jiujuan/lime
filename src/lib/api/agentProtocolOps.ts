import { createRuntimeRequest } from "@limecloud/app-server-client";
import type { AppServerAgentSessionTurnStartParams } from "./appServer";
import type {
  AgentApprovalPolicy,
  AgentExecutionStrategy,
  AgentSandboxPolicy,
  AutoContinueRequestPayload,
  ImageInput,
  RuntimeSearchMode,
  RuntimeProviderConfig,
} from "./agentRuntime/types";

export interface AgentUserPreferences {
  providerConfig?: RuntimeProviderConfig;
  providerPreference?: string;
  modelPreference?: string;
  reasoningEffort?: string;
  thinking?: boolean;
  webSearch?: boolean;
  searchMode?: RuntimeSearchMode;
  approvalPolicy?: AgentApprovalPolicy;
  sandboxPolicy?: AgentSandboxPolicy;
  executionStrategy?: AgentExecutionStrategy;
  autoContinue?: AutoContinueRequestPayload;
}

export interface AgentUserInputOp {
  type: "user_input";
  text: string;
  sessionId: string;
  eventName: string;
  workspaceId?: string;
  turnId?: string;
  images?: ImageInput[];
  preferences?: AgentUserPreferences;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  queueIfBusy?: boolean;
  queuedTurnId?: string;
  skipPreSubmitResume?: boolean;
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
): AppServerAgentSessionTurnStartParams {
  const preferences = op.preferences;

  return omitUndefined({
    sessionId: op.sessionId,
    turnId: op.turnId,
    input: omitUndefined({
      text: op.text,
      attachments: appServerAttachmentsFromImages(op.images),
    }),
    runtimeOptions: omitUndefined({
      stream: true,
      eventName: op.eventName,
      queuedTurnId: op.queuedTurnId,
      runtimeRequest: createRuntimeRequest({
        providerConfig: preferences?.providerConfig,
        providerPreference: preferences?.providerPreference,
        modelPreference: preferences?.modelPreference,
        reasoningEffort: preferences?.reasoningEffort?.trim(),
        thinkingEnabled: preferences?.thinking,
        approvalPolicy: preferences?.approvalPolicy,
        sandboxPolicy: preferences?.sandboxPolicy,
        workspaceId: op.workspaceId,
        webSearch: preferences?.webSearch,
        searchMode: preferences?.searchMode,
        executionStrategy: preferences?.executionStrategy,
        autoContinue: preferences?.autoContinue?.enabled,
        systemPrompt: op.systemPrompt,
        metadata: op.metadata,
      }),
    }),
    queueIfBusy: op.queueIfBusy,
    skipPreSubmitResume: op.skipPreSubmitResume,
  });
}

function appServerAttachmentsFromImages(images?: ImageInput[]) {
  if (!images?.length) {
    return undefined;
  }

  return images.map((image, index) => ({
    kind: "image",
    uri: image.data,
    metadata: {
      mediaType: image.media_type,
      index,
    },
  }));
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
