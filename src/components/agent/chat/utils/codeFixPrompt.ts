import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";

export interface CodeFixPromptSignal {
  toolName: string;
  title: string;
  summary: string;
  preview?: string;
  content?: string;
}

export interface CodeFixPromptCopy {
  intro: string;
  requirements: string;
  failedTool: string;
  failedTitle: string;
  failedSummary: string;
  failedPreview: string;
  relatedFiles: string;
  latestCheckpoint: string;
}

export interface CodeFixPromptFileChange {
  path: string;
  displayName: string;
}

const CODE_FIX_OUTPUT_MAX_CHARS = 1800;
const CODE_FIX_FILE_LIMIT = 5;

function trimPromptText(value: string, maxChars: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}...`;
}

function appendPromptLine(
  lines: string[],
  label: string,
  value: string | null | undefined,
) {
  const normalized = value?.trim();
  if (normalized) {
    lines.push(`- ${label}: ${normalized}`);
  }
}

export function buildCodeFixPromptFromHarnessSignal({
  signal,
  fileChanges,
  fileCheckpointSummary,
  copy,
}: {
  signal: CodeFixPromptSignal;
  fileChanges: CodeFixPromptFileChange[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  copy: CodeFixPromptCopy;
}): string {
  const lines = [copy.intro, "", copy.requirements, ""];

  appendPromptLine(lines, copy.failedTool, signal.toolName);
  appendPromptLine(lines, copy.failedTitle, signal.title);
  appendPromptLine(lines, copy.failedSummary, signal.summary);

  const preview = trimPromptText(
    signal.content || signal.preview || signal.summary || "",
    CODE_FIX_OUTPUT_MAX_CHARS,
  );
  if (preview) {
    lines.push("", `${copy.failedPreview}:`, "```text", preview, "```");
  }

  const relatedFiles = fileChanges
    .slice(0, CODE_FIX_FILE_LIMIT)
    .map((item) =>
      item.path && item.path !== item.displayName
        ? `${item.displayName} (${item.path})`
        : item.displayName,
    )
    .filter(Boolean);
  const hiddenFileCount = Math.max(fileChanges.length - relatedFiles.length, 0);
  if (relatedFiles.length > 0) {
    lines.push(
      "",
      `${copy.relatedFiles}: ${relatedFiles.join(", ")}${
        hiddenFileCount > 0 ? `, +${hiddenFileCount}` : ""
      }`,
    );
  }

  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint;
  if (latestCheckpoint?.path) {
    lines.push("", `${copy.latestCheckpoint}: ${latestCheckpoint.path}`);
  }

  return lines.join("\n").trim();
}
