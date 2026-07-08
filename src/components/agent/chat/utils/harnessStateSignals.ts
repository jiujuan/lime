import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type {
  HarnessActiveFileWrite,
  HarnessDelegatedTask,
  HarnessFileAction,
  HarnessFileEvent,
  HarnessOutputSignal,
  HarnessToolActivity,
} from "./harnessStateTypes";
import {
  extractArtifactProtocolPathsFromValue,
  resolveArtifactProtocolFilePath,
} from "@/lib/artifact-protocol";
import { extractFilesystemEventPathsFromValue } from "@/lib/filesystem-event-protocol";
import {
  resolveArtifactPreviewText,
  resolveArtifactWritePhase,
} from "./messageArtifacts";
import type { Message } from "../types";
import {
  asRecord,
  buildTextPreview,
  extractContentFromRecord,
  extractMetadata,
  extractRegexValue,
  extractSearchQuery,
  fileNameFromPath,
  FILESYSTEM_TOOL_NAMES,
  maybeKeepTextContent,
  normalizeBoolean,
  normalizeDate,
  normalizeNumber,
  normalizeString,
  normalizeToolName,
  parseBooleanFromText,
  parseJsonValue,
  parseNumberFromText,
  PLANNING_TOOL_NAMES,
  resolveFileKind,
  SKILL_TOOL_NAMES,
  summarizeToolOutput,
  WEB_TOOL_RE,
} from "./harnessStateCore";

