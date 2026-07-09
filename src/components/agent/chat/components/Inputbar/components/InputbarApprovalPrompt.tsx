import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileEdit,
  Globe,
  Loader2,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { AgentI18nKey } from "@/i18n/agentResources";
import { cn } from "@/lib/utils";
import type {
  ActionRequired,
  ApprovalDecision,
  ConfirmResponse,
} from "../../../types";

interface InputbarApprovalPromptProps {
  request: ActionRequired;
  onSubmit?: (response: ConfirmResponse) => void | Promise<void>;
}

interface ApprovalArgumentRow {
  id: string;
  labelKey: string;
  value: string;
  mono?: boolean;
}

type ApprovalRisk = "low" | "medium" | "high";

interface ApprovalDecisionAction {
  decision: ApprovalDecision;
  labelKey: AgentI18nKey;
  responseKey: AgentI18nKey;
  variant: "primary" | "secondary" | "danger";
  Icon: LucideIcon;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

function stringifyPreview(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const values = value
      .map((item) => stringifyPreview(item))
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : undefined;
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

function clipPreview(value: string): string {
  return value.length > 140 ? `${value.slice(0, 140).trim()}...` : value;
}

function readArgument(
  args: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!args) {
    return undefined;
  }
  for (const key of keys) {
    const value = stringifyPreview(args[key]);
    if (value) {
      return clipPreview(value);
    }
  }
  return undefined;
}

function looksDestructive(command?: string): boolean {
  return Boolean(
    command &&
    /\b(rm\s+-rf|sudo|chmod\s+777|chown|git\s+reset|git\s+clean|del\s+\/f|rmdir\s+\/s|curl\b[\s\S]*\|\s*(?:sh|bash))\b/i.test(
      command,
    ),
  );
}

function resolveApprovalRisk(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined,
): ApprovalRisk {
  const riskValue = readArgument(args, ["risk_level", "riskLevel", "risk"]);
  const normalizedRisk = riskValue?.trim().toLowerCase();
  if (
    normalizedRisk === "high" ||
    normalizedRisk === "critical" ||
    normalizedRisk === "destructive"
  ) {
    return "high";
  }
  if (normalizedRisk === "medium" || normalizedRisk === "moderate") {
    return "medium";
  }
  if (normalizedRisk === "low" || normalizedRisk === "safe") {
    return "low";
  }

  const command = readArgument(args, ["command", "cmd", "script", "code"]);
  if (looksDestructive(command)) {
    return "high";
  }

  const normalizedTool = toolName?.trim().toLowerCase() ?? "";
  if (
    normalizedTool.includes("bash") ||
    normalizedTool.includes("shell") ||
    normalizedTool.includes("terminal") ||
    normalizedTool.includes("exec") ||
    normalizedTool.includes("write") ||
    normalizedTool.includes("edit") ||
    normalizedTool.includes("file")
  ) {
    return "medium";
  }
  return "low";
}

function resolveToolIcon(toolName?: string) {
  const normalized = toolName?.trim().toLowerCase() ?? "";
  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("terminal") ||
    normalized.includes("exec")
  ) {
    return Terminal;
  }
  if (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("file")
  ) {
    return FileEdit;
  }
  if (
    normalized.includes("web") ||
    normalized.includes("fetch") ||
    normalized.includes("http") ||
    normalized.includes("browser")
  ) {
    return Globe;
  }
  return ShieldCheck;
}

function resolveArgumentRows(
  args: Record<string, unknown> | undefined,
): ApprovalArgumentRow[] {
  const rows: ApprovalArgumentRow[] = [];
  const push = (id: string, labelKey: string, keys: string[], mono = true) => {
    const value = readArgument(args, keys);
    if (value) {
      rows.push({ id, labelKey, value, mono });
    }
  };

  push("command", "command", ["command", "cmd", "script", "code"]);
  push("cwd", "cwd", ["cwd", "working_directory", "workingDirectory"]);
  push("path", "path", [
    "path",
    "file",
    "file_path",
    "filePath",
    "target_path",
    "targetPath",
  ]);
  push("url", "url", ["url", "uri", "href", "endpoint"]);
  push("mode", "mode", ["mode", "action", "operation"], false);

  return rows.slice(0, 3);
}

