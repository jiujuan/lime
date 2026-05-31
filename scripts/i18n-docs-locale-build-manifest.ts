#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type DocsLocaleBuildManifestFormat = "text" | "json";

type DocsLocaleBuildWorkflowStatus = "blocked" | "missing-scope" | "ready";
type DocsLocaleBuildAction =
  | "block-missing-source"
  | "block-required-companion"
  | "include-companion"
  | "queue-pilot-companion"
  | "queue-source-only";

interface DocsLocaleBuildScopeItem {
  enUSPath: string | null;
  kind: string | null;
  path: string | null;
  priority: string | null;
}

interface DocsLocaleBuildTarget {
  action: DocsLocaleBuildAction;
  companionExists: boolean;
  companionPath: string | null;
  locale: string;
}

interface DocsLocaleBuildEntry {
  kind: string | null;
  path: string;
  priority: string | null;
  sourceExists: boolean;
  targets: DocsLocaleBuildTarget[];
}

export interface DocsLocaleBuildManifest {
  docsContent: {
    englishCompanionFileCount: number;
    routeEmissionAllowed: boolean;
  };
  entries: DocsLocaleBuildEntry[];
  repoRoot: string;
  schemaVersion: string;
  scopePath: string;
  sourceLocale: string | null;
  summary: {
    blockedEntryCount: number;
    companionEntryCount: number;
    entryCount: number;
    missingSourceCount: number;
    pilotCompanionMissingCount: number;
    requiredCompanionMissingCount: number;
    routeEmissionAllowed: boolean;
    sourceOnlyCandidateCount: number;
    targetLocaleCount: number;
    workflowStatus: DocsLocaleBuildWorkflowStatus;
  };
  targetLocales: string[];
}

