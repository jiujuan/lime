import type {
  AgentProcessStatus,
  AgentRuntimeGeneratedTitleResult,
  AsterAgentStatus,
  AsterProviderConfig,
} from "./types";
import {
  invokeAgentRuntimeBridge,
  type AgentRuntimeBridgeInvoke,
} from "./transport";

export interface AgentRuntimeAgentClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

export interface GenerateAgentRuntimeTitleRequest {
  sessionId?: string;
  previewText?: string;
  titleKind?: "session" | "image_task";
}

const LOCAL_TITLE_MAX_LENGTH = 32;

function stripPreviewRolePrefix(line: string): string {
  return line.replace(
    /^(?:user|assistant|system|human|用户|助手|系统)\s*[:：]\s*/i,
    "",
  );
}

function normalizePreviewTitleText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^[#>*\-\s]+/, "")
    .replace(/[#*_~[\]{}()<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLocalTitle(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= LOCAL_TITLE_MAX_LENGTH) {
    return text;
  }

  return chars.slice(0, LOCAL_TITLE_MAX_LENGTH).join("").trim();
}

function buildLocalGeneratedTitle(
  previewText: string | undefined,
): string {
  const lines =
    previewText
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  const userLine =
    lines.find((line) => /^(?:user|human|用户)\s*[:：]/i.test(line)) ??
    lines[0] ??
    "";
  const title = normalizePreviewTitleText(stripPreviewRolePrefix(userLine));

  return truncateLocalTitle(title);
}

export function createAgentClient({
  bridgeInvoke = invokeAgentRuntimeBridge,
}: AgentRuntimeAgentClientDeps = {}) {
  async function startAgentProcess(): Promise<AgentProcessStatus> {
    return await bridgeInvoke("agent_start_process", {});
  }

  async function stopAgentProcess(): Promise<void> {
    return await bridgeInvoke("agent_stop_process");
  }

  async function getAgentProcessStatus(): Promise<AgentProcessStatus> {
    return await bridgeInvoke("agent_get_process_status");
  }

  async function generateAgentRuntimeTitleResult(
    request: GenerateAgentRuntimeTitleRequest,
  ): Promise<AgentRuntimeGeneratedTitleResult> {
    const sessionId = request.sessionId?.trim() || null;

    return {
      title: buildLocalGeneratedTitle(request.previewText),
      sessionId,
      executionRuntime: null,
      usedFallback: true,
      fallbackReason: "local_preview_title",
    };
  }

  async function generateAgentRuntimeTitle(
    request: GenerateAgentRuntimeTitleRequest,
  ): Promise<string> {
    const result = await generateAgentRuntimeTitleResult(request);
    return result.title;
  }

  async function generateAgentRuntimeSessionTitle(
    sessionId: string,
    previewText?: string,
  ): Promise<string> {
    return await generateAgentRuntimeTitle({
      sessionId,
      previewText,
      titleKind: "session",
    });
  }

  async function initAsterAgent(): Promise<AsterAgentStatus> {
    return await bridgeInvoke("aster_agent_init");
  }

  async function getAsterAgentStatus(): Promise<AsterAgentStatus> {
    return await bridgeInvoke("aster_agent_status");
  }

  async function configureAsterProvider(
    config: AsterProviderConfig,
    sessionId: string,
  ): Promise<AsterAgentStatus> {
    return await bridgeInvoke("aster_agent_configure_provider", {
      request: config,
      session_id: sessionId,
    });
  }

  return {
    configureAsterProvider,
    generateAgentRuntimeTitleResult,
    generateAgentRuntimeTitle,
    generateAgentRuntimeSessionTitle,
    getAgentProcessStatus,
    getAsterAgentStatus,
    initAsterAgent,
    startAgentProcess,
    stopAgentProcess,
  };
}

export const {
  configureAsterProvider,
  generateAgentRuntimeTitleResult,
  generateAgentRuntimeTitle,
  generateAgentRuntimeSessionTitle,
  getAgentProcessStatus,
  getAsterAgentStatus,
  initAsterAgent,
  startAgentProcess,
  stopAgentProcess,
} = createAgentClient();
