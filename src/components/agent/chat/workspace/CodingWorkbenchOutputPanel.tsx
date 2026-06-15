import { useTranslation } from "react-i18next";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import type { ActionRequired, ConfirmResponse } from "../types";
import { CodingWorkbenchActionPanel } from "./CodingWorkbenchActionPanel";
import { CodingWorkbenchDiagnosticPanel } from "./CodingWorkbenchDiagnosticPanel";
import { CodingWorkbenchRecoveryPanel } from "./CodingWorkbenchRecoveryPanel";
import {
  buildCodingWorkbenchRecoveryView,
  type CodingWorkbenchRecoveryContext,
} from "./codingWorkbenchRecovery";
import { CodingStatusBadge } from "./codingWorkbenchStatus";
import { statusLabelKey } from "./codingWorkbenchStatusModel";

interface CodingWorkbenchOutputPanelProps {
  codingView: CodingWorkbenchView;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  submittedActionsInFlight?: readonly ActionRequired[];
  onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  onSubmitRecoveryPrompt?: (
    prompt: string,
    context?: CodingWorkbenchRecoveryContext,
  ) => void | Promise<boolean> | boolean;
}

export function CodingWorkbenchOutputPanel({
  codingView,
  fileCheckpointSummary,
  submittedActionsInFlight,
  onRespondToAction,
  onSubmitRecoveryPrompt,
}: CodingWorkbenchOutputPanelProps) {
  const { t } = useTranslation("agent");
  const recoveryView = buildCodingWorkbenchRecoveryView({
    codingView,
    fileCheckpointSummary,
    copy: {
      intro: t("agentChat.canvasWorkbench.coding.recovery.prompt.intro"),
      requirements: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.requirements",
      ),
      failedCommand: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.failedCommand",
      ),
      failedTest: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.failedTest",
      ),
      failedPatch: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.failedPatch",
      ),
      diagnostic: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.diagnostic",
      ),
      preview: t("agentChat.canvasWorkbench.coding.recovery.prompt.preview"),
      relatedFiles: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.relatedFiles",
      ),
      latestCheckpoint: t(
        "agentChat.canvasWorkbench.coding.recovery.prompt.latestCheckpoint",
      ),
    },
  });
  const hasCommands = codingView.commands.length > 0;
  const hasTests = codingView.tests.length > 0;
  const hasActions = codingView.actions.length > 0;
  const hasDiagnostics = codingView.diagnostics.length > 0;

  if (
    !recoveryView &&
    !hasCommands &&
    !hasTests &&
    !hasActions &&
    !hasDiagnostics
  ) {
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
      {recoveryView ? (
        <CodingWorkbenchRecoveryPanel
          recoveryView={recoveryView}
          onSubmitRecoveryPrompt={onSubmitRecoveryPrompt}
        />
      ) : null}

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
                        {command.commandSummary ||
                          command.canonicalCommand ||
                          command.command ||
                          command.title}
                      </div>
                      {command.command &&
                      command.command !== command.commandSummary &&
                      command.command !== command.canonicalCommand ? (
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {command.command}
                        </div>
                      ) : null}
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
                        {test.commandSummary || test.canonicalCommand || test.suite || test.title}
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
