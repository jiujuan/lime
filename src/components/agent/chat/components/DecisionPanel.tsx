/**
 * DecisionPanel - 权限确认面板
 *
 * 用于显示需要用户确认的操作，如：
 * - 工具调用确认
 * - 用户问题（request_user_input）
 * - 权限请求
 *
 * 参考通用协作代理交互设计
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Terminal,
  FileEdit,
  Globe,
  Loader2,
} from "lucide-react";
import type { ActionRequired, ConfirmResponse, QuestionOption } from "../types";
import { isRuntimeActionConfirmationRequestId } from "../utils/runtimeActionConfirmation";

interface DecisionPanelProps {
  request: ActionRequired;
  onSubmit: (response: ConfirmResponse) => void | Promise<void>;
}

interface DecisionPanelSubmissionState {
  key: string;
  kind: "allow" | "deny";
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

/** 获取工具图标 */
function getToolIcon(toolName?: string) {
  if (!toolName) return <HelpCircle className="h-4 w-4" />;

  const name = toolName.toLowerCase();
  if (
    name.includes("bash") ||
    name.includes("terminal") ||
    name.includes("exec")
  ) {
    return <Terminal className="h-4 w-4" />;
  }
  if (
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("file")
  ) {
    return <FileEdit className="h-4 w-4" />;
  }
  if (name.includes("web") || name.includes("fetch") || name.includes("http")) {
    return <Globe className="h-4 w-4" />;
  }
  return <AlertTriangle className="h-4 w-4" />;
}

/** 格式化工具参数 */
function formatArguments(args?: Record<string, unknown>): string {
  if (!args) return "";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

interface ToolConfirmationArgumentRow {
  id: string;
  label: string;
  value: string;
  mono?: boolean;
}

interface ToolConfirmationImpactSummary {
  risk: "low" | "medium" | "high";
  riskReason: "command" | "destructiveCommand" | "file" | "network" | "default";
  riskReasonText?: string;
  scopeKind: "path" | "url" | "cwd" | "tool";
  scopeValue: string;
  authorizationText?: string;
}

type ToolConfirmationRisk = ToolConfirmationImpactSummary["risk"];
type ToolConfirmationRiskReason = ToolConfirmationImpactSummary["riskReason"];
type ToolConfirmationScopeKind = ToolConfirmationImpactSummary["scopeKind"];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringifyArgumentPreview(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => stringifyArgumentPreview(item))
      .filter((item): item is string => Boolean(item));
    return normalized.length > 0 ? normalized.join(", ") : undefined;
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function clipArgumentPreview(value: string): string {
  const maxLength = 180;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function readArgumentPreview(
  args: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const value = stringifyArgumentPreview(args[key]);
    if (value) {
      return clipArgumentPreview(value);
    }
  }
  return undefined;
}

function readStringFact(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = stringifyArgumentPreview(record[key]);
    if (value) return value;
  }
  return undefined;
}

function findPermissionFactsRecord(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!args) return undefined;
  const direct =
    asRecord(args.permission_facts) ||
    asRecord(args.permissionFacts) ||
    asRecord(args.permission_review) ||
    asRecord(args.permissionReview) ||
    asRecord(args.permission);
  if (direct) return direct;

  const metadata = asRecord(args.metadata);
  return (
    asRecord(metadata?.permission_facts) ||
    asRecord(metadata?.permissionFacts) ||
    asRecord(metadata?.permission_review) ||
    asRecord(metadata?.permissionReview) ||
    asRecord(metadata?.permission)
  );
}

function normalizeToolConfirmationRisk(
  value?: string,
): ToolConfirmationRisk | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized === "high" ||
    normalized === "critical" ||
    normalized === "destructive" ||
    normalized === "danger"
  ) {
    return "high";
  }
  if (
    normalized === "medium" ||
    normalized === "moderate" ||
    normalized === "reversible" ||
    normalized === "ask" ||
    normalized === "requires_confirmation"
  ) {
    return "medium";
  }
  if (
    normalized === "low" ||
    normalized === "read_only" ||
    normalized === "readonly" ||
    normalized === "safe" ||
    normalized === "none"
  ) {
    return "low";
  }
  return undefined;
}

function normalizeToolConfirmationRiskReason(
  value?: string,
): ToolConfirmationRiskReason | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (
    normalized === "destructive" ||
    normalized === "destructive_command" ||
    normalized === "high_impact_command"
  ) {
    return "destructiveCommand";
  }
  if (
    normalized === "command" ||
    normalized === "shell" ||
    normalized === "local_command"
  ) {
    return "command";
  }
  if (
    normalized === "file" ||
    normalized === "filesystem" ||
    normalized === "file_write" ||
    normalized === "file_read"
  ) {
    return "file";
  }
  if (
    normalized === "network" ||
    normalized === "browser" ||
    normalized === "web" ||
    normalized === "http"
  ) {
    return "network";
  }
  if (normalized === "default" || normalized === "tool") {
    return "default";
  }
  return undefined;
}

