import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOTS = ["src", "lime-rs", "scripts", "packages"];
const SCANNED_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".mts",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
]);
const SKIPPED_DIRS = new Set([
  ".git",
  ".lime",
  ".next",
  "dist",
  "node_modules",
  "target",
]);
const SKIPPED_FILE_SUFFIXES = [
  ".lock",
  ".md",
  ".snap",
  ".test.cjs",
  ".test.cts",
  ".test.js",
  ".test.jsx",
  ".test.mjs",
  ".test.mts",
  ".test.rs",
  ".test.ts",
  ".test.tsx",
  ".spec.cjs",
  ".spec.cts",
  ".spec.js",
  ".spec.jsx",
  ".spec.mjs",
  ".spec.mts",
  ".spec.rs",
  ".spec.ts",
  ".spec.tsx",
];
const DEFAULT_TOOL_SURFACE_PATHS = [
  "lime-rs/crates/agent/src/agent_tools",
  "lime-rs/crates/tool-runtime/src",
];

export function managedObjectiveForbiddenSurfaceTokens() {
  return [
    ["goal", "runtime"].join("_"),
    ["objective", "scheduler"].join("_"),
    ["objective", "queue"].join("_"),
    ["objective", "evidence", "pack"].join("_"),
  ];
}

export function managedObjectiveToolSurfaceForbiddenCommands() {
  return [
    "agent_runtime_get_objective",
    "agent_runtime_set_objective",
    "agent_runtime_update_objective_status",
    "agent_runtime_clear_objective",
    "agent_runtime_continue_objective",
    "agent_runtime_audit_objective",
  ];
}

export function scanManagedObjectiveForbiddenSurfaces({
  repoRoot,
  roots = DEFAULT_ROOTS,
  tokens = managedObjectiveForbiddenSurfaceTokens(),
} = {}) {
  const root = path.resolve(repoRoot || process.cwd());
  const violations = [];

  for (const relativeRoot of roots) {
    walkPath(path.join(root, relativeRoot), root, tokens, violations);
  }

  return violations.sort((left, right) =>
    left.relativePath === right.relativePath
      ? left.token.localeCompare(right.token)
      : left.relativePath.localeCompare(right.relativePath),
  );
}

export function scanManagedObjectiveToolSurfaceCommands({
  repoRoot,
  paths = DEFAULT_TOOL_SURFACE_PATHS,
  commandNames = managedObjectiveToolSurfaceForbiddenCommands(),
} = {}) {
  const root = path.resolve(repoRoot || process.cwd());
  const violations = [];

  for (const relativePath of paths) {
    walkPath(path.join(root, relativePath), root, commandNames, violations);
  }

  return violations.sort((left, right) =>
    left.relativePath === right.relativePath
      ? left.token.localeCompare(right.token)
      : left.relativePath.localeCompare(right.relativePath),
  );
}

function walkPath(currentPath, repoRoot, tokens, violations) {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const stat = fs.statSync(currentPath);
  if (stat.isDirectory()) {
    const baseName = path.basename(currentPath);
    if (SKIPPED_DIRS.has(baseName)) {
      return;
    }

    for (const entry of fs.readdirSync(currentPath)) {
      walkPath(path.join(currentPath, entry), repoRoot, tokens, violations);
    }
    return;
  }

  if (!stat.isFile() || !shouldScanFile(currentPath)) {
    return;
  }

  const relativePath = path.relative(repoRoot, currentPath).replaceAll("\\", "/");
  const content = fs.readFileSync(currentPath, "utf8");
  for (const token of tokens) {
    if (content.includes(token)) {
      violations.push({ relativePath, token });
    }
  }
}

function shouldScanFile(filePath) {
  const baseName = path.basename(filePath);
  if (SKIPPED_FILE_SUFFIXES.some((suffix) => baseName.endsWith(suffix))) {
    return false;
  }
  return SCANNED_EXTENSIONS.has(path.extname(baseName));
}
