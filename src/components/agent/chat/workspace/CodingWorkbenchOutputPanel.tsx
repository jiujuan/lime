import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Clock3, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import { cn } from "@/lib/utils";

type CodingStatusTone = "running" | "failed" | "completed" | "default";
type CodingStatusLabelKey =
  | "agentChat.canvasWorkbench.coding.outputs.status.blocked"
  | "agentChat.canvasWorkbench.coding.outputs.status.completed"
  | "agentChat.canvasWorkbench.coding.outputs.status.default"
  | "agentChat.canvasWorkbench.coding.outputs.status.failed"
  | "agentChat.canvasWorkbench.coding.outputs.status.running";

function statusTone(status?: string | null): CodingStatusTone {
  if (status === "running" || status === "pending") return "running";
  if (status === "failed" || status === "canceled" || status === "blocked") {
    return "failed";
  }
  if (status === "completed") return "completed";
  return "default";
}

function statusLabelKey(status?: string | null): CodingStatusLabelKey {
  if (status === "running" || status === "pending") {
    return "agentChat.canvasWorkbench.coding.outputs.status.running";
  }
  if (status === "failed" || status === "canceled") {
    return "agentChat.canvasWorkbench.coding.outputs.status.failed";
  }
  if (status === "blocked") {
    return "agentChat.canvasWorkbench.coding.outputs.status.blocked";
  }
  if (status === "completed") {
    return "agentChat.canvasWorkbench.coding.outputs.status.completed";
  }
  return "agentChat.canvasWorkbench.coding.outputs.status.default";
}

function toneClassName(tone: CodingStatusTone): string {
  if (tone === "running") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusIcon(tone: CodingStatusTone): ReactNode {
  if (tone === "running") return <Clock3 className="h-3.5 w-3.5" />;
  if (tone === "failed") return <CircleAlert className="h-3.5 w-3.5" />;
  if (tone === "completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <TerminalSquare className="h-3.5 w-3.5" />;
}

interface CodingWorkbenchOutputPanelProps {
  codingView: CodingWorkbenchView;
}

export function CodingWorkbenchOutputPanel({
  codingView,
}: CodingWorkbenchOutputPanelProps) {
  const { t } = useTranslation("agent");
  const hasCommands = codingView.commands.length > 0;
  const hasTests = codingView.tests.length > 0;
  const hasActions = codingView.actions.length > 0;
  const hasDiagnostics = codingView.diagnostics.length > 0;

  if (!hasCommands && !hasTests && !hasActions && !hasDiagnostics) {
    return (
      <div
        data-testid="coding-workbench-output-projection"
        className="p-5 text-sm text-slate-500"
      >
        {t("agentChat.canvasWorkbench.coding.outputs.empty")}
      </div>
    );
  }

  return (
    <div
      data-testid="coding-workbench-output-projection"
      className="flex h-full min-h-0 flex-col gap-4 overflow-auto bg-white p-4"
    >
      {hasCommands ? (
        <section className="space-y-2" data-testid="coding-workbench-commands">
          <h3 className="text-xs font-semibold text-slate-500">
            {t("agentChat.canvasWorkbench.coding.outputs.commands")}
          </h3>
          <div className="space-y-2">
            {codingView.commands.map((command) => {
              const tone = statusTone(command.status);
              return (
                <article
                  key={command.commandId}
                  data-testid="coding-workbench-command"
                  data-command-id={command.commandId}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm text-slate-900">
                        {command.command || command.title}
                      </div>
                      {command.cwd ? (
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {command.cwd}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        toneClassName(tone),
                      )}
                    >
                      {statusIcon(tone)}
                      {t(statusLabelKey(command.status))}
                    </span>
                  </div>
                  {command.preview ? (
                    <pre className="mt-3 max-h-28 overflow-hidden rounded-md bg-slate-950 p-2 text-xs text-slate-100">
                      {command.preview}
                    </pre>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasTests ? (
        <section className="space-y-2" data-testid="coding-workbench-tests">
          <h3 className="text-xs font-semibold text-slate-500">
            {t("agentChat.canvasWorkbench.coding.outputs.tests")}
          </h3>
          <div className="space-y-2">
            {codingView.tests.map((test) => {
              const tone = statusTone(test.status);
              return (
                <article
                  key={test.testRunId}
                  data-testid="coding-workbench-test"
                  data-test-run-id={test.testRunId}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {test.suite || test.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t("agentChat.canvasWorkbench.coding.outputs.testStats", {
                          passed: test.passed ?? 0,
                          failed: test.failed ?? 0,
                        })}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        toneClassName(tone),
                      )}
                    >
                      {statusIcon(tone)}
                      {t(statusLabelKey(test.status))}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasActions ? (
        <section className="space-y-2" data-testid="coding-workbench-actions">
          <h3 className="text-xs font-semibold text-slate-500">
            {t("agentChat.canvasWorkbench.coding.outputs.actions")}
          </h3>
          <div className="space-y-2">
            {codingView.actions.map((action) => (
              <article
                key={action.id}
                data-testid="coding-workbench-action"
                data-action-id={action.actionId}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
              >
                <div className="font-medium">{action.title}</div>
                {action.detail ? (
                  <div className="mt-1 text-xs text-amber-700">{action.detail}</div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {hasDiagnostics ? (
        <section
          className="space-y-2"
          data-testid="coding-workbench-diagnostics"
        >
          <h3 className="text-xs font-semibold text-slate-500">
            {t("agentChat.canvasWorkbench.coding.outputs.diagnostics")}
          </h3>
          <div className="space-y-2">
            {codingView.diagnostics.map((diagnostic) => {
              const tone = statusTone(diagnostic.status);
              return (
                <article
                  key={diagnostic.id}
                  data-testid="coding-workbench-diagnostic"
                  data-diagnostic-id={diagnostic.id}
                  className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{diagnostic.title}</div>
                      {diagnostic.detail ? (
                        <div className="mt-1 text-xs text-rose-700">
                          {diagnostic.detail}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        toneClassName(tone),
                      )}
                    >
                      {statusIcon(tone)}
                      {t(statusLabelKey(diagnostic.status))}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