function formatArguments(args: Record<string, unknown> | undefined): string {
  if (!args) {
    return "";
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function resolveAvailableDecisions(
  request: ActionRequired,
): ApprovalDecision[] {
  const declared = request.availableDecisions?.filter(
    (decision): decision is ApprovalDecision =>
      decision === "allow_once" ||
      decision === "allow_for_session" ||
      decision === "decline" ||
      decision === "cancel",
  );
  if (declared?.length) {
    return Array.from(new Set(declared));
  }
  return ["decline", "allow_once"];
}

function decisionActionFor(decision: ApprovalDecision): ApprovalDecisionAction {
  switch (decision) {
    case "allow_for_session":
      return {
        decision,
        labelKey: "agentChat.inputbar.approval.action.allowForSession",
        responseKey: "agentChat.inputbar.approval.response.allowForSession",
        variant: "primary",
        Icon: ShieldCheck,
      };
    case "allow_once":
      return {
        decision,
        labelKey: "agentChat.inputbar.approval.action.allowOnce",
        responseKey: "agentChat.inputbar.approval.response.allowOnce",
        variant: "primary",
        Icon: CheckCircle2,
      };
    case "cancel":
      return {
        decision,
        labelKey: "agentChat.inputbar.approval.action.cancel",
        responseKey: "agentChat.inputbar.approval.response.cancel",
        variant: "danger",
        Icon: Ban,
      };
    case "decline":
    default:
      return {
        decision: "decline",
        labelKey: "agentChat.inputbar.approval.action.decline",
        responseKey: "agentChat.inputbar.approval.response.decline",
        variant: "secondary",
        Icon: Ban,
      };
  }
}

export function InputbarApprovalPrompt({
  request,
  onSubmit,
}: InputbarApprovalPromptProps) {
  const { t } = useTranslation("agent");
  const translate = (
    key: AgentI18nKey,
    values?: Record<string, number | string>,
  ): string => String(t(key, values ?? {}));
  const [submissionKind, setSubmissionKind] = useState<ApprovalDecision | null>(
    null,
  );
  const toolName =
    request.toolName?.trim() ||
    translate("agentChat.inputbar.approval.unknownTool");
  const prompt =
    request.prompt?.trim() ||
    request.detail?.trim() ||
    translate("agentChat.inputbar.approval.defaultPrompt");
  const risk = resolveApprovalRisk(request.toolName, request.arguments);
  const argumentRows = useMemo(
    () => resolveArgumentRows(request.arguments),
    [request.arguments],
  );
  const ToolIcon = resolveToolIcon(request.toolName);
  const isSubmitting = submissionKind !== null;
  const canSubmit = Boolean(onSubmit) && !isSubmitting;
  const rawArguments = formatArguments(request.arguments);
  const decisionActions = useMemo(
    () => resolveAvailableDecisions(request).map(decisionActionFor),
    [request],
  );

  const submit = (action: ApprovalDecisionAction) => {
    if (!onSubmit || isSubmitting) {
      return;
    }
    setSubmissionKind(action.decision);
    const response = translate(action.responseKey);
    try {
      const result = onSubmit({
        requestId: request.requestId,
        decision: action.decision,
        response,
        actionType: "tool_confirmation",
      });
      if (isPromiseLike(result)) {
        void result.finally(() => {
          setSubmissionKind((current) =>
            current === action.decision ? null : current,
          );
        });
        return;
      }
      setSubmissionKind((current) =>
        current === action.decision ? null : current,
      );
    } catch (error) {
      setSubmissionKind((current) =>
        current === action.decision ? null : current,
      );
      throw error;
    }
  };

  return (
    <section
      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-950/5"
      data-testid="inputbar-approval-prompt"
      data-request-id={request.requestId}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold leading-5 text-slate-950">
              {translate("agentChat.inputbar.approval.title")}
            </span>
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold",
                risk === "high" && "border-rose-200 bg-rose-50 text-rose-700",
                risk === "medium" &&
                  "border-amber-200 bg-amber-50 text-amber-800",
                risk === "low" &&
                  "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
            >
              {translate(
                `agentChat.inputbar.approval.risk.${risk}` as AgentI18nKey,
              )}
            </span>
          </div>
          <p className="mt-1 max-h-10 overflow-hidden text-sm leading-5 text-slate-700">
            {prompt}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
              <ToolIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="shrink-0 font-medium">
                {translate("agentChat.inputbar.approval.tool")}
              </span>
              <span className="min-w-0 truncate font-mono text-slate-900">
                {toolName}
              </span>
            </span>
            {argumentRows.map((row) => (
              <span
                key={row.id}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1"
              >
                <span className="shrink-0 font-medium">
                  {translate(
                    `agentChat.inputbar.approval.argument.${row.labelKey}` as AgentI18nKey,
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-slate-900",
                    row.mono && "font-mono",
                  )}
                >
                  {row.value}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
        {rawArguments ? (
          <details className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">
              {translate("agentChat.inputbar.approval.details")}
            </summary>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
              {rawArguments}
            </pre>
          </details>
        ) : (
          <span className="min-w-[120px] flex-1 text-xs leading-5 text-slate-500">
            {translate("agentChat.inputbar.approval.noDetails")}
          </span>
        )}
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {decisionActions.map((action) => {
            const Icon = action.Icon;
            const submitting = submissionKind === action.decision;
            return (
              <button
                key={action.decision}
                type="button"
                disabled={!canSubmit}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                  action.variant === "primary" &&
                    "bg-slate-950 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800",
                  action.variant === "secondary" &&
                    "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                  action.variant === "danger" &&
                    "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                )}
                aria-label={translate(action.labelKey)}
                data-decision={action.decision}
                onClick={() => submit(action)}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                )}
                {submitting
                  ? translate("agentChat.inputbar.approval.action.submitting")
                  : translate(action.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
