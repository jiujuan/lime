import type { AgentUiDiagnosticView } from "@limecloud/agent-ui-contracts";
import type {
  CodingWorkbenchView,
  CommandOutputView,
  PatchView,
  TestRunView,
} from "@limecloud/agent-runtime-projection";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";

export type CodingWorkbenchRecoverySignalKind =
  | "command"
  | "test"
  | "patch"
  | "diagnostic";

export interface CodingWorkbenchRecoveryPromptCopy {
  intro: string;
  requirements: string;
  failedCommand: string;
  failedTest: string;
  failedPatch: string;
  diagnostic: string;
  preview: string;
  relatedFiles: string;
  latestCheckpoint: string;
}

export interface CodingWorkbenchRecoverySignal {
  kind: CodingWorkbenchRecoverySignalKind;
  id: string;
  title: string;
  summary?: string;
  preview?: string;
}

export interface CodingWorkbenchRecoveryView {
  signals: CodingWorkbenchRecoverySignal[];
  relatedFiles: string[];
  latestCheckpointPath?: string;
  prompt: string;
}

const MAX_PROMPT_PREVIEW_CHARS = 1800;
const MAX_SIGNAL_PREVIEW_CHARS = 600;
const MAX_RECOVERY_SIGNALS = 6;
const MAX_RELATED_FILES = 8;

