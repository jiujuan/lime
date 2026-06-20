import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import { extractLimeToolMetadataBlock } from "../hooks/agentChatToolResult";
import type { AgentThreadItem } from "../types";
import {
  getHostnameFromUrl,
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
} from "./searchResultPreview";
import {
  normalizeSiteToolResultSummary,
} from "./siteToolResultSummary";
import {
  getToolDisplayInfo,
  isBrowserToolName,
  normalizeToolNameKey,
  parseToolCallArguments,
  resolveToolFilePath,
  resolveToolPrimarySubject,
  type ToolCallArgumentValue,
} from "./toolDisplayInfo";
import {
  normalizeToolSearchResultSummary,
  resolveUserFacingToolSearchItemLabel,
} from "./toolSearchResultSummary";
import {
  isLimeTaskProtocolFailure,
  resolveLimeTaskProtocolFailureDisplayText,
} from "./limeTaskProtocolNoise";
import { resolveContentWorkbenchToolCopy } from "./contentWorkbenchToolCopy";
import { resolveRequiredAgentChatCopy } from "./agentChatCopy";

type ToolProcessStatus =
  | ToolCallState["status"]
  | Extract<AgentThreadItem["status"], "in_progress">;

type ToolProcessNarrativeSource =
  | "none"
  | "error"
  | "tool_search"
  | "search_results"
  | "site"
  | "vision"
  | "plain_result"
  | "generic";

export interface ToolProcessNarrative {
  preSummary: string | null;
  postSummary: string | null;
  summary: string | null;
  postSource: ToolProcessNarrativeSource;
}

