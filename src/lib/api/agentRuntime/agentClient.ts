import type {
  AgentRuntimeGeneratedTitleResult,
  RuntimeProviderSelection,
} from "./sessionTypes";
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

function isRuntimeProviderSelection(
  value: unknown,
): value is RuntimeProviderSelection {
  return (
    isRecord(value) &&
    typeof value.provider_configured === "boolean" &&
    isOptionalString(value.provider_name) &&
    isOptionalString(value.provider_selector) &&
    isOptionalString(value.model_name)
  );
}

function assertRuntimeProviderSelection(
  command: string,
  value: unknown,
): asserts value is RuntimeProviderSelection {
  if (!isRuntimeProviderSelection(value)) {
    throw new Error(`${command} did not return runtime provider selection`);
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

function buildLocalGeneratedTitle(previewText: string | undefined): string {
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

  async function getRuntimeProviderSelection(): Promise<RuntimeProviderSelection> {
    const command = "get_runtime_provider_selection";
    const result = await bridgeInvoke<unknown>(command);
    assertRuntimeProviderSelection(command, result);
    return result;
  }

  return {
    generateAgentRuntimeTitleResult,
    generateAgentRuntimeTitle,
    generateAgentRuntimeSessionTitle,
    getRuntimeProviderSelection,
  };
}

export const {
  generateAgentRuntimeTitleResult,
  generateAgentRuntimeTitle,
  generateAgentRuntimeSessionTitle,
  getRuntimeProviderSelection,
} = createAgentClient();