function normalizedText(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function trimText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function statusLooksFailed(status: string | undefined): boolean {
  const normalized = status?.toLowerCase();
  return normalized === "failed" || normalized === "error";
}

function appendLine(lines: string[], label: string, value: string | undefined) {
  const normalized = normalizedText(value);
  if (normalized) {
    lines.push(`- ${label}: ${normalized}`);
  }
}

function labelForSignal(
  copy: CodingWorkbenchRecoveryPromptCopy,
  kind: CodingWorkbenchRecoverySignalKind,
): string {
  if (kind === "command") return copy.failedCommand;
  if (kind === "test") return copy.failedTest;
  if (kind === "patch") return copy.failedPatch;
  return copy.diagnostic;
}

function compactParts(
  parts: Array<string | number | undefined>,
): string | undefined {
  const values = parts
    .map((item) =>
      typeof item === "number" ? String(item) : normalizedText(item),
    )
    .filter((item): item is string => Boolean(item));
  return values.length ? values.join(" · ") : undefined;
}

function commandRecoverySignal(
  command: CommandOutputView,
): CodingWorkbenchRecoverySignal | null {
  if (
    !statusLooksFailed(command.status) &&
    !(typeof command.exitCode === "number" && command.exitCode !== 0)
  ) {
    return null;
  }
  const title =
    normalizedText(command.command) ||
    normalizedText(command.title) ||
    command.commandId;
  return {
    kind: "command",
    id: command.commandId,
    title,
    summary: compactParts([
      command.cwd ? `cwd=${command.cwd}` : undefined,
      typeof command.exitCode === "number"
        ? `exit=${command.exitCode}`
        : undefined,
      command.status ? `status=${command.status}` : undefined,
    ]),
    preview: normalizedText(command.preview),
  };
}

function testRecoverySignal(
  test: TestRunView,
): CodingWorkbenchRecoverySignal | null {
  if (
    !statusLooksFailed(test.status) &&
    test.result?.toLowerCase() !== "failed" &&
    !(typeof test.failed === "number" && test.failed > 0)
  ) {
    return null;
  }
  const title =
    normalizedText(test.suite) || normalizedText(test.title) || test.testRunId;
  return {
    kind: "test",
    id: test.testRunId,
    title,
    summary: compactParts([
      typeof test.passed === "number" ? `passed=${test.passed}` : undefined,
      typeof test.failed === "number" ? `failed=${test.failed}` : undefined,
      test.result ? `result=${test.result}` : undefined,
      test.failureCategory ? `category=${test.failureCategory}` : undefined,
      test.commandId ? `command=${test.commandId}` : undefined,
    ]),
  };
}

function patchRecoverySignal(
  patch: PatchView,
): CodingWorkbenchRecoverySignal | null {
  if (!statusLooksFailed(patch.status)) {
    return null;
  }
  const title =
    normalizedText(patch.path) || normalizedText(patch.title) || patch.patchId;
  return {
    kind: "patch",
    id: patch.patchId,
    title,
    summary: compactParts([
      patch.failureCategory ? `category=${patch.failureCategory}` : undefined,
      patch.toolCallId ? `tool=${patch.toolCallId}` : undefined,
      patch.diffRef ? `diff=${patch.diffRef}` : undefined,
    ]),
    preview: normalizedText(patch.recoveryHintRef || patch.diffRef),
  };
}

function diagnosticRecoverySignal(
  diagnostic: AgentUiDiagnosticView,
): CodingWorkbenchRecoverySignal | null {
  if (!statusLooksFailed(diagnostic.status)) {
    return null;
  }
  return {
    kind: "diagnostic",
    id: diagnostic.id,
    title: diagnostic.title,
    summary: normalizedText(diagnostic.detail),
    preview: normalizedText(diagnostic.detail),
  };
}

function uniqueValues(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = normalizedText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function relatedFiles(codingView: CodingWorkbenchView): string[] {
  return uniqueValues([
    ...codingView.changes.map((change) => change.path),
    ...codingView.files.map((file) => file.path),
    ...codingView.patches.map((patch) => patch.path),
  ]);
}

function latestCheckpointPath(
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null,
): string | undefined {
  const latest = fileCheckpointSummary?.latest_checkpoint;
  return normalizedText(latest?.path || latest?.snapshot_path);
}

function buildPrompt({
  signals,
  relatedFilePaths,
  checkpointPath,
  copy,
}: {
  signals: readonly CodingWorkbenchRecoverySignal[];
  relatedFilePaths: readonly string[];
  checkpointPath?: string;
  copy: CodingWorkbenchRecoveryPromptCopy;
}): string {
  const lines = [copy.intro, "", copy.requirements, ""];

  signals.forEach((signal) => {
    appendLine(
      lines,
      labelForSignal(copy, signal.kind),
      compactParts([signal.title, signal.summary]),
    );
  });

  const previews = signals
    .map((signal) => {
      const preview = normalizedText(signal.preview || signal.summary);
      if (!preview) return null;
      return `${labelForSignal(copy, signal.kind)} ${signal.id}\n${trimText(
        preview,
        MAX_SIGNAL_PREVIEW_CHARS,
      )}`;
    })
    .filter((item): item is string => Boolean(item));

  if (previews.length > 0) {
    lines.push(
      "",
      `${copy.preview}:`,
      "```text",
      trimText(previews.join("\n\n"), MAX_PROMPT_PREVIEW_CHARS),
      "```",
    );
  }

  const visibleFiles = relatedFilePaths.slice(0, MAX_RELATED_FILES);
  const hiddenFileCount = Math.max(
    relatedFilePaths.length - visibleFiles.length,
    0,
  );
  if (visibleFiles.length > 0) {
    lines.push(
      "",
      `${copy.relatedFiles}: ${visibleFiles.join(", ")}${
        hiddenFileCount > 0 ? `, +${hiddenFileCount}` : ""
      }`,
    );
  }

  appendLine(lines, copy.latestCheckpoint, checkpointPath);

  return lines.join("\n").trim();
}

export function buildCodingWorkbenchRecoveryView({
  codingView,
  fileCheckpointSummary,
  copy,
}: {
  codingView: CodingWorkbenchView;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  copy: CodingWorkbenchRecoveryPromptCopy;
}): CodingWorkbenchRecoveryView | null {
  const signals = [
    ...codingView.commands.map(commandRecoverySignal),
    ...codingView.tests.map(testRecoverySignal),
    ...codingView.patches.map(patchRecoverySignal),
    ...codingView.diagnostics.map(diagnosticRecoverySignal),
  ]
    .filter((signal): signal is CodingWorkbenchRecoverySignal =>
      Boolean(signal),
    )
    .slice(0, MAX_RECOVERY_SIGNALS);

  if (signals.length === 0) {
    return null;
  }

  const relatedFilePaths = relatedFiles(codingView);
  const checkpointPath = latestCheckpointPath(fileCheckpointSummary);

  return {
    signals,
    relatedFiles: relatedFilePaths,
    latestCheckpointPath: checkpointPath,
    prompt: buildPrompt({
      signals,
      relatedFilePaths,
      checkpointPath,
      copy,
    }),
  };
}