interface ToolProcessInput {
  toolName: string;
  argumentsValue?: string | Record<string, unknown>;
  status: ToolProcessStatus;
  output?: string;
  error?: string;
  metadata?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\s+([，。！？、；：,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(
  value: string | null | undefined,
  maxLength = 80,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripFencedCode(value: string): string {
  return value.replace(/```[\s\S]*?```/g, "").trim();
}

function looksLikeCodeOrJson(value: string): boolean {
  return /^(?:[{[]|import\s|export\s|const\s|let\s|var\s|function\s|class\s|if\s*\(|for\s*\(|while\s*\(|return\s|<\w+)/i.test(
    value,
  );
}

function looksLikeOpaqueAck(value: string): boolean {
  return /^(?:ok|okay|done|success|completed|true|false|null|undefined)$/i.test(
    value.trim(),
  );
}

function looksLikeXmlOrHtmlDocument(value: string): boolean {
  const normalized = value.trim().slice(0, 600);
  return (
    /^<\?xml\b/i.test(normalized) ||
    /^<!doctype\s+html\b/i.test(normalized) ||
    /^<html\b/i.test(normalized) ||
    /^<rss\b/i.test(normalized) ||
    /^<feed\b/i.test(normalized) ||
    /<(rss|feed|channel|item|entry|html|body)\b/i.test(normalized)
  );
}

function looksLikeWebRetrievalNoise(value: string): boolean {
  const normalized = collapseWhitespace(value).toLowerCase();
  return (
    looksLikeXmlOrHtmlDocument(value) ||
    /\b(?:timed?\s*out|timeout|deadline exceeded|network error|fetch failed|connection refused|connection reset|dns|ssl|tls|invalid url|unsupported url|404 not found|403 forbidden|429 too many requests|502 bad gateway|503 service unavailable)\b/i.test(
      normalized,
    ) ||
    /^(?:error|failed|request failed)[:：]/i.test(normalized)
  );
}

function normalizePlainResultLine(
  value: string | null | undefined,
  maxLength = 96,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const stripped = stripFencedCode(extractLimeToolMetadataBlock(raw).text);
  if (!stripped) {
    return null;
  }

  const line =
    stripped
      .split(/\r?\n/)
      .map((entry) => collapseWhitespace(entry))
      .find(Boolean) || "";
  if (
    !line ||
    looksLikeCodeOrJson(line) ||
    looksLikeOpaqueAck(line) ||
    looksLikeXmlOrHtmlDocument(line)
  ) {
    return null;
  }

  return shorten(line, maxLength);
}

function extractToolResultText(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  const normalized = extractLimeToolMetadataBlock(raw).text.trim();
  return normalized || null;
}

export function isLikelyWebRetrievalDiagnosticNoise(value: string): boolean {
  return looksLikeWebRetrievalNoise(value);
}

function isLikelyWebSearchRuntimeUnavailable(
  toolName: string,
  value: string,
): boolean {
  if (!isUnifiedWebSearchToolName(toolName)) {
    return false;
  }

  const normalized = collapseWhitespace(value).toLowerCase();
  if (!normalized.includes("websearch")) {
    return false;
  }

  return (
    (normalized.includes("-32603") && normalized.includes("-32002")) ||
    normalized.includes("tool not found") ||
    normalized.includes("tool failed") ||
    normalized.includes("未找到可执行的必需工具定义") ||
    normalized.includes("执行 websearch 预调用失败") ||
    normalized.includes("websearch 预调用失败")
  );
}

function stripRuntimeProtocolErrorPrefix(value: string): string | null {
  const stripped = value
    .replace(
      /^\s*(?:执行失败[:：]\s*)?(?:-32603\s*:\s*)?(?:-32002\s*:?\s*)?/i,
      "",
    )
    .replace(/^\s*(?:json-?rpc|runtime|tool)\s+error[:：]\s*/i, "")
    .trim();

  if (!stripped || stripped === value.trim()) {
    return null;
  }

  return stripped;
}

function isLikelyRuntimeProtocolError(value: string): boolean {
  return /(?:-32603|-32002|json-?rpc|tool failed|runtime error)/i.test(value);
}

function resolveRuntimeProtocolErrorSummaryText(
  toolName: string,
  value: string,
  maxLength: number,
): string | null {
  if (!isLikelyRuntimeProtocolError(value)) {
    return null;
  }

  const stripped = stripRuntimeProtocolErrorPrefix(value);
  if (stripped) {
    return normalizePlainResultLine(stripped, maxLength);
  }

  const display = getToolDisplayInfo(toolName, "failed");
  return shorten(
    resolveRequiredAgentChatCopy(
      "toolCall.processSummary.error.runtimeNoDetail",
      { label: display.label },
    ),
    maxLength,
  );
}

export function resolveToolErrorSummaryText(
  toolName: string,
  value: string | null | undefined,
  maxLength = 88,
): string | null {
  const normalized = extractToolResultText(value);
  if (!normalized) {
    return null;
  }

  if (isLikelyWebSearchRuntimeUnavailable(toolName, normalized)) {
    return shorten(
      resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.webSearchRuntimeUnavailable",
      ),
      maxLength,
    );
  }

  if (isLimeTaskProtocolFailure({ toolName, text: normalized })) {
    return shorten(
      resolveLimeTaskProtocolFailureDisplayText({
        toolName,
        text: normalized,
      }),
      maxLength,
    );
  }

  const protocolSummary = resolveRuntimeProtocolErrorSummaryText(
    toolName,
    normalized,
    maxLength,
  );
  if (protocolSummary) {
    return protocolSummary;
  }

  return normalizePlainResultLine(value, maxLength);
}

export function resolveToolErrorDetailText(
  toolName: string,
  value: string | null | undefined,
): string | null {
  const normalized = extractToolResultText(value);
  if (!normalized) {
    return null;
  }

  if (!isLikelyWebSearchRuntimeUnavailable(toolName, normalized)) {
    if (isLimeTaskProtocolFailure({ toolName, text: normalized })) {
      return resolveLimeTaskProtocolFailureDisplayText({
        toolName,
        text: normalized,
      });
    }

    const stripped = stripRuntimeProtocolErrorPrefix(normalized);
    if (stripped) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.withOriginal",
        { message: stripped, original: normalized },
      );
    }

    return normalized;
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.error.withOriginal",
    {
      message: resolveRequiredAgentChatCopy(
        "toolCall.processSummary.error.webSearchRuntimeUnavailable",
      ),
      original: normalized,
    },
  );
}

function normalizeArgumentsRecord(
  value?: string | Record<string, unknown>,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    return parseToolCallArguments(value) as Record<string, unknown>;
  }

  return value;
}

function resolveToolSubject(
  toolName: string,
  argumentsValue?: string | Record<string, unknown>,
): string | null {
  const args = normalizeArgumentsRecord(argumentsValue);
  const toolArgs = args as Record<string, ToolCallArgumentValue>;
  return resolveToolPrimarySubject(
    toolName,
    toolArgs,
    resolveToolFilePath(toolArgs),
  );
}

function resolveUrlLabel(
  args: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
): string | null {
  const rawUrl =
    readString(args, ["url", "pageUrl", "page_url", "href"]) ||
    readString(metadata, ["url", "pageUrl", "page_url", "href"]);
  if (!rawUrl) {
    return null;
  }

  const hostname = shorten(getHostnameFromUrl(rawUrl), 48);
  return hostname || shorten(rawUrl, 64);
}

function buildToolSearchPreSummary(args: Record<string, unknown>): string {
  const query = readString(args, ["query", "q"]) || "";
  if (/^(?:select|tool|tools|name|tag):/i.test(query)) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.toolSearch.confirmAvailable",
    );
  }
  if (query) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.toolSearch.findForQuery",
      { query: shorten(query, 32) },
    );
  }
  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.toolSearch.confirmAvailable",
  );
}

