import { useTranslation } from "react-i18next";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import type { ActionRequired, ConfirmResponse } from "../types";
import { CodingWorkbenchActionPanel } from "./CodingWorkbenchActionPanel";
import { CodingWorkbenchDiagnosticPanel } from "./CodingWorkbenchDiagnosticPanel";
import { CodingStatusBadge } from "./codingWorkbenchStatus";
import { statusLabelKey } from "./codingWorkbenchStatusModel";

interface CodingWorkbenchOutputPanelProps {
  codingView: CodingWorkbenchView;
  submittedActionsInFlight?: readonly ActionRequired[];
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
}

export function CodingWorkbenchOutputPanel({
  codingView,
  submittedActionsInFlight,
  onRespondToAction,
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
                    <CodingStatusBadge
                      status={command.status}
                      label={t(statusLabelKey(command.status))}
                    />
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
                        {t(
                          "agentChat.canvasWorkbench.coding.outputs.testStats",
                          {
                            passed: test.passed ?? 0,
                            failed: test.failed ?? 0,
                          },
                        )}
                      </div>
                    </div>
                    <CodingStatusBadge
                      status={test.status}
                      label={t(statusLabelKey(test.status))}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasActions ? (
        <CodingWorkbenchActionPanel
          actions={codingView.actions}
          submittedActionsInFlight={submittedActionsInFlight}
          onRespondToAction={onRespondToAction}
        />
      ) : null}

      {hasDiagnostics ? (
        <CodingWorkbenchDiagnosticPanel diagnostics={codingView.diagnostics} />
      ) : null}
    </div>
  );
}
