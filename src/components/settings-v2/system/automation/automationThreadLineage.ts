import type {
  AgentTurnAutomationPayload,
  AutomationRequestMetadata,
} from "@/lib/api/automation";
import type {
  AsterApprovalPolicy,
  AsterSandboxPolicy,
} from "@/lib/api/agentRuntime";

export interface AutomationThreadLineage {
  sessionId?: string | null;
  threadId?: string | null;
}

export interface BuildAgentTurnAutomationPayloadParams {
  prompt: string;
  systemPrompt?: string | null;
  webSearch: boolean;
  contentId?: string | null;
  approvalPolicy?: AsterApprovalPolicy | null;
  sandboxPolicy?: AsterSandboxPolicy | null;
  requestMetadata?: AutomationRequestMetadata | null;
  lineage?: AutomationThreadLineage | null;
  missingLineageMessage: string;
}

export function normalizeAutomationThreadLineage(
  lineage?: AutomationThreadLineage | null,
): { sessionId: string; threadId: string } | null {
  const sessionId = lineage?.sessionId?.trim();
  const threadId = lineage?.threadId?.trim();
  if (!sessionId || !threadId) {
    return null;
  }
  return { sessionId, threadId };
}

export function buildAgentTurnAutomationPayload(
  params: BuildAgentTurnAutomationPayloadParams,
): AgentTurnAutomationPayload {
  const lineage = normalizeAutomationThreadLineage(params.lineage);
  if (!lineage) {
    throw new Error(params.missingLineageMessage);
  }

  return {
    kind: "agent_turn",
    prompt: params.prompt.trim(),
    session_id: lineage.sessionId,
    thread_id: lineage.threadId,
    system_prompt: params.systemPrompt?.trim() || null,
    web_search: params.webSearch,
    content_id: params.contentId?.trim() || null,
    approval_policy: params.approvalPolicy ?? null,
    sandbox_policy: params.sandboxPolicy ?? null,
    request_metadata: params.requestMetadata ?? null,
  };
}