function buildToolSearchPostSummary(output: string): string | null {
  const summary = normalizeToolSearchResultSummary(output);
  if (!summary) {
    return null;
  }

  const toolNames = summary.tools
    .slice(0, 2)
    .map((item) => resolveUserFacingToolSearchItemLabel(item.name))
    .filter(Boolean);
  const prefix = resolveRequiredAgentChatCopy(
    "toolCall.processSummary.toolSearch.confirmedCount",
    { count: summary.count },
  );

  if (toolNames.length === 0) {
    return prefix;
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.toolSearch.confirmedWithTools",
    {
      countLabel: prefix,
      tools: toolNames.join(" · "),
    },
  );
}

function buildWebSearchPostSummary(output: string): string | null {
  const items = resolveSearchResultPreviewItemsFromText(output);
  if (items.length === 0) {
    return null;
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.webSearch.sourcesFound",
    { count: items.length },
  );
}

function buildFetchSearchFailureSummary(family: "fetch" | "search"): string {
  return family === "fetch"
    ? resolveRequiredAgentChatCopy("toolCall.processSummary.fetch.unavailable")
    : resolveRequiredAgentChatCopy("toolCall.processSummary.search.unavailable");
}

function resolveSiteProjectTargetCopy(params: {
  source?: string;
  projectId?: string;
}): string {
  if (params.source === "context_project") {
    return resolveRequiredAgentChatCopy(
      "toolCall.siteResult.target.currentProject",
    );
  }
  if (params.source === "explicit_project") {
    return resolveRequiredAgentChatCopy(
      "toolCall.siteResult.target.selectedProject",
    );
  }
  if (params.projectId?.trim()) {
    return resolveRequiredAgentChatCopy("toolCall.siteResult.target.project", {
      projectId: params.projectId.trim(),
    });
  }
  return resolveRequiredAgentChatCopy("toolCall.siteResult.target.generic");
}

function buildSitePostSummary(metadata: unknown): string | null {
  const summary = normalizeSiteToolResultSummary(metadata);
  if (!summary) {
    return null;
  }

  if (summary.saveErrorMessage) {
    return resolveRequiredAgentChatCopy("toolCall.siteResult.saveError", {
      message: shorten(summary.saveErrorMessage, 56),
    });
  }

  if (summary.savedContent?.title) {
    return resolveRequiredAgentChatCopy("toolCall.siteResult.saved", {
      target: resolveSiteProjectTargetCopy({
        source: summary.savedBy,
        projectId: summary.savedProjectId || summary.savedContent.projectId,
      }),
      title: summary.savedContent.title,
    });
  }

  if (summary.savedContent?.markdownRelativePath) {
    return resolveRequiredAgentChatCopy("toolCall.siteResult.markdownExported");
  }

  if (summary.saveSkippedProjectId) {
    return resolveRequiredAgentChatCopy("toolCall.siteResult.saveSkipped", {
      target: resolveSiteProjectTargetCopy({
        source: summary.saveSkippedBy,
        projectId: summary.saveSkippedProjectId,
      }),
    });
  }

  return null;
}

const LIME_TASK_SUMMARY_LABELS: Partial<
  Record<string, { key: string; defaultValue: string }>
> = {
  limecreatevideogenerationtask: {
    key: "label.videoGeneration",
    defaultValue: "Video generation",
  },
  limecreateaudiogenerationtask: {
    key: "label.audioGeneration",
    defaultValue: "Voice generation",
  },
  limecreatetranscriptiontask: {
    key: "label.transcription",
    defaultValue: "Transcription",
  },
  limecreatebroadcastgenerationtask: {
    key: "label.broadcastGeneration",
    defaultValue: "Broadcast generation",
  },
  limecreatecovergenerationtask: {
    key: "label.coverGeneration",
    defaultValue: "Cover generation",
  },
  limecreateresourcesearchtask: {
    key: "label.resourceSearch",
    defaultValue: "Asset search",
  },
  limecreatemodalresourcesearchtask: {
    key: "label.resourceSearch",
    defaultValue: "Asset search",
  },
  limecreateimagegenerationtask: {
    key: "label.imageGeneration",
    defaultValue: "Image generation",
  },
  limecreateurlparsetask: {
    key: "label.urlParse",
    defaultValue: "URL parsing",
  },
  limecreatetypesettingtask: {
    key: "label.typesetting",
    defaultValue: "Typesetting",
  },
};

