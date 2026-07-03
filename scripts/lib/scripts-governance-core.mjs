import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const SCRIPTS_DIR = "scripts";
export const BASELINE_PATH = path.join(
  SCRIPTS_DIR,
  "script-root-governance-baseline.json",
);

function toSet(value) {
  if (value instanceof Set) {
    return value;
  }
  return new Set(Array.isArray(value) ? value : []);
}

export function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function readBaseline(baselinePath = BASELINE_PATH) {
  const raw = fs.readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    policy: typeof parsed.policy === "string" ? parsed.policy : "",
    allowedRootFiles: toSet(parsed.allowedRootFiles),
    allowedDirectories: toSet(parsed.allowedDirectories),
    ignoredLocalDirectories: toSet(parsed.ignoredLocalDirectories),
  };
}

export function listCurrentRootFiles(scriptsDir = SCRIPTS_DIR) {
  return fs
    .readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(scriptsDir, entry.name))
    .sort();
}

export function listCurrentDirectories(scriptsDir = SCRIPTS_DIR) {
  return fs
    .readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join(scriptsDir, entry.name))
    .sort();
}

export function listGitTrackedFiles(scriptsDir = SCRIPTS_DIR) {
  try {
    const output = execFileSync("git", ["ls-files", "--", `${scriptsDir}/*`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(
      output
        .split(/\r?\n/)
        .map((line) => normalizeRepoPath(line.trim()))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function listCurrentScriptFiles(scriptsDir = SCRIPTS_DIR) {
  const files = [];
  const stack = [scriptsDir];

  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(normalizeRepoPath(entryPath));
      }
    }
  }

  return files.sort();
}

export function inferRootBucket(filePath) {
  const fileName = path.basename(filePath);
  if (fileName === "README.md" || fileName.includes("governance")) {
    return "governance";
  }
  if (fileName.startsWith("i18n-") || fileName.includes("translation")) {
    return "i18n";
  }
  if (fileName.startsWith("electron-") || fileName.includes("electron")) {
    return "electron";
  }
  if (fileName.startsWith("plugin")) {
    return "plugin";
  }
  if (fileName.startsWith("agent-qc")) {
    return "agent-qc";
  }
  if (fileName.startsWith("agent-runtime") || fileName.startsWith("agent-")) {
    return "agent-runtime";
  }
  if (fileName.startsWith("app-server")) {
    return "app-server";
  }
  if (fileName.startsWith("harness-")) {
    return "harness";
  }
  if (fileName.includes("smoke") || fileName.includes("e2e")) {
    return "smoke";
  }
  if (
    fileName.startsWith("check-") ||
    fileName.startsWith("verify-") ||
    fileName.startsWith("quality-") ||
    fileName.startsWith("run-") ||
    fileName.startsWith("report-")
  ) {
    return "quality";
  }
  if (fileName.includes("release") || fileName.includes("updater")) {
    return "release";
  }
  return "misc";
}

export function countByBucket(files) {
  const counts = new Map();
  for (const file of files) {
    const bucket = inferRootBucket(file);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function firstLevelScriptDirectory(filePath) {
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  if (parts[0] !== SCRIPTS_DIR || parts.length < 3) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function fileExtension(filePath) {
  const extension = path.extname(filePath);
  return extension || "[no-ext]";
}

export function isPythonCachePath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return normalized.endsWith(".pyc") || normalized.includes("/__pycache__/");
}

export function summarizeDirectories(files) {
  const summaries = new Map();

  for (const file of files) {
    const directory = firstLevelScriptDirectory(file);
    if (!directory) {
      continue;
    }
    const summary = summaries.get(directory) ?? {
      directory,
      fileCount: 0,
      extensions: new Map(),
    };
    summary.fileCount += 1;
    const extension = fileExtension(file);
    summary.extensions.set(
      extension,
      (summary.extensions.get(extension) ?? 0) + 1,
    );
    summaries.set(directory, summary);
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      extensions: [...summary.extensions.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    }))
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

export function analyzeScriptsGovernance({
  baseline,
  currentRootFiles,
  currentDirectories,
  currentFiles,
  gitTrackedFiles,
}) {
  const allowedRootFiles = toSet(baseline.allowedRootFiles);
  const allowedDirectories = toSet(baseline.allowedDirectories);
  const ignoredLocalDirectories = toSet(baseline.ignoredLocalDirectories);
  const trackedFiles = toSet(gitTrackedFiles);

  const newRootFiles = currentRootFiles.filter(
    (file) => !allowedRootFiles.has(file),
  );
  const trackedNewRootFiles = newRootFiles.filter((file) =>
    trackedFiles.has(file),
  );
  const untrackedNewRootFiles = newRootFiles.filter(
    (file) => !trackedFiles.has(file),
  );
  const retiredRootFiles = [...allowedRootFiles].filter(
    (file) => !currentRootFiles.includes(file),
  );

  const currentTrackedDirectories = new Set(
    [...trackedFiles]
      .map(firstLevelScriptDirectory)
      .filter(
        (directory) => directory && currentDirectories.includes(directory),
      ),
  );
  const trackedNewDirectories = [...currentTrackedDirectories]
    .filter((directory) => !allowedDirectories.has(directory))
    .sort();
  const untrackedNewDirectories = currentDirectories.filter(
    (directory) =>
      !allowedDirectories.has(directory) &&
      !ignoredLocalDirectories.has(directory) &&
      !currentTrackedDirectories.has(directory),
  );
  const ignoredLocalDirectoryHits = currentDirectories.filter((directory) =>
    ignoredLocalDirectories.has(directory),
  );
  const retiredDirectories = [...allowedDirectories].filter(
    (directory) => !currentDirectories.includes(directory),
  );
  const pythonCacheFiles = currentFiles.filter(isPythonCachePath);
  const trackedPythonCacheFiles = pythonCacheFiles.filter((file) =>
    trackedFiles.has(file),
  );
  const ignoredLocalFiles = pythonCacheFiles.filter(
    (file) => !trackedFiles.has(file),
  );

  return {
    policy: baseline.policy || "scripts root is frozen",
    rootFileCount: currentRootFiles.length,
    directoryCount: currentDirectories.length,
    trackedNewRootFiles,
    untrackedNewRootFiles,
    retiredRootFiles,
    trackedNewDirectories,
    untrackedNewDirectories,
    ignoredLocalDirectories: ignoredLocalDirectoryHits,
    ignoredLocalFiles,
    retiredDirectories,
    trackedPythonCacheFiles,
    rootBucketCounts: countByBucket(currentRootFiles),
    directorySummaries: summarizeDirectories(currentFiles),
    hasFailures:
      trackedNewRootFiles.length > 0 ||
      trackedNewDirectories.length > 0 ||
      trackedPythonCacheFiles.length > 0,
  };
}

export function createScriptsGovernanceReport() {
  return analyzeScriptsGovernance({
    baseline: readBaseline(),
    currentRootFiles: listCurrentRootFiles(),
    currentDirectories: listCurrentDirectories(),
    currentFiles: listCurrentScriptFiles(),
    gitTrackedFiles: listGitTrackedFiles(),
  });
}