export function extractActiveFileWrites(
  messages: Message[],
): HarnessActiveFileWrite[] {
  const activeWrites = new Map<string, HarnessActiveFileWrite>();

  for (const message of messages) {
    for (const artifact of message.artifacts || []) {
      const phase = resolveArtifactWritePhase(artifact);
      if (!phase || phase === "completed") {
        continue;
      }

      const path = resolveArtifactProtocolFilePath(artifact);
      if (!path) {
        continue;
      }

      const updatedAt =
        Number.isFinite(artifact.updatedAt) && artifact.updatedAt > 0
          ? new Date(artifact.updatedAt)
          : undefined;
      const preview = buildTextPreview(
        typeof artifact.meta.previewText === "string"
          ? artifact.meta.previewText
          : resolveArtifactPreviewText(artifact),
        {
          maxLines: 4,
          maxChars: 240,
        },
      );
      const latestChunk = buildTextPreview(
        typeof artifact.meta.latestChunk === "string"
          ? artifact.meta.latestChunk
          : undefined,
        {
          maxLines: 3,
          maxChars: 180,
        },
      );
      const nextWrite: HarnessActiveFileWrite = {
        id: artifact.id,
        path,
        displayName: fileNameFromPath(path),
        phase,
        status: artifact.status,
        source:
          typeof artifact.meta.lastUpdateSource === "string"
            ? artifact.meta.lastUpdateSource
            : typeof artifact.meta.source === "string"
              ? artifact.meta.source
              : undefined,
        updatedAt,
        preview,
        latestChunk,
        content: maybeKeepTextContent(artifact.content),
      };
      const previous = activeWrites.get(nextWrite.id);
      if (!previous) {
        activeWrites.set(nextWrite.id, nextWrite);
        continue;
      }

      const previousTime = previous.updatedAt?.getTime() ?? 0;
      const nextTime = nextWrite.updatedAt?.getTime() ?? 0;
      if (nextTime >= previousTime) {
        activeWrites.set(nextWrite.id, nextWrite);
      }
    }
  }

  return Array.from(activeWrites.values())
    .sort((left, right) => {
      const leftTime = left.updatedAt?.getTime() ?? 0;
      const rightTime = right.updatedAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, 5);
}

function extractArtifactPath(toolCall: ToolCallState): string | undefined {
  const output = toolCall.result?.output;
  return extractArtifactProtocolPathsFromValue(parseJsonValue(output))[0];
}

export function extractOutputSignal(
  toolCall: ToolCallState,
): HarnessOutputSignal | null {
  if (!toolCall.result) return null;

  const metadata = extractMetadata(toolCall);
  const argumentsRecord = asRecord(parseJsonValue(toolCall.arguments));
  const normalizedName = normalizeToolName(toolCall.name);
  const output = toolCall.result.output;
  const outputFile =
    normalizeString(metadata?.output_file) ||
    extractRegexValue(/^输出文件:\s*(.+)$/m, output);
  const offloadFile =
    normalizeString(metadata?.offload_file) ||
    extractRegexValue(
      /^\[Lime Offload\]\s*完整输出已转存到文件：(.+)$/m,
      output,
    );
  const artifactPath =
    extractArtifactProtocolPathsFromValue(metadata)[0] ||
    extractArtifactPath(toolCall);
  const exitCode =
    normalizeNumber(metadata?.exit_code) ||
    parseNumberFromText(/^退出码:\s*(-?\d+)$/m, output) ||
    parseNumberFromText(/^exit_code:\s*(-?\d+)$/m, output) ||
    parseNumberFromText(/Command exited with code (-?\d+)/, output);
  const stdoutLength =
    normalizeNumber(metadata?.stdout_length) ||
    parseNumberFromText(/^stdout_length:\s*(\d+)$/m, output);
  const stderrLength =
    normalizeNumber(metadata?.stderr_length) ||
    parseNumberFromText(/^stderr_length:\s*(\d+)$/m, output);
  const sandboxed =
    normalizeBoolean(metadata?.sandboxed) ||
    parseBooleanFromText(/^sandboxed:\s*(true|false)$/m, output);
  const outputTruncatedFromSummary = parseBooleanFromText(
    /^output_truncated:\s*(true|false)$/m,
    output,
  );
  const truncated =
    output.includes("[event_converter] 工具输出已截断") ||
    output.includes("[output truncated:") ||
    outputTruncatedFromSummary === true;
  const offloaded =
    normalizeBoolean(metadata?.lime_offloaded) === true ||
    !!offloadFile ||
    output.includes("[Lime Offload]");
  const offloadOriginalChars = normalizeNumber(
    metadata?.offload_original_chars,
  );
  const offloadOriginalTokens = normalizeNumber(
    metadata?.offload_original_tokens,
  );
  const offloadTrigger = normalizeString(metadata?.offload_trigger);
  const preview = buildTextPreview(output);
  const content = maybeKeepTextContent(output);
  const searchQuery =
    extractSearchQuery(argumentsRecord) ||
    extractSearchQuery(metadata) ||
    extractRegexValue(/^(?:query|q|搜索词|检索词):\s*(.+)$/im, output);

  if (
    !outputFile &&
    !offloadFile &&
    !artifactPath &&
    exitCode === undefined &&
    stdoutLength === undefined &&
    stderrLength === undefined &&
    sandboxed === undefined &&
    !truncated &&
    !offloaded
  ) {
    if (WEB_TOOL_RE.test(normalizedName) && (preview || content)) {
      const queryLabel = searchQuery || toolCall.name;
      const searchLike = !/^https?:\/\//i.test(queryLabel);
      return {
        id: `${toolCall.id}:output-signal`,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        title: searchLike ? "联网检索摘要" : "网页访问摘要",
        summary: queryLabel,
        preview,
        content,
      };
    }
    return null;
  }

  const summaryParts: string[] = [];
  let title = "工具输出信号";

  if (outputFile) {
    title = "任务输出已落盘";
    summaryParts.push(fileNameFromPath(outputFile));
  }

  if (offloadFile) {
    title = outputFile ? title : "工具输出已转存";
    summaryParts.push(fileNameFromPath(offloadFile));
  }

  if (artifactPath) {
    title = outputFile || offloadFile ? title : "产物已写入";
    summaryParts.push(fileNameFromPath(artifactPath));
  }

  if (exitCode !== undefined) {
    title = outputFile || offloadFile || artifactPath ? title : "命令执行摘要";
    summaryParts.push(`退出码 ${exitCode}`);
  }

  if (stdoutLength !== undefined) {
    summaryParts.push(`stdout ${stdoutLength}`);
  }

  if (stderrLength !== undefined) {
    summaryParts.push(`stderr ${stderrLength}`);
  }

  if (sandboxed !== undefined) {
    summaryParts.push(sandboxed ? "已隔离执行" : "普通执行");
  }

  if (truncated) {
    title =
      outputFile || offloadFile || artifactPath ? title : "工具输出已截断";
    summaryParts.push("输出已截断");
  }

  if (offloaded) {
    title =
      outputFile || offloadFile || artifactPath ? title : "工具输出已转存";
    summaryParts.push("完整输出已转存");
  }

  if (offloadOriginalChars !== undefined) {
    summaryParts.push(`原始 ${offloadOriginalChars} 字符`);
  }
  if (offloadOriginalTokens !== undefined) {
    summaryParts.push(`约 ${offloadOriginalTokens} tokens`);
  }
  if (offloadTrigger) {
    summaryParts.push(
      offloadTrigger === "history_context_pressure"
        ? "上下文压力触发"
        : offloadTrigger === "token_limit_before_evict"
          ? "token 阈值触发"
          : offloadTrigger === "payload_bytes"
            ? "字节阈值触发"
            : offloadTrigger === "payload_chars"
              ? "字符阈值触发"
              : offloadTrigger,
    );
  }

  return {
    id: `${toolCall.id}:output-signal`,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    title,
    summary: summaryParts.join(" / ") || "存在可观测输出信号",
    preview,
    content,
    outputFile,
    offloadFile,
    artifactPath,
    exitCode,
    stdoutLength,
    stderrLength,
    sandboxed,
    truncated,
    offloaded,
    offloadOriginalChars,
    offloadOriginalTokens,
    offloadTrigger,
  };
}

export function extractFileEventFromToolCall(
  toolCall: ToolCallState,
  normalizedName: string,
): HarnessFileEvent | null {
  if (
    !FILESYSTEM_TOOL_NAMES.has(normalizedName) &&
    normalizedName !== "read_file" &&
    normalizedName !== "write_file" &&
    normalizedName !== "edit_file"
  ) {
    return null;
  }

  const args = asRecord(parseJsonValue(toolCall.arguments));
  const metadata = extractMetadata(toolCall);
  const path =
    extractArtifactProtocolPathsFromValue(args)[0] ||
    extractArtifactProtocolPathsFromValue(metadata)[0] ||
    // 非 artifact 协议文件工具仍可能只暴露通用文件参数，这里保留事件级 fallback。
    extractFilesystemEventPathsFromValue(args)[0] ||
    extractFilesystemEventPathsFromValue(metadata)[0];
  if (!path) {
    return null;
  }

  const timestamp =
    normalizeDate(toolCall.endTime) ??
    normalizeDate(toolCall.startTime) ??
    undefined;
  const action: HarnessFileAction = normalizedName.startsWith("read")
    ? "read"
    : normalizedName.includes("edit")
      ? "edit"
      : "write";
  const sourceContent =
    action === "read"
      ? toolCall.result?.output
      : extractContentFromRecord(args) ||
        normalizeString(metadata?.content) ||
        toolCall.result?.output;
  const content = maybeKeepTextContent(sourceContent);
  const preview = buildTextPreview(sourceContent);

  return {
    id: `${toolCall.id}:file:${action}:${path}`,
    toolCallId: toolCall.id,
    path,
    displayName: fileNameFromPath(path),
    kind: resolveFileKind(path),
    action,
    sourceToolName: toolCall.name,
    timestamp,
    preview,
    content,
    clickable: true,
  };
}

export function extractFileEventsFromOutputSignal(
  signal: HarnessOutputSignal,
  toolCall: ToolCallState,
): HarnessFileEvent[] {
  const timestamp =
    normalizeDate(toolCall.endTime) ??
    normalizeDate(toolCall.startTime) ??
    undefined;
  const events: HarnessFileEvent[] = [];

  if (signal.outputFile) {
    events.push({
      id: `${signal.id}:output-file`,
      toolCallId: toolCall.id,
      path: signal.outputFile,
      displayName: fileNameFromPath(signal.outputFile),
      kind: resolveFileKind(signal.outputFile, "log"),
      action: "persist",
      sourceToolName: signal.toolName,
      timestamp,
      preview: signal.preview,
      clickable: true,
    });
  }

  if (signal.offloadFile) {
    events.push({
      id: `${signal.id}:offload-file`,
      toolCallId: toolCall.id,
      path: signal.offloadFile,
      displayName: fileNameFromPath(signal.offloadFile),
      kind: "offload",
      action: "offload",
      sourceToolName: signal.toolName,
      timestamp,
      preview: signal.preview,
      clickable: true,
    });
  }

  if (signal.artifactPath) {
    events.push({
      id: `${signal.id}:artifact-file`,
      toolCallId: toolCall.id,
      path: signal.artifactPath,
      displayName: fileNameFromPath(signal.artifactPath),
      kind: resolveFileKind(signal.artifactPath, "artifact"),
      action: "persist",
      sourceToolName: signal.toolName,
      timestamp,
      preview: signal.preview,
      clickable: true,
    });
  }

  return events;
}

export function mergeFileEvent(
  previous: HarnessFileEvent | undefined,
  next: HarnessFileEvent,
): HarnessFileEvent {
  if (!previous) {
    return next;
  }

  return {
    ...previous,
    ...next,
    preview: next.preview || previous.preview,
    content: next.content || previous.content,
    timestamp: next.timestamp || previous.timestamp,
    clickable: previous.clickable || next.clickable,
  };
}

function isPlanningTool(name: string): boolean {
  return PLANNING_TOOL_NAMES.has(name);
}

export function classifyToolActivity(
  activity: HarnessToolActivity,
  name: string,
): void {
  if (isPlanningTool(name)) {
    activity.planning += 1;
    return;
  }

  if (name === "subagenttask") {
    activity.delegation += 1;
    return;
  }

  if (name === "taskoutput" || name === "taskstop" || name === "bash") {
    activity.execution += 1;
    return;
  }

  if (FILESYSTEM_TOOL_NAMES.has(name)) {
    activity.filesystem += 1;
    return;
  }

  if (WEB_TOOL_RE.test(name)) {
    activity.web += 1;
    return;
  }

  if (SKILL_TOOL_NAMES.has(name)) {
    activity.skills += 1;
  }
}

export function extractDelegatedTask(
  toolCall: ToolCallState,
): HarnessDelegatedTask {
  const args = asRecord(parseJsonValue(toolCall.arguments));
  const title =
    (typeof args?.description === "string" && args.description.trim()) ||
    (typeof args?.prompt === "string" && args.prompt.trim()) ||
    "子任务委派";

  return {
    id: toolCall.id,
    title,
    status: toolCall.status,
    taskType:
      typeof args?.taskType === "string"
        ? args.taskType
        : typeof args?.task_type === "string"
          ? args.task_type
          : undefined,
    role: typeof args?.role === "string" ? args.role : undefined,
    model: typeof args?.model === "string" ? args.model : undefined,
    summary: summarizeToolOutput(toolCall),
    startedAt: normalizeDate(toolCall.startTime) ?? undefined,
  };
}