function normalizeToolConfirmationScopeKind(
  value?: string,
): ToolConfirmationScopeKind | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (
    normalized === "path" ||
    normalized === "file" ||
    normalized === "file_path" ||
    normalized === "target_path"
  ) {
    return "path";
  }
  if (
    normalized === "url" ||
    normalized === "uri" ||
    normalized === "endpoint" ||
    normalized === "link"
  ) {
    return "url";
  }
  if (
    normalized === "cwd" ||
    normalized === "directory" ||
    normalized === "working_directory" ||
    normalized === "workspace"
  ) {
    return "cwd";
  }
  if (normalized === "tool" || normalized === "runtime") {
    return "tool";
  }
  return undefined;
}

function readStructuredToolConfirmationImpactSummary(
  args: Record<string, unknown> | undefined,
): ToolConfirmationImpactSummary | undefined {
  const facts = findPermissionFactsRecord(args);
  const factRiskValue = readStringFact(facts, [
    "risk_level",
    "riskLevel",
    "risk",
    "level",
  ]);
  const topLevelRiskValue = readStringFact(args, ["risk_level", "riskLevel"]);
  const risk = normalizeToolConfirmationRisk(
    factRiskValue || topLevelRiskValue,
  );
  const factScopeKindValue = readStringFact(facts, [
    "scope_kind",
    "scopeKind",
    "permission_scope_kind",
    "permissionScopeKind",
  ]);
  const topLevelScopeKindValue = readStringFact(args, [
    "scope_kind",
    "scopeKind",
    "permission_scope_kind",
    "permissionScopeKind",
  ]);
  const scopeKind = normalizeToolConfirmationScopeKind(
    factScopeKindValue || topLevelScopeKindValue,
  );
  const factScopeValue = readStringFact(facts, [
    "scope_value",
    "scopeValue",
    "permission_scope",
    "permissionScope",
    "target",
    "target_path",
    "targetPath",
    "path",
    "url",
    "cwd",
  ]);
  const topLevelScopeValue = readStringFact(args, [
    "scope_value",
    "scopeValue",
    "permission_scope",
    "permissionScope",
  ]);
  const scopeValue = factScopeValue || topLevelScopeValue;

  if (
    !facts &&
    !factRiskValue &&
    !topLevelRiskValue &&
    !factScopeKindValue &&
    !topLevelScopeKindValue &&
    !factScopeValue &&
    !topLevelScopeValue
  ) {
    return undefined;
  }

  const riskReasonRaw =
    readStringFact(facts, [
      "risk_reason",
      "riskReason",
      "reason",
      "category",
    ]) || readStringFact(args, ["risk_reason", "riskReason"]);
  const riskReason = normalizeToolConfirmationRiskReason(riskReasonRaw);
  const riskReasonText = readStringFact(facts, [
    "risk_reason_label",
    "riskReasonLabel",
    "risk_reason_text",
    "riskReasonText",
    "reason_label",
    "reasonLabel",
    "summary",
  ]);
  const authorizationText = readStringFact(facts, [
    "authorization_label",
    "authorizationLabel",
    "authorization_summary",
    "authorizationSummary",
    "authorization_scope",
    "authorizationScope",
    "permission_mode",
    "permissionMode",
  ]);

  return {
    risk: risk ?? "low",
    riskReason: riskReason ?? "default",
    riskReasonText,
    scopeKind: scopeKind ?? "tool",
    scopeValue: scopeValue ? clipArgumentPreview(scopeValue) : "",
    authorizationText,
  };
}

function resolveToolConfirmationArgumentRows(
  args: Record<string, unknown> | undefined,
  labels: {
    command: string;
    cwd: string;
    path: string;
    url: string;
    mode: string;
    input: string;
  },
): ToolConfirmationArgumentRow[] {
  if (!args) return [];

  const rows: ToolConfirmationArgumentRow[] = [];
  const usedKeys = new Set<string>([
    "permission",
    "permission_facts",
    "permissionFacts",
    "permission_review",
    "permissionReview",
    "metadata",
    "risk_level",
    "riskLevel",
    "risk_reason",
    "riskReason",
    "scope_kind",
    "scopeKind",
    "permission_scope",
    "permissionScope",
    "authorization_scope",
    "authorizationScope",
  ]);
  const pushKnown = (
    id: string,
    label: string,
    aliases: string[],
    mono = true,
  ) => {
    const value = readArgumentPreview(args, aliases);
    if (!value) return;
    rows.push({ id, label, value, mono });
    aliases.forEach((key) => usedKeys.add(key));
  };

  pushKnown("command", labels.command, ["command", "cmd", "script", "code"]);
  pushKnown("cwd", labels.cwd, [
    "cwd",
    "working_directory",
    "workingDirectory",
  ]);
  pushKnown("path", labels.path, [
    "path",
    "file",
    "file_path",
    "filePath",
    "target_path",
    "targetPath",
    "source_path",
    "sourcePath",
  ]);
  pushKnown("url", labels.url, ["url", "uri", "href", "endpoint"]);
  pushKnown("mode", labels.mode, ["mode", "action", "operation"], false);
  pushKnown("input", labels.input, ["input", "prompt", "text"], false);

  if (rows.length >= 4) {
    return rows.slice(0, 4);
  }

  for (const [key, rawValue] of Object.entries(args)) {
    if (rows.length >= 4) break;
    if (usedKeys.has(key)) continue;
    const value = stringifyArgumentPreview(rawValue);
    if (!value) continue;
    rows.push({
      id: key,
      label: key,
      value: clipArgumentPreview(value),
      mono: typeof rawValue !== "boolean",
    });
  }

  return rows;
}

