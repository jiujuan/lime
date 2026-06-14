import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileDiff,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import { cn } from "@/lib/utils";

type CodingLogTone = "running" | "failed" | "blocked" | "completed" | "default";
type CodingStatusLabelKey =
  | "agentChat.canvasWorkbench.coding.outputs.status.blocked"
  | "agentChat.canvasWorkbench.coding.outputs.status.completed"
  | "agentChat.canvasWorkbench.coding.outputs.status.default"
  | "agentChat.canvasWorkbench.coding.outputs.status.failed"
  | "agentChat.canvasWorkbench.coding.outputs.status.running";

interface CodingLogEntry {
  id: string;
  title: string;
  detail?: string;
  status?: string | null;
  tone: CodingLogTone;
  kind: "command" | "test" | "action" | "diagnostic" | "change";
}

function toneForStatus(status?: string | null): CodingLogTone {
  if (status === "running" || status === "pending") return "running";
  if (status === "blocked") return "blocked";
  if (status === "failed" || status === "canceled") return "failed";
  if (status === "completed") return "completed";
  return "default";
}

function toneClassName(tone: CodingLogTone): string {
  if (tone === "running") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "blocked") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusKey(status?: string | null): CodingStatusLabelKey {
  if (status === "running" || status === "pending") {
    return "agentChat.canvasWorkbench.coding.outputs.status.running";
  }
  if (status === "blocked") {
    return "agentChat.canvasWorkbench.coding.outputs.status.blocked";
  }
  if (status === "failed" || status === "canceled") {
    return "agentChat.canvasWorkbench.coding.outputs.status.failed";
  }
  if (status === "completed") {
    return "agentChat.canvasWorkbench.coding.outputs.status.completed";
  }
  return "agentChat.canvasWorkbench.coding.outputs.status.default";
}

function iconForEntry(entry: CodingLogEntry) {
  if (entry.kind === "diagnostic" || entry.tone === "failed") {
    return <CircleAlert className="h-3.5 w-3.5" />;
  }
  if (entry.kind === "action" || entry.tone === "blocked") {
    return <ShieldAlert className="h-3.5 w-3.5" />;
  }
  if (entry.tone === "running") return <Clock3 className="h-3.5 w-3.5" />;
  if (entry.tone === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  return <FileDiff className="h-3.5 w-3.5" />;
}

function buildLogEntries(codingView: CodingWorkbenchView): CodingLogEntry[] {
  return [
    ...codingView.changes.map(
      (change): CodingLogEntry => ({
        id: `change:${change.id}`,
        title: change.path,
        detail: change.preview,
        status: change.status,
        tone: toneForStatus(change.status),
        kind: "change",
      }),
    ),
    ...codingView.commands.map(
      (command): CodingLogEntry => ({
        id: `command:${command.commandId}`,
        title: command.command || command.title,
        detail: command.preview || command.cwd,
        status: command.status,
        tone: toneForStatus(command.status),
        kind: "command",
      }),
    ),
    ...codingView.tests.map(
      (test): CodingLogEntry => ({
        id: `test:${test.testRunId}`,
        title: test.suite || test.title,
        detail:
          test.result ||
          [
            test.passed != null ? `${test.passed} passed` : null,
            test.failed != null ? `${test.failed} failed` : null,
          ]
            .filter(Boolean)
            .join(", "),
        status: test.status,
        tone: toneForStatus(test.status),
        kind: "test",
      }),
    ),
    ...codingView.actions.map(
      (action): CodingLogEntry => ({
        id: `action:${action.actionId || action.id}`,
        title: action.title,
        detail: action.detail,
        status: action.status,
        tone: "blocked",
        kind: "action",
      }),
    ),
    ...codingView.diagnostics.map(
      (diagnostic): CodingLogEntry => ({
        id: `diagnostic:${diagnostic.id}`,
        title: diagnostic.title,
        detail: diagnostic.detail,
        status: diagnostic.status,
        tone: toneForStatus(diagnostic.status),
        kind: "diagnostic",
      }),
    ),
  ];
}

interface CodingWorkbenchLogPanelProps {
  codingView: CodingWorkbenchView;
}

export function CodingWorkbenchLogPanel({
  codingView,
}: CodingWorkbenchLogPanelProps) {
  const { t } = useTranslation("agent");
  const entries = buildLogEntries(codingView);

  if (entries.length === 0) {
    return (
      <div
        data-testid="coding-workbench-log-projection"
        className="p-5 text-sm text-slate-500"
      >
        {t("agentChat.canvasWorkbench.coding.logs.empty")}
      </div>
    );
  }

  return (
    <div
      data-testid="coding-workbench-log-projection"
      className="h-full min-h-0 overflow-auto bg-white p-4"
    >
      <ol className="relative space-y-2 border-l border-slate-200 pl-4">
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid="coding-workbench-log-entry"
            className="relative"
          >
            <span
              className={cn(
                "absolute -left-[23px] top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white",
                toneClassName(entry.tone),
              )}
            >
              {iconForEntry(entry)}
            </span>
            <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {entry.title}
                  </div>
                  {entry.detail ? (
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {entry.detail}
                    </div>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    toneClassName(entry.tone),
                  )}
                >
                  {t(statusKey(entry.status))}
                </span>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