const DIRECT_CONTENT_SUMMARY_LABELS: Partial<
  Record<string, { key: string; defaultValue: string }>
> = {
  socialgeneratecoverimage: {
    key: "label.coverImage",
    defaultValue: "cover image",
  },
  generateimage: {
    key: "label.image",
    defaultValue: "image",
  },
};

function normalizeNarrativeSubject(
  subject: string | null,
  placeholders: string[] = [],
): string | null {
  const normalized = shorten(subject, 48);
  if (!normalized) {
    return null;
  }

  return placeholders.includes(normalized) ? null : normalized;
}

function buildLimeTaskSummary(
  phase: "pre" | "post",
  normalizedName: string,
  subject: string | null,
): string | null {
  const directLabel = DIRECT_CONTENT_SUMMARY_LABELS[normalizedName];
  if (directLabel) {
    const normalizedSubject = normalizeNarrativeSubject(subject);
    const label = resolveContentWorkbenchToolCopy(
      directLabel.key,
      directLabel.defaultValue,
    );
    return normalizedSubject
      ? resolveContentWorkbenchToolCopy(
          `summary.direct.${phase}WithSubject`,
          {
            subject: normalizedSubject,
            label,
          },
        )
      : resolveContentWorkbenchToolCopy(
          `summary.direct.${phase}`,
          { label },
        );
  }

  const taskLabel = LIME_TASK_SUMMARY_LABELS[normalizedName];
  if (!taskLabel) {
    return null;
  }

  const normalizedSubject = normalizeNarrativeSubject(subject);
  const label = resolveContentWorkbenchToolCopy(
    taskLabel.key,
    taskLabel.defaultValue,
  );

  return normalizedSubject
    ? resolveContentWorkbenchToolCopy(
        `summary.task.${phase}WithSubject`,
        {
          subject: normalizedSubject,
          label,
        },
      )
    : resolveContentWorkbenchToolCopy(
        `summary.task.${phase}`,
        { label },
      );
}

function buildSiteToolSummary(
  phase: "pre" | "post",
  normalizedName: string,
  subject: string | null,
): string | null {
  const normalizedSubject = normalizeNarrativeSubject(subject, [
    resolveRequiredAgentChatCopy("toolCall.subject.siteCapability"),
    resolveRequiredAgentChatCopy("toolCall.subject.siteCapabilityCatalog"),
    resolveRequiredAgentChatCopy("toolCall.subject.siteAdapter"),
  ]);

  if (normalizedName === "limesitelist") {
    return resolvePhasedProcessSummaryCopy(
      "toolCall.processSummary.siteCapability.list",
      phase,
      null,
    );
  }

  if (normalizedName === "limesiterecommend") {
    return resolvePhasedProcessSummaryCopy(
      "toolCall.processSummary.siteCapability.recommend",
      phase,
      normalizedSubject,
    );
  }

  if (normalizedName === "limesitesearch") {
    return resolvePhasedProcessSummaryCopy(
      "toolCall.processSummary.siteCapability.search",
      phase,
      normalizedSubject,
    );
  }

  if (normalizedName === "limesiteinfo") {
    return resolvePhasedProcessSummaryCopy(
      "toolCall.processSummary.siteCapability.info",
      phase,
      normalizedSubject,
    );
  }

  if (normalizedName === "limesiterun") {
    return resolvePhasedProcessSummaryCopy(
      "toolCall.processSummary.siteCapability.run",
      phase,
      normalizedSubject,
    );
  }

  return null;
}

function buildVisionToolSummary(
  phase: "pre" | "post",
  normalizedName: string,
  subject: string | null,
): string | null {
  const normalizedSubject = normalizeNarrativeSubject(subject);
  const key =
    normalizedName === "viewimage"
      ? "toolCall.processSummary.vision.view"
      : "toolCall.processSummary.vision.analyze";

  return resolvePhasedProcessSummaryCopy(key, phase, normalizedSubject);
}

function buildCommandPreSummary(
  normalizedName: string,
  args: Record<string, unknown>,
): string | null {
  const command = readString(args, ["command", "cmd", "script"]) || "";
  if (normalizedName === "bash" || normalizedName.includes("shell")) {
    if (/^(?:rg|grep|findstr)\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.searchCode",
      );
    }
    if (/^(?:sed|cat|head|tail)\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.viewFileSnippet",
      );
    }
    if (/^git\s+status\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.checkWorkspace",
      );
    }
    if (/^git\s+diff\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.viewDiff",
      );
    }
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.command.checkStatus",
  );
}

