import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import type { CanvasSessionOverviewActivity } from "../components/CanvasSessionOverviewPanel";

type ActivityStatus = CanvasSessionOverviewActivity["status"];

export interface CodingSessionOverviewLabels {
  failedCount: (count: number) => string;
  filesChanged: (count: number) => string;
  passedCount: (count: number) => string;
  patchCount: (count: number) => string;
  preparingResult: string;
}

function normalizeStatus(status?: string): ActivityStatus {
  if (status === "failed") {
    return "failed";
  }
  if (status === "running" || status === "pending" || status === "blocked") {
    return "in_progress";
  }
  return "completed";
}

function outputSummary(value: string | undefined, labels: CodingSessionOverviewLabels): string {
  return value?.trim() || labels.preparingResult;
}

export function buildCodingSessionOverviewActivities(
  codingView: CodingWorkbenchView,
  labels: CodingSessionOverviewLabels,
): CanvasSessionOverviewActivity[] {
  return [
    ...(codingView.changeSummary
      ? [
          {
            id: "coding-change-summary",
            title: labels.filesChanged(
              codingView.changeSummary.changedFileCount,
            ),
            summary:
              codingView.changeSummary.changedFiles.slice(0, 3).join(" / ") ||
              labels.patchCount(codingView.changeSummary.patchCount),
            status: normalizeStatus(
              codingView.changeSummary.failedPatchCount > 0
                ? "failed"
                : codingView.changeSummary.runningPatchCount > 0
                  ? "running"
                  : "completed",
            ),
            icon: "fileText",
          } satisfies CanvasSessionOverviewActivity,
        ]
      : []),
    ...codingView.commands.map(
      (command): CanvasSessionOverviewActivity => ({
        id: `coding-command-${command.commandId}`,
        title:
          command.commandSummary ||
          command.canonicalCommand ||
          command.command ||
          command.title ||
          command.commandId,
        summary: outputSummary(command.preview, labels),
        status: normalizeStatus(command.status),
        icon: "listChecks",
      }),
    ),
    ...codingView.tests.map((test): CanvasSessionOverviewActivity => {
      const summary = [
        test.suite,
        typeof test.passed === "number"
          ? labels.passedCount(test.passed)
          : null,
        typeof test.failed === "number"
          ? labels.failedCount(test.failed)
          : null,
      ]
        .filter(Boolean)
        .join(" / ");
      return {
        id: `coding-test-${test.testRunId}`,
        title: test.commandSummary || test.canonicalCommand || test.title || test.testRunId,
        summary: summary || test.failureCategory || test.result || test.title,
        status: normalizeStatus(test.status),
        icon: "sparkles",
      };
    }),
    ...codingView.changes.map(
      (change): CanvasSessionOverviewActivity => ({
        id: `coding-file-${change.id}`,
        title: change.path,
        summary: outputSummary(change.preview, labels),
        status: normalizeStatus(change.status),
        icon: "fileText",
      }),
    ),
    ...codingView.actions.map(
      (action): CanvasSessionOverviewActivity => ({
        id: `coding-action-${action.actionId || action.id}`,
        title: action.title,
        summary: action.detail || action.targetModule || action.actionKind,
        status: normalizeStatus(action.status),
        icon: "shieldAlert",
      }),
    ),
    ...codingView.diagnostics.map(
      (diagnostic): CanvasSessionOverviewActivity => ({
        id: `coding-diagnostic-${diagnostic.id}`,
        title: diagnostic.title,
        summary: diagnostic.detail || diagnostic.title,
        status: normalizeStatus(diagnostic.status),
        icon: "alertTriangle",
      }),
    ),
  ];
}
