import {
  CheckCircle2,
  FileTerminal,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentRuntimeEventProjection } from "@limecloud/agent-ui-contracts";
import { Button } from "@/components/ui/button";
import type { ActionRequired, ConfirmResponse } from "../types";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function readString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function actionPayload(
  action: AgentRuntimeEventProjection,
): Record<string, unknown> {
  return isRecord(action.source.payload) ? action.source.payload : {};
}

function payloadRequest(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return isRecord(payload.request) ? payload.request : {};
}

function actionTypeFromProjection(
  action: AgentRuntimeEventProjection,
): ActionRequired["actionType"] | null {
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  const rawType =
    readString(payload.actionType) ||
    readString(payload.action_type) ||
    readString(payload.actionKind) ||
    readString(request.action_type) ||
    readString(request.actionType);

  if (
    rawType === "tool_confirmation" ||
    rawType === "ask_user" ||
    rawType === "elicitation"
  ) {
    return rawType;
  }
  if (
    rawType === "approval" ||
    rawType === "approve-command" ||
    rawType === "command_approval"
  ) {
    return "tool_confirmation";
  }
  return null;
}

function commandFromProjection(
  action: AgentRuntimeEventProjection,
): string | null {
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  return (
    readString(payload.command) ||
    readString(request.command) ||
    readString(payload.commandId) ||
    readString(request.command_id) ||
    null
  );
}

function toolNameFromProjection(
  action: AgentRuntimeEventProjection,
): string | null {
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  return (
    readString(payload.toolName) ||
    readString(payload.tool_name) ||
    readString(request.tool_name) ||
    readString(request.toolName) ||
    (commandFromProjection(action) ? "shell" : null)
  );
}

function argumentsFromProjection(
  action: AgentRuntimeEventProjection,
): Record<string, unknown> {
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  const requestArguments = request.arguments;
  const payloadArguments = payload.arguments;
  if (isRecord(requestArguments)) return requestArguments;
  if (isRecord(payloadArguments)) return payloadArguments;
  const command = commandFromProjection(action);
  return command ? { command } : {};
}

function promptFromProjection(action: AgentRuntimeEventProjection): string {
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  return (
    readString(payload.prompt) ||
    readString(request.prompt) ||
    readString(payload.promptPreview) ||
    action.detail ||
    action.title
  );
}

function actionRequiredFromProjection(
  action: AgentRuntimeEventProjection,
): ActionRequired | null {
  const requestId = action.actionId || action.source.actionId;
  if (!requestId) return null;
  const actionType = actionTypeFromProjection(action);
  if (!actionType) return null;
  const payload = actionPayload(action);
  const request = payloadRequest(payload);
  return {
    requestId,
    actionType,
    toolName: toolNameFromProjection(action) || undefined,
    arguments: argumentsFromProjection(action),
    prompt: promptFromProjection(action),
    scope: {
      sessionId:
        readString(payload.sessionId) ||
        readString(payload.session_id) ||
        readString(request.session_id) ||
        action.source.runtimeId ||
        undefined,
      threadId:
        readString(payload.threadId) ||
        readString(payload.thread_id) ||
        readString(request.thread_id) ||
        action.source.threadId,
      turnId:
        readString(payload.turnId) ||
        readString(payload.turn_id) ||
        readString(request.turn_id) ||
        action.source.turnId,
    },
    eventName:
      readString(payload.eventName) ||
      readString(payload.event_name) ||
      readString(request.event_name),
  };
}

function isSubmitted(
  action: AgentRuntimeEventProjection,
  submittedActionsInFlight: readonly ActionRequired[],
): boolean {
  const requestId = action.actionId || action.source.actionId;
  return Boolean(
    requestId &&
    submittedActionsInFlight.some((item) => item.requestId === requestId),
  );
}

interface CodingWorkbenchActionPanelProps {
  actions: readonly AgentRuntimeEventProjection[];
  submittedActionsInFlight?: readonly ActionRequired[];
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
}

export function CodingWorkbenchActionPanel({
  actions,
  submittedActionsInFlight = [],
  onRespondToAction,
}: CodingWorkbenchActionPanelProps) {
  const { t } = useTranslation("agent");

  if (actions.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="coding-workbench-actions">
      <h3 className="text-xs font-semibold text-slate-500">
        {t("agentChat.canvasWorkbench.coding.outputs.actions")}
      </h3>
      <div className="space-y-2">
        {actions.map((action) => {
          const request = actionRequiredFromProjection(action);
          const command = commandFromProjection(action);
          const submitting = isSubmitted(action, submittedActionsInFlight);
          const canRespond =
            Boolean(request) &&
            request?.actionType === "tool_confirmation" &&
            Boolean(onRespondToAction);
          const requestRef =
            action.actionId || action.source.actionId || action.id;

          return (
            <article
              key={action.id}
              data-testid="coding-workbench-action"
              data-action-id={requestRef}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span className="truncate">{action.title}</span>
                  </div>
                  {action.detail ? (
                    <div className="mt-1 text-xs text-amber-700">
                      {action.detail}
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t("agentChat.canvasWorkbench.coding.actions.pendingBadge")}
                </span>
              </div>

              {command ? (
                <div className="mt-3 rounded-md border border-amber-100 bg-white px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-950">
                    <FileTerminal className="h-3.5 w-3.5" />
                    {t("agentChat.canvasWorkbench.coding.actions.command")}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-amber-900">
                    {command}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 text-xs text-amber-700">
                {t("agentChat.canvasWorkbench.coding.actions.requestRef", {
                  id: requestRef,
                })}
              </div>

              {canRespond && request ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    className="border-slate-900 bg-slate-900 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800 hover:opacity-100"
                    aria-label={t(
                      "agentChat.canvasWorkbench.coding.actions.approveAria",
                      { target: action.title },
                    )}
                    onClick={() =>
                      void onRespondToAction?.({
                        requestId: request.requestId,
                        actionType: request.actionType,
                        confirmed: true,
                        response: "approved",
                      })
                    }
                  >
                    {submitting ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                    )}
                    {t(
                      submitting
                        ? "agentChat.canvasWorkbench.coding.actions.submitting"
                        : "agentChat.canvasWorkbench.coding.actions.approve",
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                    aria-label={t(
                      "agentChat.canvasWorkbench.coding.actions.rejectAria",
                      { target: action.title },
                    )}
                    onClick={() =>
                      void onRespondToAction?.({
                        requestId: request.requestId,
                        actionType: request.actionType,
                        confirmed: false,
                        response: "rejected",
                      })
                    }
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    {t("agentChat.canvasWorkbench.coding.actions.reject")}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-amber-100 bg-white px-3 py-2 text-xs text-amber-800">
                  {t("agentChat.canvasWorkbench.coding.actions.responseHint")}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