function buildBrowserPreSummary(
  normalizedName: string,
  args: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
): string | null {
  const urlLabel = resolveUrlLabel(args, metadata);
  const target =
    readString(args, ["selector", "element", "target", "label", "text"]) ||
    readString(metadata, ["selector", "element", "target", "label", "text"]);

  if (normalizedName.includes("navigate") || normalizedName.includes("goto")) {
    return urlLabel
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.openUrl",
          { target: urlLabel },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.openTargetPage",
        );
  }

  if (
    normalizedName.includes("snapshot") ||
    normalizedName.includes("screenshot")
  ) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.browser.capturePageState",
    );
  }

  if (normalizedName.includes("click")) {
    return target
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.operateTarget",
          { target: shorten(target, 28) },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.operateElement",
        );
  }

  if (
    normalizedName.includes("fill") ||
    normalizedName.includes("type") ||
    normalizedName.includes("selectoption") ||
    normalizedName.includes("presskey")
  ) {
    return target
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.fillTarget",
          { target: shorten(target, 28) },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.continueOperation",
        );
  }

  if (
    normalizedName.includes("evaluate") ||
    normalizedName.includes("runtime")
  ) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.browser.readPageInfo",
    );
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.browser.viewPageState",
  );
}

function buildBrowserPostSummary(
  normalizedName: string,
  args: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
): string | null {
  const urlLabel = resolveUrlLabel(args, metadata);

  if (normalizedName.includes("navigate") || normalizedName.includes("goto")) {
    return urlLabel
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.openedUrl",
          { target: urlLabel },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.browser.openedTargetPage",
        );
  }

  if (
    normalizedName.includes("snapshot") ||
    normalizedName.includes("screenshot")
  ) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.browser.snapshotCaptured",
    );
  }

  if (
    normalizedName.includes("evaluate") ||
    normalizedName.includes("runtime")
  ) {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.browser.stateCaptured",
    );
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.browser.operationCompleted",
  );
}

function resolveProcessSummaryCopy(
  key: string,
  subject: string | null,
): string {
  return subject
    ? resolveRequiredAgentChatCopy(`${key}WithSubject`, { subject })
    : resolveRequiredAgentChatCopy(key);
}

function resolvePhasedProcessSummaryCopy(
  baseKey: string,
  phase: "pre" | "post",
  subject: string | null,
  values: Record<string, unknown> = {},
): string {
  const phaseKey = phase === "pre" ? "pre" : "post";
  return subject
    ? resolveRequiredAgentChatCopy(`${baseKey}.${phaseKey}WithSubject`, {
        ...values,
        subject,
      })
    : resolveRequiredAgentChatCopy(`${baseKey}.${phaseKey}`, values);
}

