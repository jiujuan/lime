export interface DiffReviewLine {
  kind: "add" | "remove" | "context" | "hunk";
  text: string;
}

export interface DiffReviewFile {
  id: string;
  path: string;
  status: "added" | "modified" | "deleted" | "unknown";
  additions: number;
  deletions: number;
  hunks: number;
  previewLines: DiffReviewLine[];
  lines: DiffReviewLine[];
}

export interface DiffReviewSummary {
  files: DiffReviewFile[];
  additions: number;
  deletions: number;
  hunks: number;
}

export interface DiffReviewScopeItem {
  id: string;
  label: string | null;
  fileCount: number;
  additions: number;
  deletions: number;
}

export interface DiffReviewFileTreeItem {
  id: string;
  kind: "directory" | "file";
  path: string;
  label: string;
  depth: number;
  fileCount: number;
  additions: number;
  deletions: number;
  status?: DiffReviewFile["status"];
}

export interface DiffReviewSideBySideRow {
  id: string;
  kind: DiffReviewLine["kind"] | "change";
  before: string | null;
  after: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRecordString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function readRecordNumber(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function stripDiffPathPrefix(value: string): string {
  const normalized = value.trim().replace(/^"|"$/g, "");
  if (normalized === "/dev/null") return normalized;
  return normalized.replace(/^[ab]\//, "");
}

function createDiffReviewFile(
  path: string,
  status: DiffReviewFile["status"],
  index: number,
): DiffReviewFile {
  return {
    id: `${path}:${index}`,
    path,
    status,
    additions: 0,
    deletions: 0,
    hunks: 0,
    previewLines: [],
    lines: [],
  };
}

function pushDiffPreviewLine(
  file: DiffReviewFile,
  line: DiffReviewLine,
): void {
  const maxPreviewLines = 8;
  if (file.previewLines.length >= maxPreviewLines) return;
  file.previewLines.push(line);
}

function pushDiffReviewLine(
  file: DiffReviewFile,
  line: DiffReviewLine,
): void {
  file.lines.push(line);
  pushDiffPreviewLine(file, line);
}

function addDiffLine(file: DiffReviewFile, line: DiffReviewLine): void {
  if (line.kind === "add") {
    file.additions += 1;
  } else if (line.kind === "remove") {
    file.deletions += 1;
  } else if (line.kind === "hunk") {
    file.hunks += 1;
  }
  pushDiffReviewLine(file, line);
}

function summarizeDiffFiles(files: DiffReviewFile[]): DiffReviewSummary | null {
  const normalized = files.filter(
    (file) => file.additions > 0 || file.deletions > 0 || file.hunks > 0,
  );
  if (normalized.length === 0) return null;

  return {
    files: normalized,
    additions: normalized.reduce((total, file) => total + file.additions, 0),
    deletions: normalized.reduce((total, file) => total + file.deletions, 0),
    hunks: normalized.reduce((total, file) => total + file.hunks, 0),
  };
}

export function buildDiffReviewScopeItems(
  files: DiffReviewFile[],
): DiffReviewScopeItem[] {
  const scopes = new Map<string, DiffReviewScopeItem>();

  for (const file of files) {
    const scopeLabel = resolveDiffReviewScopeKey(file.path);
    const scopeId = scopeLabel || "__root__";
    const existing =
      scopes.get(scopeId) ??
      ({
        id: scopeId,
        label: scopeLabel,
        fileCount: 0,
        additions: 0,
        deletions: 0,
      } satisfies DiffReviewScopeItem);

    existing.fileCount += 1;
    existing.additions += file.additions;
    existing.deletions += file.deletions;
    scopes.set(scopeId, existing);
  }

  return Array.from(scopes.values()).sort((left, right) => {
    const changeDelta =
      right.additions +
      right.deletions -
      (left.additions + left.deletions);
    if (changeDelta !== 0) return changeDelta;
    return left.id.localeCompare(right.id);
  });
}

function resolveDiffReviewScopeKey(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized === "/dev/null") {
    return null;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }

  const [first, second] = segments;
  if (!first || !second) {
    return null;
  }

  return `${first}/${second}`;
}

function normalizeDiffReviewPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "") || "diff";
}

export function buildDiffReviewFileTreeItems(
  files: DiffReviewFile[],
): DiffReviewFileTreeItem[] {
  const items: DiffReviewFileTreeItem[] = [];
  const directories = new Map<string, DiffReviewFileTreeItem>();

  for (const file of files) {
    const normalizedPath = normalizeDiffReviewPath(file.path);
    const segments = normalizedPath.split("/").filter(Boolean);
    const fileLabel = segments.at(-1) || normalizedPath;
    let currentPath = "";

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]!;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let directory = directories.get(currentPath);
      if (!directory) {
        directory = {
          id: `dir:${currentPath}`,
          kind: "directory",
          path: currentPath,
          label: segment,
          depth: index,
          fileCount: 0,
          additions: 0,
          deletions: 0,
        };
        directories.set(currentPath, directory);
        items.push(directory);
      }
      directory.fileCount += 1;
      directory.additions += file.additions;
      directory.deletions += file.deletions;
    }

    items.push({
      id: `file:${normalizedPath}:${items.length}`,
      kind: "file",
      path: normalizedPath,
      label: fileLabel,
      depth: Math.max(0, segments.length - 1),
      fileCount: 1,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status,
    });
  }

  return items;
}

