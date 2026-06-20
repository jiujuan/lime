import type { MemoryStoreEntry } from "@/lib/api/memoryStore";

const ROLLOUT_CANDIDATE_DIR = "rollout_summaries/";
const MAX_ARTIFACTS = 3;

export interface RolloutCandidateArtifact {
  title: string;
  path: string;
  kind: string | null;
}

export interface RolloutCandidateSummary {
  path: string;
  title: string;
  source: string | null;
  exportKind: string | null;
  exportRoot: string | null;
  exportedAt: string | null;
  artifacts: RolloutCandidateArtifact[];
  truncated: boolean;
}

export function isRolloutCandidateEntry(
  entry: MemoryStoreEntry,
): boolean {
  return (
    entry.entryType === "file" &&
    entry.path.startsWith(ROLLOUT_CANDIDATE_DIR) &&
    entry.path.endsWith(".md") &&
    !entry.path.startsWith(`${ROLLOUT_CANDIDATE_DIR}processed/`)
  );
}

export function parseRolloutCandidateMarkdown(
  path: string,
  content: string,
  truncated = false,
): RolloutCandidateSummary {
  const lines = content.split(/\r?\n/);
  const title =
    lines
      .map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim())
      .find((value): value is string => Boolean(value)) ?? path;
  const metadata = collectBacktickMetadata(lines);

  return {
    path,
    title,
    source: metadata.source ?? null,
    exportKind: metadata.exportkind ?? null,
    exportRoot: metadata.exportroot ?? null,
    exportedAt: metadata.exportedat ?? null,
    artifacts: collectReferencedArtifacts(lines),
    truncated,
  };
}

function collectBacktickMetadata(lines: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s*([A-Za-z][A-Za-z0-9_-]*):\s*`([^`]+)`/);
    if (!match) {
      continue;
    }
    const key = match[1].toLowerCase();
    if (!metadata[key]) {
      metadata[key] = match[2].trim();
    }
  }
  return metadata;
}

function collectReferencedArtifacts(lines: string[]): RolloutCandidateArtifact[] {
  const artifacts: RolloutCandidateArtifact[] = [];
  let inArtifactsSection = false;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inArtifactsSection = /^##\s+Referenced Artifacts\s*$/i.test(line);
      continue;
    }
    if (!inArtifactsSection) {
      continue;
    }
    const artifact = parseArtifactLine(line);
    if (artifact) {
      artifacts.push(artifact);
    }
    if (artifacts.length >= MAX_ARTIFACTS) {
      break;
    }
  }

  return artifacts;
}

function parseArtifactLine(line: string): RolloutCandidateArtifact | null {
  const match = line.match(/^\s*[-*]\s*(.*?)\s*`([^`]+)`(?:\s*\(([^)]+)\))?/);
  if (!match) {
    return null;
  }
  const title = match[1].trim() || match[2].trim();
  const path = match[2].trim();
  if (!path) {
    return null;
  }
  return {
    title,
    path,
    kind: match[3]?.trim() || null,
  };
}