function buildGenericPostSummary(params: {
  toolName: string;
  status: ToolProcessStatus;
  subject: string | null;
}): string | null {
  const { toolName, subject, status } = params;
  const normalizedName = normalizeToolNameKey(toolName);
  const display = getToolDisplayInfo(
    toolName,
    status === "in_progress" ? "running" : status,
  );
  const normalizedSubject = normalizeNarrativeSubject(subject);

  if (normalizedName === "enterworktree") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.worktree.entered",
    );
  }
  if (normalizedName === "exitworktree") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.worktree.exited",
    );
  }
  if (normalizedName === "config") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.config.updated",
    );
  }
  if (normalizedName === "workflow") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.workflow.completed",
    );
  }
  if (normalizedName === "sleep") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.wait.completed",
    );
  }
  if (normalizedName === "enterplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.entered",
    );
  }
  if (normalizedName === "exitplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.exited",
    );
  }
  if (normalizedName === "structuredoutput") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.finalAnswer.completed",
    );
  }
  if (normalizedName === "skill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.executed",
      normalizedSubject,
    );
  }
  if (normalizedName === "listskills") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.skill.listed",
    );
  }
  if (normalizedName === "loadskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.loaded",
      normalizedSubject,
    );
  }
  if (normalizedName === "listmcpresources") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourcesListed",
      normalizedSubject,
    );
  }
  if (normalizedName === "readmcpresource") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourceRead",
      normalizedSubject,
    );
  }
  if (normalizedName === "tasklist") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.task.listed",
    );
  }
  if (normalizedName === "taskcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.started",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskget") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.detailViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskupdate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.updated",
      normalizedSubject,
    );
  }
  if (normalizedName === "updateplan") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.plan.updated",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskoutput") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.outputViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskstop") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.stopped",
      normalizedSubject,
    );
  }
  if (normalizedName === "teamcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.created",
      normalizedSubject,
    );
  }
  if (normalizedName === "teamdelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.deleted",
      normalizedSubject,
    );
  }
  if (normalizedName === "listpeers") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.peersListed",
      normalizedSubject,
    );
  }
  if (normalizedName === "waitagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.progressViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "resumeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.resumed",
      normalizedSubject,
    );
  }
  if (normalizedName === "closeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.paused",
      normalizedSubject,
    );
  }
  if (normalizedName === "croncreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.cron.created",
      normalizedSubject,
    );
  }
  if (normalizedName === "cronlist") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.cron.listed");
  }
  if (normalizedName === "crondelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.cron.deleted",
      normalizedSubject,
    );
  }
  if (normalizedName === "remotetrigger") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.remoteTrigger.handled",
      normalizedSubject,
    );
  }
  const limeTaskSummary = buildLimeTaskSummary(
    "post",
    normalizedName,
    normalizedSubject,
  );
  if (limeTaskSummary) {
    return limeTaskSummary;
  }
  const siteToolSummary = buildSiteToolSummary(
    "post",
    normalizedName,
    normalizedSubject,
  );
  if (siteToolSummary) {
    return siteToolSummary;
  }
  if (normalizedName === "limerunserviceskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.serviceSkill.compatRun",
      normalizedSubject,
    );
  }
  if (normalizedName === "mcp") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.mcp.called");
  }
  if (normalizedName === "mcpauth") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.mcp.authorized");
  }

  switch (display.family) {
    case "vision":
      return buildVisionToolSummary("post", normalizedName, normalizedSubject);
    case "read":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.read",
        normalizedSubject,
      );
    case "list":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.located",
        normalizedSubject,
      );
    case "write":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.written",
        normalizedSubject,
      );
    case "edit":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.edited",
        normalizedSubject,
      );
    case "command":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.commandCompleted",
      );
    case "fetch":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.fetched",
        normalizedSubject,
      );
    case "task":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.stepStarted",
      );
    case "subagent":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.subtaskDelegated",
      );
    case "search":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.searched",
        normalizedSubject,
      );
    case "browser":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.browser.operationCompleted",
      );
    case "plan":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.planHandled",
        normalizedSubject,
      );
    default:
      return normalizedSubject
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.handledWithSubject",
            { subject: normalizedSubject },
          )
        : null;
  }
}