interface CliOptions {
  check: boolean;
  format: DocsLocaleBuildManifestFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SCOPE_PATH =
  "internal/roadmap/i18n/release-docs-translation-scope.json";
const DEFAULT_DOCS_CONTENT_DIR = "docs/content";

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function dirExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!fileExists(filePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readScopeItems(
  scope: Record<string, unknown> | null,
): DocsLocaleBuildScopeItem[] {
  const rawItems = Array.isArray(scope?.items) ? scope.items : [];
  return rawItems.filter(isRecord).map((item) => ({
    enUSPath: readString(item.enUSPath),
    kind: readString(item.kind),
    path: readString(item.path),
    priority: readString(item.priority),
  }));
}

function collectFiles(dirPath: string): string[] {
  if (!dirExists(dirPath)) {
    return [];
  }

  const result: string[] = [];
  const stack: string[] = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        result.push(entryPath);
      }
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function isEnglishMarkdownCompanion(filePath: string): boolean {
  return /\.(en|en-US)\.mdx?$/i.test(normalizePath(filePath));
}

function resolveTargetAction(
  item: DocsLocaleBuildScopeItem,
  sourceExists: boolean,
  companionExists: boolean,
): DocsLocaleBuildAction {
  if (!sourceExists) {
    return "block-missing-source";
  }
  if (companionExists) {
    return "include-companion";
  }
  if (item.priority === "required") {
    return "block-required-companion";
  }
  if (item.priority === "pilot") {
    return "queue-pilot-companion";
  }
  return "queue-source-only";
}

function buildTargets(
  repoRoot: string,
  item: DocsLocaleBuildScopeItem,
  targetLocales: string[],
  sourceExists: boolean,
): DocsLocaleBuildTarget[] {
  return targetLocales.map((locale) => {
    const companionPath = locale === "en-US" ? item.enUSPath : null;
    const companionExists = Boolean(
      companionPath && fileExists(path.join(repoRoot, companionPath)),
    );
    return {
      action: resolveTargetAction(item, sourceExists, companionExists),
      companionExists,
      companionPath,
      locale,
    };
  });
}

export function buildDocsLocaleBuildManifest(
  options: Pick<CliOptions, "repoRoot">,
): DocsLocaleBuildManifest {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const scopePath = path.join(repoRoot, DEFAULT_SCOPE_PATH);
  const scope = readJsonObject(scopePath);
  const sourceLocale = readString(scope?.sourceLocale);
  const targetLocales = readStringArray(scope?.targetLocales);
  const items = readScopeItems(scope);
  const docsContentDir = path.join(repoRoot, DEFAULT_DOCS_CONTENT_DIR);
  const englishCompanionFileCount = collectFiles(docsContentDir).filter(
    isEnglishMarkdownCompanion,
  ).length;
  const entries: DocsLocaleBuildEntry[] = [];

  for (const item of items) {
    if (!item.path) {
      continue;
    }
    const sourceExists = fileExists(path.join(repoRoot, item.path));
    entries.push({
      kind: item.kind,
      path: item.path,
      priority: item.priority,
      sourceExists,
      targets: buildTargets(repoRoot, item, targetLocales, sourceExists),
    });
  }

  const missingSourceCount = entries.filter(
    (entry) => !entry.sourceExists,
  ).length;
  const requiredCompanionMissingCount = entries.filter(
    (entry) =>
      entry.priority === "required" &&
      entry.targets.some((target) => target.action === "block-required-companion"),
  ).length;
  const pilotCompanionMissingCount = entries.filter((entry) =>
    entry.targets.some((target) => target.action === "queue-pilot-companion"),
  ).length;
  const sourceOnlyCandidateCount = entries.filter((entry) =>
    entry.targets.some((target) => target.action === "queue-source-only"),
  ).length;
  const companionEntryCount = entries.filter((entry) =>
    entry.targets.some((target) => target.action === "include-companion"),
  ).length;
  const blockedEntryCount = missingSourceCount + requiredCompanionMissingCount;
  const workflowStatus: DocsLocaleBuildWorkflowStatus = !scope
    ? "missing-scope"
    : blockedEntryCount > 0
      ? "blocked"
      : "ready";

  return {
    docsContent: {
      englishCompanionFileCount,
      routeEmissionAllowed: false,
    },
    entries,
    repoRoot,
    schemaVersion: "lime.i18n.docsLocaleBuildManifest.v1",
    scopePath: DEFAULT_SCOPE_PATH,
    sourceLocale,
    summary: {
      blockedEntryCount,
      companionEntryCount,
      entryCount: entries.length,
      missingSourceCount,
      pilotCompanionMissingCount,
      requiredCompanionMissingCount,
      routeEmissionAllowed: false,
      sourceOnlyCandidateCount,
      targetLocaleCount: targetLocales.length,
      workflowStatus,
    },
    targetLocales,
  };
}

export function formatDocsLocaleBuildManifest(
  manifest: DocsLocaleBuildManifest,
  format: DocsLocaleBuildManifestFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  return `${[
    "[i18n:docs-locale] build manifest",
    `workflow status: ${manifest.summary.workflowStatus}`,
    `source locale: ${manifest.sourceLocale ?? "(missing)"}`,
    `target locales: ${manifest.targetLocales.join(", ") || "(none)"}`,
    `entries: ${manifest.summary.entryCount}`,
    `companion entries: ${manifest.summary.companionEntryCount}`,
    `source-only candidates: ${manifest.summary.sourceOnlyCandidateCount}`,
    `pilot companion missing: ${manifest.summary.pilotCompanionMissingCount}`,
    `required companion missing: ${manifest.summary.requiredCompanionMissingCount}`,
    `missing sources: ${manifest.summary.missingSourceCount}`,
    `docs/content route emission: ${
      manifest.summary.routeEmissionAllowed ? "enabled" : "disabled"
    }`,
  ].join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n-docs-locale-build-manifest.ts [options]

生成 docs locale build manifest，用于发布材料 / 官网文档 / 帮助文档的构建前翻译审计。
该脚本不会写入 docs/content 英文路由，也不会发布文档。

Options:
  --format json|text   输出格式，默认 text
  --output <file>      将输出写入文件
  --repo-root <path>   指定仓库根目录，默认当前仓库
  --check              若 manifest 缺 scope 或存在 required blocker，则返回非 0
  --help, -h           显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions & { help?: boolean } {
  const options: CliOptions & { help?: boolean } = {
    check: false,
    format: "text",
    repoRoot: DEFAULT_REPO_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--format") {
      const next = argv[index + 1];
      if (next !== "json" && next !== "text") {
        throw new Error("--format 只接受 json 或 text");
      }
      options.format = next;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--output 需要文件路径");
      }
      options.output = next;
      index += 1;
      continue;
    }
    if (arg === "--repo-root") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--repo-root 需要路径");
      }
      options.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

export function runCli(argv: string[] = process.argv.slice(2)): number {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const manifest = buildDocsLocaleBuildManifest({
    repoRoot: options.repoRoot,
  });
  const output = formatDocsLocaleBuildManifest(manifest, options.format);

  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), {
      recursive: true,
    });
    fs.writeFileSync(path.resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  return options.check && manifest.summary.workflowStatus !== "ready" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
