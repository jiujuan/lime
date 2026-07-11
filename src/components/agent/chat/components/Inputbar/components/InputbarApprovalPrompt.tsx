import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  ShieldCheck,
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
  const prompt =
    request.prompt?.trim() ||
    request.detail?.trim() ||
    translate("agentChat.inputbar.approval.defaultPrompt");
  const isSubmitting = submissionKind !== null;
  const canSubmit = Boolean(onSubmit) && !isSubmitting;
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
      className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 shadow-sm shadow-slate-950/5"
      data-testid="inputbar-approval-prompt"
      data-request-id={request.requestId}
      aria-label={translate("agentChat.inputbar.approval.title")}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <p
        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
        data-testid="inputbar-approval-summary"
        title={prompt}
      >
        {prompt}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {decisionActions.map((action) => {
          const Icon = action.Icon;
          const submitting = submissionKind === action.decision;
          const label = submitting
            ? translate("agentChat.inputbar.approval.action.submitting")
            : translate(action.labelKey);
          return (
            <button
              key={action.decision}
              type="button"
              disabled={!canSubmit}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-md text-xs font-medium transition sm:w-auto sm:px-2.5 disabled:cursor-not-allowed disabled:opacity-60",
                action.variant === "primary" &&
                  "bg-slate-950 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800",
                action.variant === "secondary" &&
                  "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                action.variant === "danger" &&
                  "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
              )}
              aria-label={label}
              title={label}
              data-decision={action.decision}
              onClick={() => submit(action)}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