function buildGenericPreSummary(params: {
  toolName: string;
  argumentsValue?: string | Record<string, unknown>;
  metadata?: unknown;
}): string | null {
  const { toolName, argumentsValue, metadata } = params;
  const normalizedName = normalizeToolNameKey(toolName);
  const args = normalizeArgumentsRecord(argumentsValue);
  const metadataRecord = asRecord(metadata);
  const subject = resolveToolSubject(toolName, argumentsValue);
  const normalizedSubject = normalizeNarrativeSubject(subject);
  const query =
    readString(args, ["query", "q", "pattern", "search_query"]) ||
    readString(metadataRecord, ["query", "q", "pattern", "search_query"]);

  if (normalizedName === "toolsearch") {
    return buildToolSearchPreSummary(args);
  }

  if (normalizedName === "agent") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.subtask.splitFirst",
    );
  }

  if (normalizedName === "sendmessage") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.subtask.addNoteFirst",
    );
  }

  if (normalizedName === "waitagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.waitFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "resumeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.resumeFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "closeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.pauseFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "requestuserinput") {
    return subject
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.userInput.confirmFirstWithSubject",
          { subject: shorten(subject, 40) },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.userInput.confirmFirst",
        );
  }

  if (normalizedName === "enterworktree") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.worktree.enterFirst",
    );
  }

  if (normalizedName === "exitworktree") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.worktree.exitFirst",
    );
  }

  if (normalizedName === "config") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.config.reviewFirst",
    );
  }

  if (normalizedName === "workflow") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.workflow.runFirst",
    );
  }

  if (normalizedName === "sleep") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.wait.first");
  }

  if (normalizedName === "sendusermessage" || normalizedName === "brief") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.userMessage.syncFirst",
    );
  }

  if (isUnifiedWebSearchToolName(toolName)) {
    return query
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.webSearch.searchFirstWithQuery",
          { query: shorten(query, 36) },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.webSearch.searchFirst",
        );
  }

  if (isBrowserToolName(normalizedName)) {
    return buildBrowserPreSummary(normalizedName, args, metadataRecord);
  }

  const display = getToolDisplayInfo(toolName, "running");

  if (normalizedName === "enterplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.enterFirst",
    );
  }

  if (normalizedName === "exitplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.exitFirst",
    );
  }

  if (normalizedName === "structuredoutput") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.finalAnswer.prepareFirst",
    );
  }

  if (normalizedName === "skill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.executeFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listskills") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.skill.listFirst",
    );
  }

  if (normalizedName === "loadskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.loadFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listmcpresources") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourcesListFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "readmcpresource") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourceReadFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.startFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "tasklist") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.task.listFirst",
    );
  }

  if (normalizedName === "taskget") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.detailViewFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskupdate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.updateFirst",
      normalizedSubject,
    );
  }
  if (normalizedName === "updateplan") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.plan.updateFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskoutput") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.outputViewFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskstop") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.stopFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "teamcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.createFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "teamdelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.deleteFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listpeers") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.peersListFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "croncreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.cron.createFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "cronlist") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.cron.listFirst",
    );
  }

  if (normalizedName === "crondelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.cron.deleteFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "remotetrigger") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.remoteTrigger.handleFirst",
      normalizedSubject,
    );
  }
  const limeTaskSummary = buildLimeTaskSummary(
    "pre",
    normalizedName,
    normalizedSubject,
  );
  if (limeTaskSummary) {
    return limeTaskSummary;
  }
  const siteToolSummary = buildSiteToolSummary(
    "pre",
    normalizedName,
    normalizedSubject,
  );
  if (siteToolSummary) {
    return siteToolSummary;
  }

  if (normalizedName === "limerunserviceskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.serviceSkill.compatRunFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "mcp") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.mcp.callFirst");
  }

  if (normalizedName === "mcpauth") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.mcp.authorizeFirst",
    );
  }

  switch (display.family) {
    case "vision":
      return buildVisionToolSummary("pre", normalizedName, normalizedSubject);
    case "read":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.readFirst",
        normalizedSubject,
      );
    case "list":
      if (normalizedName.includes("grep") || normalizedName.includes("glob")) {
        return resolveProcessSummaryCopy(
          "toolCall.processSummary.generic.locateFirst",
          normalizedSubject,
        );
      }
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.listFirst",
        normalizedSubject,
      );
    case "command":
      return buildCommandPreSummary(normalizedName, args);
    case "fetch": {
      const urlLabel = resolveUrlLabel(args, metadataRecord);
      if (urlLabel) {
        return resolveRequiredAgentChatCopy(
          "toolCall.processSummary.generic.fetchFirstWithSubject",
          { subject: urlLabel },
        );
      }
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.fetchFirst",
        normalizedSubject,
      );
    }
    case "search":
      return query
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.searchFirstWithSubject",
            { subject: shorten(query, 36) },
          )
        : resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.searchFirst",
          );
    case "write":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.writeFirst",
        normalizedSubject,
      );
    case "edit":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.editFirst",
        normalizedSubject,
      );
    case "task":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.stepStartFirst",
      );
    case "plan":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.planHandleFirst",
        normalizedSubject,
      );
    default:
      return normalizedSubject
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.handleFirstWithSubject",
            { subject: normalizedSubject },
          )
        : null;
  }
}