function isShellLikeTool(toolName?: string): boolean {
  const normalized = toolName?.toLowerCase() ?? "";
  return (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("terminal") ||
    normalized.includes("exec")
  );
}

function isFileLikeTool(toolName?: string): boolean {
  const normalized = toolName?.toLowerCase() ?? "";
  return (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("file")
  );
}

function isNetworkLikeTool(toolName?: string): boolean {
  const normalized = toolName?.toLowerCase() ?? "";
  return (
    normalized.includes("web") ||
    normalized.includes("fetch") ||
    normalized.includes("http") ||
    normalized.includes("browser")
  );
}

function looksDestructiveCommand(command?: string): boolean {
  if (!command) return false;
  return /\b(rm\s+-rf|sudo|chmod\s+777|chown|git\s+reset|git\s+clean|del\s+\/f|rmdir\s+\/s|powershell|curl\b[\s\S]*\|\s*(?:sh|bash))\b/i.test(
    command,
  );
}

function resolveToolConfirmationImpactSummary(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined,
): ToolConfirmationImpactSummary {
  const structuredSummary = readStructuredToolConfirmationImpactSummary(args);
  if (structuredSummary) {
    return {
      ...structuredSummary,
      scopeValue: structuredSummary.scopeValue || toolName || "",
    };
  }

  const command = readArgumentPreview(args, [
    "command",
    "cmd",
    "script",
    "code",
  ]);
  const cwd = readArgumentPreview(args, [
    "cwd",
    "working_directory",
    "workingDirectory",
  ]);
  const path = readArgumentPreview(args, [
    "path",
    "file",
    "file_path",
    "filePath",
    "target_path",
    "targetPath",
    "source_path",
    "sourcePath",
  ]);
  const url = readArgumentPreview(args, ["url", "uri", "href", "endpoint"]);

  const scopeKind = path ? "path" : url ? "url" : cwd ? "cwd" : "tool";
  const scopeValue = path || url || cwd || toolName || "";

  if (looksDestructiveCommand(command)) {
    return {
      risk: "high",
      riskReason: "destructiveCommand",
      scopeKind,
      scopeValue,
    };
  }

  if (isShellLikeTool(toolName)) {
    return {
      risk: "medium",
      riskReason: "command",
      scopeKind,
      scopeValue,
    };
  }

  if (isFileLikeTool(toolName)) {
    return {
      risk: "medium",
      riskReason: "file",
      scopeKind,
      scopeValue,
    };
  }

  if (isNetworkLikeTool(toolName)) {
    return {
      risk: "low",
      riskReason: "network",
      scopeKind,
      scopeValue,
    };
  }

  return {
    risk: "low",
    riskReason: "default",
    scopeKind,
    scopeValue,
  };
}

/** 从 requested_schema 中提取 answer.enum 选项 */
function extractElicitationOptions(
  requestedSchema?: Record<string, unknown>,
): string[] {
  if (!requestedSchema) return [];
  const properties = requestedSchema.properties as
    | Record<string, unknown>
    | undefined;
  const answer = properties?.answer as Record<string, unknown> | undefined;
  const enumValues = answer?.enum;
  if (!Array.isArray(enumValues)) return [];
  return enumValues.filter((item): item is string => typeof item === "string");
}

/** 从 requested_schema 中提取 answer.description */
function extractElicitationDescription(
  requestedSchema?: Record<string, unknown>,
): string | undefined {
  if (!requestedSchema) return undefined;
  const properties = requestedSchema.properties as
    | Record<string, unknown>
    | undefined;
  const answer = properties?.answer as Record<string, unknown> | undefined;
  const description = answer?.description;
  return typeof description === "string" ? description : undefined;
}

