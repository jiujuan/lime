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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isAgentProcessStatus(value: unknown): value is AgentProcessStatus {
  return (
    isRecord(value) &&
    typeof value.running === "boolean" &&
    isOptionalString(value.base_url) &&
    isOptionalFiniteNumber(value.port)
  );
}

function assertAgentProcessStatus(
  command: string,
  value: unknown,
): asserts value is AgentProcessStatus {
  if (!isAgentProcessStatus(value)) {
    throw new Error(`${command} did not return agent process status`);
  }
}

function assertVoidResult(command: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    throw new Error(`${command} did not return void result`);
  }
}

function isAsterAgentStatus(value: unknown): value is AsterAgentStatus {
  return (
    isRecord(value) &&
    typeof value.initialized === "boolean" &&
    typeof value.provider_configured === "boolean" &&
    isOptionalString(value.provider_name) &&
    isOptionalString(value.provider_selector) &&
    isOptionalString(value.model_name)
  );
}

function assertAsterAgentStatus(
  command: string,
  value: unknown,
): asserts value is AsterAgentStatus {
  if (!isAsterAgentStatus(value)) {
    throw new Error(`${command} did not return Aster agent status`);
  }
}

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
    const command = "agent_start_process";
    const result = await bridgeInvoke<unknown>(command, {});
    assertAgentProcessStatus(command, result);
    return result;
  }

  async function stopAgentProcess(): Promise<void> {
    const command = "agent_stop_process";
    const result = await bridgeInvoke<unknown>(command);
    assertVoidResult(command, result);
  }

  async function getAgentProcessStatus(): Promise<AgentProcessStatus> {
    const command = "agent_get_process_status";
    const result = await bridgeInvoke<unknown>(command);
    assertAgentProcessStatus(command, result);
    return result;
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
    const command = "aster_agent_init";
    const result = await bridgeInvoke<unknown>(command);
    assertAsterAgentStatus(command, result);
    return result;
  }

  async function getAsterAgentStatus(): Promise<AsterAgentStatus> {
    const command = "aster_agent_status";
    const result = await bridgeInvoke<unknown>(command);
    assertAsterAgentStatus(command, result);
    return result;
  }

  async function configureAsterProvider(
    config: AsterProviderConfig,
    sessionId: string,
  ): Promise<AsterAgentStatus> {
    const command = "aster_agent_configure_provider";
    const result = await bridgeInvoke<unknown>(command, {
      request: config,
      session_id: sessionId,
    });
    assertAsterAgentStatus(command, result);
    return result;
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
