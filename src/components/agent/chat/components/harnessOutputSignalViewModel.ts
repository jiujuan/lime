import { resolveAgentRuntimeErrorPresentation } from "../utils/agentRuntimeErrorPresentation";
import { isFailedHarnessOutputSignal } from "../utils/harnessOutputSignals";
import type { HarnessOutputSignal } from "../utils/harnessState";
import { isUnifiedWebSearchToolName } from "../utils/searchResultPreview";
import {
  resolveDiffReviewSummaryFromCandidates,
  type DiffReviewSummary,
} from "../utils/diffReview";

export type OutputFilterValue =
  | "all"
  | "path"
  | "offload"
  | "truncated"
  | "summary";

export type OutputPathKind = "output" | "offload" | "artifact";

export interface OutputStatusDescriptor {
  key: string;
  labelKey: string;
  values?: Record<string, string | number>;
  variant: "default" | "secondary" | "destructive" | "outline";
}

export interface OutputSignalPath {
  key: OutputPathKind;
  path: string;
}

export interface OutputCardPresentation {
  summary: string;
  preview: string | undefined;
  collapsedHint: string | null;
  rawDetailsCollapsed: boolean;
  tone: "failed" | "default";
}

export interface HarnessFilterOption<TValue extends string> {
  value: TValue;
  label: string;
}

export type HarnessOutputSignalGroupEntry =
  | { type: "single"; signal: HarnessOutputSignal }
  | { type: "search_batch"; signals: HarnessOutputSignal[] };

const OUTPUT_PATH_LABEL_KEY_BY_KIND: Record<OutputPathKind, string> = {
  output: "agentChat.harness.outputs.paths.output",
  offload: "agentChat.harness.outputs.paths.offload",
  artifact: "agentChat.harness.outputs.paths.artifact",
};

export function isSearchOutputSignal(signal: HarnessOutputSignal): boolean {
  if (isUnifiedWebSearchToolName(signal.toolName)) {
    return true;
  }

  return signal.title === "联网检索摘要";
}

export function buildOutputSignalDiffSummary(
  signal: HarnessOutputSignal,
): DiffReviewSummary | null {
  return resolveDiffReviewSummaryFromCandidates(
    [signal.content, signal.preview, signal.summary],
    { fallbackPath: getSignalPath(signal) },
  );
}

export function resolveOutputPathLabelKey(kind: OutputPathKind): string {
  return OUTPUT_PATH_LABEL_KEY_BY_KIND[kind] || kind;
}

export function getSignalPath(
  signal: HarnessOutputSignal,
): string | undefined {
  return signal.offloadFile || signal.outputFile || signal.artifactPath;
}

export function matchesOutputFilter(
  signal: HarnessOutputSignal,
  filter: OutputFilterValue,
): boolean {
  const signalPath = getSignalPath(signal);

  switch (filter) {
    case "path":
      return Boolean(signalPath);
    case "offload":
      return Boolean(signal.offloaded || signal.offloadFile);
    case "truncated":
      return signal.truncated === true;
    case "summary":
      return !signalPath && Boolean(signal.preview?.trim());
    default:
      return true;
  }
}

export function buildOutputFilterOptions(
  outputSignals: HarnessOutputSignal[],
): HarnessFilterOption<OutputFilterValue>[] {
  return [
    { value: "all" as const, label: "全部" },
    { value: "path" as const, label: "有路径" },
    { value: "offload" as const, label: "转存" },
    { value: "truncated" as const, label: "截断" },
    { value: "summary" as const, label: "仅摘要" },
  ].filter(
    (option) =>
      option.value === "all" ||
      outputSignals.some((signal) => matchesOutputFilter(signal, option.value)),
  );
}

export function buildFilteredOutputSignals(
  outputSignals: HarnessOutputSignal[],
  outputFilter: OutputFilterValue,
): HarnessOutputSignal[] {
  return outputSignals.filter((signal) =>
    matchesOutputFilter(signal, outputFilter),
  );
}