export function buildDiffReviewSideBySideRows(
  file: DiffReviewFile,
  options: { maxRows?: number } = {},
): DiffReviewSideBySideRow[] {
  const maxRows = options.maxRows ?? 24;
  const rows: DiffReviewSideBySideRow[] = [];

  for (
    let index = 0;
    index < file.lines.length && rows.length < maxRows;
    index += 1
  ) {
    const line = file.lines[index]!;
    const nextLine = file.lines[index + 1];

    if (line.kind === "remove" && nextLine?.kind === "add") {
      rows.push({
        id: `${file.id}:side-by-side:${index}`,
        kind: "change",
        before: line.text,
        after: nextLine.text,
      });
      index += 1;
      continue;
    }

    rows.push({
      id: `${file.id}:side-by-side:${index}`,
      kind: line.kind,
      before:
        line.kind === "add"
          ? null
          : line.kind === "hunk"
            ? line.text
            : line.text,
      after:
        line.kind === "remove"
          ? null
          : line.kind === "hunk"
            ? line.text
            : line.text,
    });
  }

  return rows;
}

export function parseApplyPatchReview(
  content: string,
): DiffReviewSummary | null {
  if (!content.includes("*** Begin Patch")) {
    return null;
  }

  const files: DiffReviewFile[] = [];
  const state: { current: DiffReviewFile | null } = { current: null };

  const ensureCurrent = (path: string, status: DiffReviewFile["status"]) => {
    const file = createDiffReviewFile(path, status, files.length);
    files.push(file);
    state.current = file;
    return file;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    if (rawLine.startsWith("*** Add File: ")) {
      ensureCurrent(rawLine.slice("*** Add File: ".length).trim(), "added");
      continue;
    }
    if (rawLine.startsWith("*** Update File: ")) {
      ensureCurrent(
        rawLine.slice("*** Update File: ".length).trim(),
        "modified",
      );
      continue;
    }
    if (rawLine.startsWith("*** Delete File: ")) {
      ensureCurrent(rawLine.slice("*** Delete File: ".length).trim(), "deleted");
      continue;
    }
    if (rawLine.startsWith("*** Move to: ")) {
      const current = state.current;
      if (current) {
        current.path = rawLine.slice("*** Move to: ".length).trim();
      }
      continue;
    }
    const current = state.current;
    if (!current) continue;
    if (rawLine.startsWith("@@")) {
      addDiffLine(current, { kind: "hunk", text: rawLine });
      continue;
    }
    if (rawLine.startsWith("+")) {
      addDiffLine(current, { kind: "add", text: rawLine.slice(1) });
      continue;
    }
    if (rawLine.startsWith("-")) {
      addDiffLine(current, { kind: "remove", text: rawLine.slice(1) });
      continue;
    }
    if (rawLine.startsWith(" ")) {
      pushDiffReviewLine(current, {
        kind: "context",
        text: rawLine.slice(1),
      });
    }
  }

  return summarizeDiffFiles(files);
}

export function parseUnifiedDiffReview(
  content: string,
): DiffReviewSummary | null {
  if (!/(^|\n)(diff --git |--- |\+\+\+ |@@ )/.test(content)) {
    return null;
  }

  const files: DiffReviewFile[] = [];
  const state: { current: DiffReviewFile | null } = { current: null };

  const ensureCurrent = (path: string) => {
    const current = state.current;
    if (current && current.path === path) return current;
    const file = createDiffReviewFile(path, "modified", files.length);
    files.push(file);
    state.current = file;
    return file;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    if (rawLine.startsWith("diff --git ")) {
      const parts = rawLine.trim().split(/\s+/);
      const nextPath = parts[3] ? stripDiffPathPrefix(parts[3]) : "diff";
      ensureCurrent(nextPath);
      continue;
    }

    if (rawLine.startsWith("--- ")) {
      const oldPath = stripDiffPathPrefix(rawLine.slice(4));
      if (oldPath !== "/dev/null" && !state.current) {
        ensureCurrent(oldPath);
      }
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      const nextPath = stripDiffPathPrefix(rawLine.slice(4));
      if (nextPath === "/dev/null") {
        const current = state.current;
        if (current) current.status = "deleted";
        continue;
      }
      const target = state.current ?? ensureCurrent(nextPath);
      target.path = nextPath;
      if (target.status === "unknown") {
        target.status = "modified";
      }
      continue;
    }

    if (!state.current && rawLine.startsWith("@@")) {
      ensureCurrent("diff");
    }
    const current = state.current;
    if (!current) continue;

    if (rawLine.startsWith("@@")) {
      addDiffLine(current, { kind: "hunk", text: rawLine });
      continue;
    }
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      if (current.deletions === 0 && current.status === "unknown") {
        current.status = "added";
      }
      addDiffLine(current, { kind: "add", text: rawLine.slice(1) });
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      addDiffLine(current, { kind: "remove", text: rawLine.slice(1) });
      continue;
    }
    if (rawLine.startsWith(" ")) {
      pushDiffReviewLine(current, {
        kind: "context",
        text: rawLine.slice(1),
      });
    }
  }

  return summarizeDiffFiles(files);
}

