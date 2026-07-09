import type { Dispatch, SetStateAction } from "react";
import type {
  AgentEventActionRequired,
  AgentEventArtifactSnapshot,
  AgentEventContextTrace,
} from "@/lib/api/agentProtocol";
import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  ApprovalDecision,
  WriteArtifactContext,
} from "../types";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import {
  extractQuestionsFromRequestedSchema,
  normalizeActionQuestions,
  truncateForLog,
} from "./agentChatCoreUtils";
import { upsertAssistantActionRequest } from "./agentChatActionState";
import { governActionRequest } from "../utils/actionRequestGovernance";
import { buildArtifactFromWrite } from "../utils/messageArtifacts";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { normalizeActionRequiredScope } from "@/lib/api/agentProtocolParserUtils";
import { buildContextRuntimeStatus } from "../utils/agentRuntimeStatus";
import {
  buildWriteMetadata,
  resolveArtifactSnapshotContent,
  shouldSkipBinaryArtifactWrite,
  upsertAssistantWriteArtifact,
  type ArtifactWriteOptions,
  type BaseProcessorContext,
} from "./agentStreamEventProcessorArtifacts";

function normalizeRuntimeActionScope(
  data: AgentEventActionRequired,
): ActionRequired["scope"] {
  const rawData = data as AgentEventActionRequired & {
    action_scope?: unknown;
    actionScope?: unknown;
  };
  const scope = normalizeActionRequiredScope(
    rawData.scope ?? rawData.action_scope ?? rawData.actionScope,
  );
  if (!scope) {
    return undefined;
  }
  return {
    sessionId: scope.session_id,
    threadId: scope.thread_id,
    turnId: scope.turn_id,
  };
}

function isApprovalDecision(value: string): value is ApprovalDecision {
  return (
    value === "allow_once" ||
    value === "allow_for_session" ||
    value === "decline" ||
    value === "cancel"
  );
}

function normalizeApprovalDecisions(
  value: string[] | undefined,
): ApprovalDecision[] | undefined {
  if (!value?.length) {
    return undefined;
  }
  const decisions = value.filter(isApprovalDecision);
  return decisions.length > 0 ? Array.from(new Set(decisions)) : undefined;
}

export function handleArtifactSnapshotEvent({
  data,
  onWriteFile,
  setMessages,
  assistantMsgId,
  activeSessionId,
}: BaseProcessorContext &
  ArtifactWriteOptions & {
    data: AgentEventArtifactSnapshot;
  }) {
  const artifactPath = data.artifact.filePath;
  if (!artifactPath) {
    return;
  }

  const metadata = data.artifact.metadata;
  const snapshotContent = resolveArtifactSnapshotContent(data);
  if (
    shouldSkipBinaryArtifactWrite({
      filePath: artifactPath,
      content: snapshotContent,
      source: "artifact_snapshot",
    })
  ) {
    return;
  }
  const writeContext: WriteArtifactContext = {
    artifactId:
      data.artifact.artifactId || `artifact:${assistantMsgId}:${artifactPath}`,
    source: "artifact_snapshot",
    sourceMessageId: assistantMsgId,
    status: "streaming",
    metadata: buildWriteMetadata(
      {
        ...(metadata || {}),
        sessionId: activeSessionId,
        artifactId: data.artifact.artifactId,
        artifactRef: data.artifact.artifactId || artifactPath,
      },
      {
        source: "artifact_snapshot",
        phase: metadata?.complete === false ? "streaming" : "persisted",
        content: snapshotContent,
        isPartial: metadata?.complete === false,
      },
    ),
  };
  const nextArtifact = upsertAssistantWriteArtifact({
    assistantMsgId,
    setMessages,
    filePath: artifactPath,
    content: snapshotContent,
    context: writeContext,
  });
  const emittedArtifact =
    nextArtifact ||
    buildArtifactFromWrite({
      filePath: artifactPath,
      content: snapshotContent,
      context: writeContext,
    });

  if (emittedArtifact) {
    onWriteFile?.(emittedArtifact.content, artifactPath, {
      artifact: emittedArtifact,
      artifactId: emittedArtifact.id,
      source: "artifact_snapshot",
      sourceMessageId: assistantMsgId,
      status: emittedArtifact.status,
      metadata: emittedArtifact.meta,
    });
  }
}

export function handleActionRequiredEvent({
  data,
  eventName,
  actionLoggedKeys,
  effectiveExecutionStrategy,
  runtime,
  setPendingActions,
  setMessages,
  assistantMsgId,
  activeSessionId,
  resolvedWorkspaceId,
}: BaseProcessorContext & {
  data: AgentEventActionRequired;
  eventName: string;
  actionLoggedKeys: Set<string>;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  runtime: AgentRuntimeAdapter;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
}) {
  const actionData = governActionRequest({
    requestId: data.request_id,
    actionType: data.action_type,
    toolName: data.tool_name,
    arguments: data.arguments,
    prompt: data.prompt,
    questions:
      normalizeActionQuestions(data.questions) ||
      extractQuestionsFromRequestedSchema(data.requested_schema) ||
      normalizeActionQuestions(undefined, data.prompt),
    requestedSchema: data.requested_schema,
    availableDecisions: normalizeApprovalDecisions(data.available_decisions),
    scope: normalizeRuntimeActionScope(data),
    eventName,
    isFallback: false,
  });
  const actionKey =
    actionData.requestId ||
    `${actionData.actionType}:${actionData.prompt || actionData.toolName || ""}`;
  if (!actionLoggedKeys.has(actionKey)) {
    actionLoggedKeys.add(actionKey);
    activityLogger.log({
      eventType: "action_required",
      status: "success",
      title: "等待用户确认",
      description:
        truncateForLog(actionData.prompt || "", 120) ||
        `类型: ${actionData.actionType}`,
      workspaceId: resolvedWorkspaceId,
      sessionId: activeSessionId,
      source: "aster-chat",
      correlationId: actionData.requestId,
      metadata: {
        actionType: actionData.actionType,
        toolName: actionData.toolName,
        requestId: actionData.requestId,
      },
    });
  }

  void effectiveExecutionStrategy;
  void runtime;

  upsertAssistantActionRequest({
    assistantMsgId,
    actionData,
    replaceByPrompt:
      actionData.actionType === "ask_user" ||
      actionData.actionType === "elicitation",
    setPendingActions,
    setMessages,
  });
}

export function handleContextTraceEvent({
  data,
  setMessages,
  assistantMsgId,
}: BaseProcessorContext & {
  data: AgentEventContextTrace;
}) {
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    return;
  }

  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== assistantMsgId) {
        return message;
      }

      const seen = new Set(
        (message.contextTrace || []).map(
          (step) => `${step.stage}::${step.detail}`,
        ),
      );
      const nextSteps = [...(message.contextTrace || [])];

      for (const step of data.steps) {
        const key = `${step.stage}::${step.detail}`;
        if (!seen.has(key)) {
          seen.add(key);
          nextSteps.push(step);
        }
      }

      return {
        ...message,
        contextTrace: nextSteps,
        runtimeStatus: buildContextRuntimeStatus(nextSteps),
      };
    }),
  );
}