function buildNarrative(input: ToolProcessInput): ToolProcessNarrative {
  const preSummary = buildGenericPreSummary({
    toolName: input.toolName,
    argumentsValue: input.argumentsValue,
    metadata: input.metadata,
  });
  const normalizedName = normalizeToolNameKey(input.toolName);
  const display = getToolDisplayInfo(
    input.toolName,
    input.status === "in_progress" ? "running" : input.status,
  );
  const resultOutput = input.output || "";
  const plainError = resolveToolErrorSummaryText(
    input.toolName,
    input.error,
    88,
  );
  const plainOutput = normalizePlainResultLine(resultOutput, 96);
  const failedOutputSummary =
    input.status === "failed"
      ? resolveToolErrorSummaryText(input.toolName, resultOutput, 96) ||
        plainOutput
      : plainOutput;
  const limeTaskFailureSummary =
    input.status === "failed" &&
    isLimeTaskProtocolFailure({
      toolName: input.toolName,
      text: input.error || resultOutput,
    })
      ? resolveLimeTaskProtocolFailureDisplayText({
          toolName: input.toolName,
          text: input.error || resultOutput,
        })
      : null;
  const args = normalizeArgumentsRecord(input.argumentsValue);
  const metadata = asRecord(input.metadata);
  const subject = resolveToolSubject(input.toolName, input.argumentsValue);

  let postSummary: string | null = null;
  let postSource: ToolProcessNarrativeSource = "none";

  if (input.status === "failed") {
    if (limeTaskFailureSummary) {
      postSummary = limeTaskFailureSummary;
      postSource = "error";
    } else if (display.family === "fetch" || display.family === "search") {
      postSummary = buildFetchSearchFailureSummary(display.family);
      postSource = "error";
    } else {
      postSummary =
        plainError ||
        (failedOutputSummary
          ? resolveRequiredAgentChatCopy(
              "toolCall.processSummary.error.failed",
              { message: failedOutputSummary },
            )
          : null);
    }
    if (postSummary && !limeTaskFailureSummary) {
      if (display.family !== "fetch" && display.family !== "search") {
        const failurePrefix = resolveRequiredAgentChatCopy(
          "toolCall.processSummary.error.failedPrefix",
        );
        if (!postSummary.startsWith(failurePrefix)) {
          postSummary = resolveRequiredAgentChatCopy(
            "toolCall.processSummary.error.failed",
            { message: postSummary },
          );
        }
      }
      postSource = "error";
    }
  }

  if (
    !postSummary &&
    (display.family === "fetch" || display.family === "search") &&
    resultOutput &&
    looksLikeWebRetrievalNoise(resultOutput)
  ) {
    postSummary = buildFetchSearchFailureSummary(display.family);
    postSource = "error";
  }

  if (!postSummary) {
    const siteSummary = buildSitePostSummary(input.metadata);
    if (siteSummary) {
      postSummary = siteSummary;
      postSource = "site";
    }
  }

  if (!postSummary && normalizedName === "toolsearch") {
    const toolSearchSummary = buildToolSearchPostSummary(resultOutput);
    if (toolSearchSummary) {
      postSummary = toolSearchSummary;
      postSource = "tool_search";
    }
  }

  if (!postSummary && isUnifiedWebSearchToolName(input.toolName)) {
    const searchSummary = buildWebSearchPostSummary(resultOutput);
    if (searchSummary) {
      postSummary = searchSummary;
      postSource = "search_results";
    }
  }

  if (!postSummary && isBrowserToolName(normalizedName)) {
    postSummary = buildBrowserPostSummary(normalizedName, args, metadata);
    postSource = postSummary ? "generic" : "none";
  }

  if (!postSummary && display.family === "vision") {
    const visionSummary = buildVisionToolSummary(
      "post",
      normalizedName,
      normalizeNarrativeSubject(subject),
    );
    if (visionSummary) {
      postSummary = visionSummary;
      postSource = "vision";
    }
  }

  if (!postSummary && plainOutput) {
    postSummary = plainOutput;
    postSource = "plain_result";
  }

  if (!postSummary) {
    postSummary = buildGenericPostSummary({
      toolName: input.toolName,
      status: input.status,
      subject,
    });
    postSource = postSummary ? "generic" : "none";
  }

  const resolvedPreSummary =
    input.status !== "running" &&
    input.status !== "in_progress" &&
    normalizedName === "updateplan"
      ? postSummary || preSummary
      : preSummary;
  const summary =
    input.status === "running" || input.status === "in_progress"
      ? resolvedPreSummary
      : postSummary || resolvedPreSummary;

  return {
    preSummary: resolvedPreSummary,
    postSummary,
    summary,
    postSource,
  };
}

export function resolveToolProcessNarrative(
  toolCall: ToolCallState,
): ToolProcessNarrative {
  return buildNarrative({
    toolName: toolCall.name,
    argumentsValue: toolCall.arguments,
    status: toolCall.status,
    output: toolCall.result?.output,
    error: toolCall.result?.error,
    metadata: toolCall.result?.metadata,
  });
}

export function resolveAgentThreadToolProcessNarrative(
  item: AgentThreadItem,
): ToolProcessNarrative | null {
  if (item.type === "tool_call") {
    return buildNarrative({
      toolName: item.tool_name,
      argumentsValue: asRecord(item.arguments) || undefined,
      status: item.status,
      output: item.output,
      error: item.error,
      metadata: item.metadata,
    });
  }

  if (item.type === "command_execution") {
    return buildNarrative({
      toolName: "exec_command",
      argumentsValue: {
        command: item.command,
        cwd: item.cwd,
      },
      status: item.status,
      output: item.aggregated_output,
      error: item.error,
      metadata:
        item.exit_code !== undefined
          ? {
              exit_code: item.exit_code,
              cwd: item.cwd,
            }
          : { cwd: item.cwd },
    });
  }

  if (item.type === "web_search") {
    return buildNarrative({
      toolName: "web_search",
      argumentsValue: item.query
        ? { action: item.action || "web_search", query: item.query }
        : { action: item.action || "web_search" },
      status: item.status,
      output: item.output,
    });
  }

  return null;
}

export function resolveAgentThreadToolProcessPreview(
  item: AgentThreadItem,
): string | null {
  const narrative = resolveAgentThreadToolProcessNarrative(item);
  if (!narrative) {
    return null;
  }

  if (item.status !== "completed") {
    return narrative.summary;
  }

  return narrative.postSource !== "generic" ? narrative.summary : null;
}