/** 从问题文本中提取选项（用于 ask_user 缺少 options 的兜底场景） */
function extractAskUserOptionsFromText(text?: string): QuestionOption[] {
  if (!text) return [];

  const normalizedText = text.trim();
  if (!normalizedText) return [];

  const maxOptions = 8;
  const maxLabelLength = 120;
  const seen = new Set<string>();
  const options: QuestionOption[] = [];

  const splitFragments = (raw: string): string[] =>
    raw
      .split(/[、,，;/|]/)
      .map((fragment) => fragment.trim())
      .filter(Boolean);

  const pushOption = (raw: string) => {
    if (options.length >= maxOptions) return;
    const label = raw
      .replace(/\s+/g, " ")
      .replace(/^[\s"'“”‘’`]+/, "")
      .replace(/[\s"'“”‘’`]+$/, "")
      .trim();
    if (!label || label.length > maxLabelLength) return;

    const key = label.toLowerCase();
    if (seen.has(key)) return;

    // 过滤明显不是选项的内容
    if (/^(option|options|choices?|可选项?)[:：]?$/i.test(label)) return;
    if (/^[,，、;；/|]+$/.test(label)) return;

    seen.add(key);
    options.push({ label });
  };

  const quotedPatterns = [
    /"([^"\n]{1,160})"/g,
    /“([^”\n]{1,160})”/g,
    /'([^'\n]{1,160})'/g,
    /‘([^’\n]{1,160})’/g,
    /`([^`\n]{1,160})`/g,
  ];

  for (const pattern of quotedPatterns) {
    for (const match of normalizedText.matchAll(pattern)) {
      pushOption(match[1] ?? "");
      if (options.length >= maxOptions) break;
    }
    if (options.length >= maxOptions) break;
  }

  if (options.length > 0) return options;

  const parenthesizedPattern = /[（(]([^()（）\n]{2,180})[）)]/g;
  for (const match of normalizedText.matchAll(parenthesizedPattern)) {
    const fragments = splitFragments(match[1] ?? "");
    if (fragments.length < 2) continue;
    for (const fragment of fragments) {
      pushOption(fragment);
    }
    if (options.length >= maxOptions) break;
  }

  if (options.length > 0) return options;

  const lineCandidates = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const indexedOrBulletedLines = lineCandidates
    .map((line) =>
      line.match(
        /^(?:[-*•●]\s+|(?:\d+|[A-Za-z]|[一二三四五六七八九十]+)[.()\])]\s+)(.+)$/,
      ),
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  if (indexedOrBulletedLines.length >= 2) {
    for (const line of indexedOrBulletedLines) {
      const colonIndex = line.search(/[:：]/);
      const maybeOptionLine =
        colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : line;
      const fragments = splitFragments(maybeOptionLine);
      if (fragments.length >= 2) {
        for (const fragment of fragments) {
          pushOption(fragment);
        }
      } else {
        pushOption(line);
      }
      if (options.length >= maxOptions) break;
    }
  }

  if (options.length > 0) return options;

  const optionLinePattern =
    /(options?|choices?|可选项?|选项)\s*[:：]\s*([^\n]+)/i;
  const lineMatch = normalizedText.match(optionLinePattern);
  if (lineMatch?.[2]) {
    const fragments = splitFragments(lineMatch[2]);
    for (const fragment of fragments) {
      pushOption(fragment);
    }
  }

  return options;
}

/** 运行时归一化 options，兼容字符串数组和对象数组 */
function normalizeQuestionOptions(rawOptions: unknown): QuestionOption[] {
  if (!Array.isArray(rawOptions)) return [];

  const normalized: QuestionOption[] = [];
  const seen = new Set<string>();

  const push = (option: QuestionOption) => {
    const label = option.label.trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({ label, description: option.description });
  };

  for (const option of rawOptions) {
    if (typeof option === "string") {
      push({ label: option });
      continue;
    }

    if (!option || typeof option !== "object") continue;
    const candidate = option as Record<string, unknown>;
    const label =
      (typeof candidate.label === "string" && candidate.label) ||
      (typeof candidate.value === "string" && candidate.value) ||
      (typeof candidate.text === "string" && candidate.text) ||
      "";
    if (!label) continue;

    const description =
      typeof candidate.description === "string"
        ? candidate.description
        : undefined;
    push({ label, description });
  }

  return normalized;
}

function summarizeSubmittedValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => summarizeSubmittedValue(item))
      .filter((item): item is string => Boolean(item));
    return normalized.length > 0 ? normalized.join("、") : undefined;
  }

  return undefined;
}

function readSubmittedRecord(
  request: ActionRequired,
): Record<string, unknown> | undefined {
  const userData = request.submittedUserData;
  if (userData && typeof userData === "object" && !Array.isArray(userData)) {
    return userData as Record<string, unknown>;
  }

  if (typeof request.submittedResponse === "string") {
    try {
      const parsed = JSON.parse(request.submittedResponse);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function resolveSubmittedAnswerText(
  request: ActionRequired,
): string | undefined {
  const userData = request.submittedUserData;
  if (typeof userData === "string") {
    const value = userData.trim();
    if (value) return value;
    return undefined;
  }

  if (userData && typeof userData === "object") {
    const record = userData as Record<string, unknown>;
    const directAnswer = summarizeSubmittedValue(record.answer);
    if (directAnswer) {
      return directAnswer;
    }
    if (request.questions && request.questions.length > 0) {
      const firstQuestion = request.questions[0]?.question;
      if (
        typeof firstQuestion === "string" &&
        summarizeSubmittedValue(record[firstQuestion])
      ) {
        return summarizeSubmittedValue(record[firstQuestion]);
      }
    }
    try {
      return JSON.stringify(record);
    } catch {
      return undefined;
    }
  }

  if (typeof request.submittedResponse === "string") {
    const value = request.submittedResponse.trim();
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string" && parsed.trim()) {
        return parsed.trim();
      }
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const directAnswer = summarizeSubmittedValue(record.answer);
        if (directAnswer) {
          return directAnswer;
        }
      }
    } catch {
      // 非 JSON，继续使用原始文本
    }
    return value;
  }

  return undefined;
}

function readSubmittedDecision(request: ActionRequired): string | undefined {
  const record = readSubmittedRecord(request);
  const decision = summarizeSubmittedValue(record?.decision);
  if (decision) {
    return decision;
  }
  return resolveSubmittedAnswerText(request);
}

function isDeniedSubmittedAnswer(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("拒绝") ||
    normalized.includes("deny") ||
    normalized.includes("denied") ||
    normalized.includes("reject") ||
    normalized.includes("rejected") ||
    normalized.includes("decline") ||
    normalized.includes("declined")
  );
}

function resolveSubmittedPermissionDecisionLabel(
  decision: string | undefined,
  labels: {
    allowed: string;
    denied: string;
    handled: string;
  },
): string {
  if (!decision?.trim()) {
    return labels.handled;
  }
  if (isDeniedSubmittedAnswer(decision)) {
    return labels.denied;
  }
  return labels.allowed;
}

export function DecisionPanel({ request, onSubmit }: DecisionPanelProps) {
  const { t } = useTranslation("agent");
  const requestAnchorProps = {
    "data-request-id": request.requestId,
    id: `agent-request-${request.requestId}`,
  };
  // 解析问题数据（用于 ask_user 类型）
  const questions = request.questions || [];
  const questionOptions = questions.map((question) => {
    const normalized = normalizeQuestionOptions(question.options);
    if (normalized.length > 0) {
      return normalized;
    }

    const fallbackText = [question.question, question.header, request.prompt]
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
      .join("\n");
    return extractAskUserOptionsFromText(fallbackText);
  });
  const elicitationOptions = extractElicitationOptions(request.requestedSchema);
  const elicitationDescription = extractElicitationDescription(
    request.requestedSchema,
  );
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, string[]>
  >({});
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({});
  const [elicitationAnswer, setElicitationAnswer] = useState("");
  const [elicitationOther, setElicitationOther] = useState("");
  const [submissionState, setSubmissionState] =
    useState<DecisionPanelSubmissionState | null>(null);
  const isSubmitted = request.status === "submitted";
  const isQueued = request.status === "queued";
  const isSubmitting = submissionState !== null;
  const submittedAnswer = resolveSubmittedAnswerText(request);
  const submittedDecision = readSubmittedDecision(request);
  const isToolConfirmation = request.actionType === "tool_confirmation";
  const isRuntimeActionConfirmation = isRuntimeActionConfirmationRequestId(
    request.requestId,
  );
  const permissionDecisionLabels = {
    allowed: String(t("agentChat.decisionPanel.permission.result.allowed")),
    denied: String(t("agentChat.decisionPanel.permission.result.denied")),
    handled: String(t("generalWorkbench.taskRail.approval.status.resolved")),
  };
  const toolConfirmationArgumentRows = resolveToolConfirmationArgumentRows(
    request.arguments,
    {
      command: t("agentChat.decisionPanel.permission.argument.command"),
      cwd: t("agentChat.decisionPanel.permission.argument.cwd"),
      path: t("agentChat.decisionPanel.permission.argument.path"),
      url: t("agentChat.decisionPanel.permission.argument.url"),
      mode: t("agentChat.decisionPanel.permission.argument.mode"),
      input: t("agentChat.decisionPanel.permission.argument.input"),
    },
  );
  const toolConfirmationImpactSummary = resolveToolConfirmationImpactSummary(
    request.toolName,
    request.arguments,
  );
  const isFallbackAskPending =
    request.actionType === "ask_user" && request.isFallback;
  const usesQuestionnaireUi =
    questions.length > 0 &&
    (request.actionType === "ask_user" || request.actionType === "elicitation");

  // 重置状态当请求变化时
  useEffect(() => {
    setSelectedOptions({});
    setOtherInputs({});
    setElicitationAnswer("");
    setElicitationOther("");
    setSubmissionState(null);
  }, [request.requestId]);

  const submitResponse = (
    response: ConfirmResponse,
    nextSubmissionState: DecisionPanelSubmissionState,
  ) => {
    if (isSubmitting) {
      return;
    }
    setSubmissionState(nextSubmissionState);
    try {
      const result = onSubmit(response);
      if (isPromiseLike(result)) {
        void result.finally(() => {
          setSubmissionState((current) =>
            current?.key === nextSubmissionState.key ? null : current,
          );
        });
        return;
      }
      setSubmissionState((current) =>
        current?.key === nextSubmissionState.key ? null : current,
      );
    } catch (error) {
      setSubmissionState((current) =>
        current?.key === nextSubmissionState.key ? null : current,
      );
      throw error;
    }
  };

  // 切换选项
  const toggleOption = (
    qIndex: number,
    optionLabel: string,
    multiSelect?: boolean,
  ) => {
    setSelectedOptions((prev) => {
      const current = prev[qIndex] ?? [];
      if (multiSelect) {
        const next = current.includes(optionLabel)
          ? current.filter((label) => label !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [qIndex]: next };
      }
      return { ...prev, [qIndex]: [optionLabel] };
    });
  };

  // 构建答案
  const buildAnswers = () => {
    const answers: Record<string, string | string[]> = {};
    questions.forEach((q, qIndex) => {
      const selected = selectedOptions[qIndex] ?? [];
      const otherText = otherInputs[qIndex]?.trim() ?? "";
      if (q.multiSelect) {
        const combined = [...selected];
        if (otherText) combined.push(otherText);
        if (combined.length > 0) {
          answers[q.question] = combined;
        }
        return;
      }

      const value = otherText || selected[0] || "";
      if (value) {
        answers[q.question] = value;
      }
    });
    return answers;
  };

  // 检查是否���以提交
  const canSubmit = usesQuestionnaireUi
    ? questions.every((_, qIndex) => {
        const selected = selectedOptions[qIndex] ?? [];
        const otherText = otherInputs[qIndex]?.trim() ?? "";
        return selected.length > 0 || otherText.length > 0;
      })
    : request.actionType === "elicitation"
      ? elicitationAnswer.trim().length > 0 ||
        elicitationOther.trim().length > 0
      : questions.length === 0;

  // 处理允许
  const handleAllow = () => {
    if (usesQuestionnaireUi) {
      const answers = buildAnswers();
      const firstAnswer = Object.values(answers)[0];
      const normalizedAnswers =
        questions.length === 1 && firstAnswer !== undefined
          ? { answer: firstAnswer }
          : answers;
      const response =
        questions.length > 0 ? JSON.stringify(normalizedAnswers) : undefined;
      void submitResponse(
        {
          requestId: request.requestId,
          confirmed: true,
          response,
          actionType: request.actionType,
          userData: questions.length > 0 ? normalizedAnswers : undefined,
        },
        { key: "allow", kind: "allow" },
      );
      return;
    }

    if (request.actionType === "elicitation") {
      const answer = elicitationAnswer.trim();
      const other = elicitationOther.trim();
      const userData: Record<string, string> = {};

      if (answer) {
        userData.answer = answer;
      }
      if (other) {
        userData.other = other;
        if (!userData.answer) {
          userData.answer = other;
        }
      }

      void submitResponse(
        {
          requestId: request.requestId,
          confirmed: true,
          response: JSON.stringify(userData),
          actionType: request.actionType,
          userData,
        },
        { key: "allow", kind: "allow" },
      );
      return;
    }

    void submitResponse(
      {
        requestId: request.requestId,
        confirmed: true,
        response: "允许",
        actionType: request.actionType,
      },
      { key: "allow", kind: "allow" },
    );
  };

  const handleDeny = () => {
    void submitResponse(
      {
        requestId: request.requestId,
        confirmed: false,
        response: "用户拒绝了请求",
        actionType: request.actionType,
        userData: "" as const,
      },
      { key: "deny", kind: "deny" },
    );
  };

  if (isSubmitted || isQueued) {
    const submittedTitle = isQueued
      ? t("agentChat.decisionPanel.queuedTitle")
      : isRuntimeActionConfirmation
        ? t("agentChat.decisionPanel.runtimePermission.submittedTitle")
        : request.actionType === "tool_confirmation"
            ? t("agentChat.decisionPanel.permissionHandledTitle")
            : t("agentChat.decisionPanel.submittedTitle");
    const submittedClassName = isQueued
      ? "border-sky-200 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20"
      : request.actionType === "tool_confirmation"
          ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
          : request.actionType === "elicitation"
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
            : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20";

    return (
      <Card className={submittedClassName} {...requestAnchorProps}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            {submittedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {request.prompt && !isToolConfirmation && (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {request.prompt}
            </p>
          )}

          {request.questions &&
            request.questions.length > 0 &&
            !isToolConfirmation && (
              <div className="space-y-1">
                {request.questions.map((question, index) => (
                  <p key={index} className="text-sm text-foreground">
                    {question.question}
                  </p>
                ))}
              </div>
            )}

          {isToolConfirmation ? (
            <div className="space-y-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {t("agentChat.decisionPanel.permission.resultLabel")}
                </span>
                <span className="font-medium text-foreground">
                  {resolveSubmittedPermissionDecisionLabel(
                    submittedDecision,
                    permissionDecisionLabels,
                  )}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t("agentChat.decisionPanel.permission.scope.label")}
                  </div>
                  <div className="mt-1 text-xs text-foreground">
                    <span className="font-medium">
                      {t(
                        `agentChat.decisionPanel.permission.scope.${toolConfirmationImpactSummary.scopeKind}`,
                      )}
                    </span>
                    <span className="ml-1 break-words font-mono">
                      {toolConfirmationImpactSummary.scopeValue ||
                        t("agentChat.decisionPanel.permission.scope.unknown")}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t(
                      "agentChat.decisionPanel.permission.authorization.label",
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-foreground">
                    {toolConfirmationImpactSummary.authorizationText ??
                      t(
                        "agentChat.decisionPanel.permission.authorization.oneTime",
                      )}
                  </p>
                </div>
              </div>
            </div>
          ) : submittedAnswer ? (
            <div className="rounded-md border bg-background/80 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t("agentChat.decisionPanel.submittedAnswerLabel")}
              </span>
              <span className="ml-2 font-medium text-foreground">
                {submittedAnswer}
              </span>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {isQueued
              ? t("agentChat.decisionPanel.queuedDescription")
              : isRuntimeActionConfirmation
                ? isDeniedSubmittedAnswer(submittedDecision)
                  ? t(
                      "agentChat.decisionPanel.runtimePermission.deniedDescription",
                    )
                  : t(
                      "agentChat.decisionPanel.runtimePermission.submittedDescription",
                    )
                : t("agentChat.decisionPanel.submittedDescription")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // 渲染 elicitation 面板
  if (request.actionType === "elicitation" && !usesQuestionnaireUi) {
    return (
      <Card
        className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
        {...requestAnchorProps}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <HelpCircle className="h-4 w-4" />
            {t("agentChat.decisionPanel.infoRequiredTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground">
            {request.prompt || t("agentChat.decisionPanel.defaultInfoPrompt")}
          </p>

          {elicitationDescription && (
            <p className="text-xs text-muted-foreground">
              {elicitationDescription}
            </p>
          )}

          {elicitationOptions.length > 0 && (
            <div className="grid gap-2">
              {elicitationOptions.map((option) => {
                const isSelected = elicitationAnswer === option;
                return (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      isSelected
                        ? "border-emerald-300 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900/30"
                        : "border-border bg-background hover:border-emerald-300 hover:bg-muted",
                      isSubmitting && "cursor-not-allowed opacity-70",
                    )}
                    disabled={isSubmitting}
                    onClick={() => setElicitationAnswer(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("agentChat.decisionPanel.answerLabel")}
            </label>
            <Input
              placeholder={t("agentChat.decisionPanel.answerPlaceholder")}
              value={elicitationAnswer}
              disabled={isSubmitting}
              onChange={(e) => setElicitationAnswer(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("agentChat.decisionPanel.supplementLabel")}
            </label>
            <Input
              placeholder={t("agentChat.decisionPanel.supplementPlaceholder")}
              value={elicitationOther}
              disabled={isSubmitting}
              onChange={(e) => setElicitationOther(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleAllow}
              disabled={!canSubmit || isSubmitting}
              className="border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] text-white shadow-sm shadow-emerald-950/15 hover:opacity-95"
            >
              {submissionState?.key === "allow" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-4 w-4" />
              )}
              {submissionState?.key === "allow"
                ? t("agentChat.decisionPanel.action.submitting")
                : t("agentChat.decisionPanel.action.submit")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeny}
              disabled={isSubmitting}
            >
              {submissionState?.key === "deny" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-1 h-4 w-4" />
              )}
              {submissionState?.key === "deny"
                ? t("agentChat.decisionPanel.action.cancelling")
                : t("agentChat.decisionPanel.action.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 渲染结构化问题面板（ask_user 或带问题元数据的 elicitation）
  if (
    usesQuestionnaireUi &&
    request.questions &&
    request.questions.length > 0
  ) {
    const questions = request.questions;
    const isQuestionElicitation = request.actionType === "elicitation";
    const title = isRuntimeActionConfirmation
      ? t("agentChat.decisionPanel.runtimePermission.title")
      : isQuestionElicitation
        ? t("agentChat.decisionPanel.infoRequiredTitle")
        : t("agentChat.decisionPanel.assistantQuestionTitle");
    const cardClassName = isQuestionElicitation
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
      : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20";
    const titleClassName = isQuestionElicitation
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-emerald-700 dark:text-emerald-300";
    const primaryButtonClassName =
      "border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] text-white shadow-sm shadow-emerald-950/15 hover:opacity-95";
    const selectedOptionClassName = isQuestionElicitation
      ? "border-emerald-300 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900/30"
      : "border-emerald-300 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900/30";
    const unselectedOptionClassName = isQuestionElicitation
      ? "border-border bg-background hover:border-emerald-300 hover:bg-muted"
      : "border-border bg-background hover:border-emerald-300 hover:bg-muted";

    return (
      <Card className={cardClassName} {...requestAnchorProps}>
        <CardHeader className="pb-2">
          <CardTitle
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              titleClassName,
            )}
          >
            <HelpCircle className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRuntimeActionConfirmation ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("agentChat.decisionPanel.runtimePermission.description")}
            </p>
          ) : null}
          {isQuestionElicitation && request.prompt && (
            <p className="text-sm text-foreground">{request.prompt}</p>
          )}
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="space-y-3">
              <p className="text-sm text-foreground">{q.question}</p>

              {q.header && (
                <Badge variant="secondary" className="text-xs">
                  {q.header}
                </Badge>
              )}

              {/* 选项列表 */}
              {questionOptions[qIndex] &&
                questionOptions[qIndex].length > 0 && (
                  <div className="grid gap-2">
                    {questionOptions[qIndex].map((option, optIndex) => {
                      const isSelected = (
                        selectedOptions[qIndex] ?? []
                      ).includes(option.label);

                      return (
                        <button
                          key={optIndex}
                          type="button"
                          className={cn(
                            "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                            isSelected
                              ? selectedOptionClassName
                              : unselectedOptionClassName,
                            isSubmitting && "cursor-not-allowed opacity-70",
                          )}
                          disabled={isSubmitting}
                          onClick={() =>
                            toggleOption(qIndex, option.label, q.multiSelect)
                          }
                        >
                          <div className="flex items-center gap-2 font-medium">
                            <span>{option.label}</span>
                          </div>
                          {option.description && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {option.description}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

              {/* 其他输入 */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("agentChat.decisionPanel.otherLabel")}
                </label>
                <Input
                  placeholder={t("agentChat.decisionPanel.otherPlaceholder")}
                  value={otherInputs[qIndex] ?? ""}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setOtherInputs((prev) => ({
                      ...prev,
                      [qIndex]: e.target.value,
                    }))
                  }
                />
              </div>

              {q.multiSelect && (
                <p className="text-xs text-muted-foreground">
                  {t("agentChat.decisionPanel.multiSelectHint")}
                </p>
              )}
            </div>
          ))}

          {isFallbackAskPending && (
            <p className="text-xs text-muted-foreground">
              {t("agentChat.decisionPanel.fallbackQueuedDescription")}
            </p>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleAllow}
              disabled={!canSubmit || isSubmitting}
              className={primaryButtonClassName}
            >
              {submissionState?.key === "allow" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-4 w-4" />
              )}
              {submissionState?.key === "allow"
                ? isFallbackAskPending
                  ? t("agentChat.decisionPanel.action.recording")
                  : t("agentChat.decisionPanel.action.submitting")
                : isFallbackAskPending
                  ? t("agentChat.decisionPanel.action.recordAnswer")
                  : t("agentChat.decisionPanel.action.submitAnswer")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeny}
              disabled={isSubmitting}
            >
              {submissionState?.key === "deny" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-1 h-4 w-4" />
              )}
              {submissionState?.key === "deny"
                ? t("agentChat.decisionPanel.action.cancelling")
                : t("agentChat.decisionPanel.action.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // pending tool_confirmation 的提交入口只允许在输入区 approval prompt。
  return (
    <Card
      className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
      {...requestAnchorProps}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {t("agentChat.decisionPanel.permissionRequestTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="space-y-3 rounded-[12px] border border-amber-200 bg-white px-3 py-3 dark:border-amber-800 dark:bg-background/80"
          data-testid="decision-panel-tool-confirmation-summary"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                {t("agentChat.decisionPanel.permission.pendingAction")}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground">
                {request.prompt ||
                  t("agentChat.decisionPanel.permission.defaultActionPrompt")}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              {t("agentChat.decisionPanel.permission.statusPending")}
            </Badge>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/20">
            <span className="text-amber-700 dark:text-amber-300">
              {getToolIcon(request.toolName)}
            </span>
            <span className="text-muted-foreground">
              {t("agentChat.decisionPanel.assistantWantsUse")}
            </span>
            <span className="min-w-0 break-all font-medium text-foreground">
              {request.toolName || t("agentChat.decisionPanel.unknownTool")}
            </span>
          </div>

          <div
            className="grid gap-2 sm:grid-cols-3"
            data-testid="decision-panel-tool-confirmation-impact"
          >
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("agentChat.decisionPanel.permission.risk.label")}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    toolConfirmationImpactSummary.risk === "high"
                      ? "destructive"
                      : "outline"
                  }
                  className={cn(
                    "text-xs",
                    toolConfirmationImpactSummary.risk === "medium" &&
                      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200",
                    toolConfirmationImpactSummary.risk === "low" &&
                      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-200",
                  )}
                >
                  {t(
                    `agentChat.decisionPanel.permission.risk.${toolConfirmationImpactSummary.risk}`,
                  )}
                </Badge>
                <span className="text-xs text-foreground">
                  {toolConfirmationImpactSummary.riskReasonText ??
                    t(
                      `agentChat.decisionPanel.permission.riskReason.${toolConfirmationImpactSummary.riskReason}`,
                    )}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("agentChat.decisionPanel.permission.scope.label")}
              </div>
              <div className="mt-1 text-xs text-foreground">
                <span className="font-medium">
                  {t(
                    `agentChat.decisionPanel.permission.scope.${toolConfirmationImpactSummary.scopeKind}`,
                  )}
                </span>
                <span className="ml-1 break-words font-mono">
                  {toolConfirmationImpactSummary.scopeValue ||
                    t("agentChat.decisionPanel.permission.scope.unknown")}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("agentChat.decisionPanel.permission.authorization.label")}
              </div>
              <p className="mt-1 text-xs leading-5 text-foreground">
                {toolConfirmationImpactSummary.authorizationText ??
                  t("agentChat.decisionPanel.permission.authorization.oneTime")}
              </p>
            </div>
          </div>

          {toolConfirmationArgumentRows.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {t("agentChat.decisionPanel.permission.parameterSummary")}
              </div>
              <div className="grid gap-2">
                {toolConfirmationArgumentRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs sm:grid-cols-[96px_minmax(0,1fr)]"
                    data-testid="decision-panel-tool-confirmation-argument"
                  >
                    <span className="font-medium text-muted-foreground">
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 break-words text-foreground",
                        row.mono && "font-mono",
                      )}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs leading-5 text-muted-foreground">
            {t("agentChat.decisionPanel.permission.reviewHint")}
          </p>
        </div>

        {/* 参数预览 */}
        {request.arguments && (
          <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              {t("agentChat.decisionPanel.permission.rawArguments")}
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
              {formatArguments(request.arguments)}
            </pre>
          </details>
        )}

        <div
          className="rounded-lg border border-amber-100 bg-amber-100/60 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
          data-testid="decision-panel-tool-confirmation-readonly"
        >
          {t("agentChat.decisionPanel.permission.inputbarOnlyHint")}
        </div>
      </CardContent>
    </Card>
  );
}

/** 权限确认列表组件 */
export function DecisionPanelList({
  requests,
  onSubmit,
}: {
  requests: ActionRequired[];
  onSubmit: (response: ConfirmResponse) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <DecisionPanel
          key={request.requestId}
          request={request}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}