export function parseDiffReview(content: string): DiffReviewSummary | null {
  return parseApplyPatchReview(content) || parseUnifiedDiffReview(content);
}

export function renderDiffReviewLineForCanvas(line: DiffReviewLine): string {
  if (line.kind === "add") return `+${line.text}`;
  if (line.kind === "remove") return `-${line.text}`;
  if (line.kind === "hunk") return line.text;
  return ` ${line.text}`;
}

export function buildDiffFileCanvasContent(params: {
  file: DiffReviewFile;
  title: string;
  statusLabel: string;
  additionsLabel: string;
  deletionsLabel: string;
  hunksLabel: string;
}): string {
  const { file, title, statusLabel, additionsLabel, deletionsLabel, hunksLabel } =
    params;
  const diffLines = file.lines.map(renderDiffReviewLineForCanvas);

  return [
    `# ${title}`,
    "",
    `- ${statusLabel}`,
    `- ${additionsLabel}`,
    `- ${deletionsLabel}`,
    `- ${hunksLabel}`,
    "",
    "````diff",
    ...diffLines,
    "````",
  ].join("\n");
}

function resolveChangedBlocksDiffReviewSummary(
  record: Record<string, unknown>,
  fallbackPath: string,
): DiffReviewSummary | null {
  const rawBlocks = Array.isArray(record.changedBlocks)
    ? record.changedBlocks
    : [];
  if (rawBlocks.length === 0) {
    return null;
  }

  const file = createDiffReviewFile(fallbackPath, "modified", 0);
  for (const rawBlock of rawBlocks) {
    const block = asRecord(rawBlock);
    if (!block) continue;
    const changeType = readRecordString(block, ["changeType"]) ?? "updated";
    const blockId = readRecordString(block, ["blockId"]) ?? "block";
    const summary =
      readRecordString(block, ["summary"]) ?? `${changeType}: ${blockId}`;
    addDiffLine(file, { kind: "hunk", text: summary });

    const beforeText = readRecordString(block, ["beforeText"]);
    const afterText = readRecordString(block, ["afterText"]);
    if (beforeText && changeType !== "added") {
      addDiffLine(file, { kind: "remove", text: beforeText });
    }
    if (afterText && changeType !== "removed") {
      addDiffLine(file, { kind: "add", text: afterText });
    }

    if (changeType === "added") {
      file.status = file.status === "unknown" ? "added" : file.status;
    } else if (changeType === "removed") {
      file.status = file.status === "unknown" ? "deleted" : file.status;
    } else {
      file.status = "modified";
    }
  }

  file.additions =
    readRecordNumber(record, ["addedCount"]) ?? file.additions;
  file.deletions =
    readRecordNumber(record, ["removedCount"]) ?? file.deletions;
  file.hunks = Math.max(
    file.hunks,
    readRecordNumber(record, ["updatedCount"]) ?? 0,
    readRecordNumber(record, ["movedCount"]) ?? 0,
  );

  return summarizeDiffFiles([file]);
}

function resolveChangesDiffReviewSummary(
  record: Record<string, unknown>,
  fallbackPath: string,
): DiffReviewSummary | null {
  const changes = readStringArray(record.changes);
  const summary = readRecordString(record, ["summary", "diff_summary"]);
  const lines = summary ? [summary, ...changes] : changes;
  if (lines.length === 0) {
    return null;
  }

  const file = createDiffReviewFile(fallbackPath, "modified", 0);
  for (const line of lines) {
    addDiffLine(file, { kind: "hunk", text: line });
  }
  return summarizeDiffFiles([file]);
}

function resolveStructuredDiffReviewSummary(params: {
  value: unknown;
  fallbackPath?: string | null;
}): DiffReviewSummary | null {
  const { value, fallbackPath } = params;
  if (typeof value === "string") {
    return parseDiffReview(value);
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const key of ["patch", "diff", "unified_diff", "unifiedDiff"]) {
    const text = readRecordString(record, [key]);
    if (!text) continue;
    const summary = parseDiffReview(text);
    if (summary) return summary;
  }

  const normalizedFallbackPath =
    fallbackPath?.trim() ||
    readRecordString(record, ["path", "file", "filePath", "targetPath"]) ||
    "diff";

  return (
    resolveChangedBlocksDiffReviewSummary(record, normalizedFallbackPath) ||
    resolveChangesDiffReviewSummary(record, normalizedFallbackPath)
  );
}

export function resolveDiffReviewSummaryFromCandidates(
  candidates: unknown[],
  options: { fallbackPath?: string | null } = {},
): DiffReviewSummary | null {
  for (const candidate of candidates) {
    const summary = resolveStructuredDiffReviewSummary({
      value: candidate,
      fallbackPath: options.fallbackPath,
    });
    if (summary) {
      return summary;
    }
  }
  return null;
}