export function groupHarnessOutputSignals(
  outputSignals: HarnessOutputSignal[],
): HarnessOutputSignalGroupEntry[] {
  const entries: HarnessOutputSignalGroupEntry[] = [];

  for (const signal of outputSignals) {
    const isSearch = isSearchOutputSignal(signal);
    const lastEntry = entries[entries.length - 1];

    if (isSearch && lastEntry && lastEntry.type === "search_batch") {
      lastEntry.signals.push(signal);
      continue;
    }

    if (isSearch) {
      entries.push({ type: "search_batch", signals: [signal] });
      continue;
    }

    entries.push({ type: "single", signal });
  }

  return entries;
}

export function buildOutputStatusDescriptors(
  signal: HarnessOutputSignal,
): OutputStatusDescriptor[] {
  const descriptors: OutputStatusDescriptor[] = [];

  if (signal.exitCode !== undefined) {
    descriptors.push({
      key: "exit-code",
      labelKey:
        signal.exitCode === 0
          ? "agentChat.harness.outputs.status.exitSuccess"
          : "agentChat.harness.outputs.status.exitFailed",
      values: { code: signal.exitCode },
      variant: signal.exitCode === 0 ? "secondary" : "destructive",
    });
  }

  if (signal.truncated) {
    descriptors.push({
      key: "truncated",
      labelKey: "agentChat.harness.outputs.status.truncated",
      variant: "outline",
    });
  }

  if (signal.offloaded || signal.offloadFile) {
    descriptors.push({
      key: "offloaded",
      labelKey: "agentChat.harness.outputs.status.offloaded",
      variant: "outline",
    });
  }

  if (signal.sandboxed !== undefined) {
    descriptors.push({
      key: "sandboxed",
      labelKey: signal.sandboxed
        ? "agentChat.harness.outputs.status.sandboxed"
        : "agentChat.harness.outputs.status.unsandboxed",
      variant: "outline",
    });
  }

  if (signal.stdoutLength !== undefined) {
    descriptors.push({
      key: "stdout",
      labelKey: "agentChat.harness.outputs.status.stdout",
      values: { count: signal.stdoutLength },
      variant: "outline",
    });
  }

  if (signal.stderrLength !== undefined) {
    descriptors.push({
      key: "stderr",
      labelKey: "agentChat.harness.outputs.status.stderr",
      values: { count: signal.stderrLength },
      variant: signal.stderrLength > 0 ? "destructive" : "outline",
    });
  }

  if (signal.offloadOriginalChars !== undefined) {
    descriptors.push({
      key: "original-chars",
      labelKey: "agentChat.harness.outputs.status.originalChars",
      values: { count: signal.offloadOriginalChars },
      variant: "outline",
    });
  }

  if (signal.offloadOriginalTokens !== undefined) {
    descriptors.push({
      key: "original-tokens",
      labelKey: "agentChat.harness.outputs.status.originalTokens",
      values: { count: signal.offloadOriginalTokens },
      variant: "outline",
    });
  }

  return descriptors;
}

export function isNoisyRuntimeOutputText(value: string): boolean {
  return /(?:-32603|-32002|troubleshooting|json-?rpc)/i.test(value);
}

export function resolveOutputCardPresentation(
  signal: HarnessOutputSignal,
  options: { rawDetailsCollapsedHint: string },
): OutputCardPresentation {
  const rawText = [signal.summary, signal.preview, signal.content]
    .filter(Boolean)
    .join("\n");
  const failed = isFailedHarnessOutputSignal(signal);
  const rawDetailsCollapsed = failed && isNoisyRuntimeOutputText(rawText);
  const summary = rawDetailsCollapsed
    ? resolveAgentRuntimeErrorPresentation(rawText).displayMessage
    : signal.summary;

  return {
    summary,
    preview: rawDetailsCollapsed ? undefined : signal.preview,
    collapsedHint: rawDetailsCollapsed
      ? options.rawDetailsCollapsedHint
      : null,
    rawDetailsCollapsed,
    tone: failed ? "failed" : "default",
  };
}

export function getOutputSignalPaths(
  signal: HarnessOutputSignal,
): OutputSignalPath[] {
  return [
    signal.outputFile
      ? { key: "output" as const, path: signal.outputFile }
      : null,
    signal.offloadFile
      ? { key: "offload" as const, path: signal.offloadFile }
      : null,
    signal.artifactPath
      ? { key: "artifact" as const, path: signal.artifactPath }
      : null,
  ].filter((item): item is OutputSignalPath => Boolean(item));
}
