#!/usr/bin/env tsx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type ReleaseDocsWorkflowReportFormat = "text" | "json";

export interface ReleaseDocsWorkflowReport {
  docsSite: {
    buildScripts: string[];
    contentEnglishCompanionFiles: string[];
    contentFileCount: number;
    hasI18nConfig: boolean;
    hasLocaleRouting: boolean;
    packageJsonExists: boolean;
    topLevelContentDirs: string[];
    unscopedContentSourceFiles: string[];
  };
  releaseDocsTranslationScope: {
    companionFiles: string[];
    existingEnglishCompanionCount: number;
    existingSourceCount: number;
    itemCount: number;
    missingEnglishCompanions: string[];
    missingPilotEnglishCompanions: string[];
    missingSources: string[];
    orphanEnglishCompanions: string[];
    path: string;
    pilotCount: number;
    requiredCount: number;
    schemaVersion: string | null;
    scopedSourceFiles: string[];
    sourceLocale: string | null;
    sourceOnlyCount: number;
    sourceOnlyWithoutCompanionCount: number;
    sourceOnlyWithoutCompanions: string[];
    targetLocales: string[];
  };
  releaseNotes: {
    englishCompanionExists: boolean;
    englishCompanionVersion: string | null;
    sourceVersion: string | null;
    sourceExists: boolean;
    versionsMatch: boolean;
  };
  repoRoot: string;
  rootReadme: {
    englishCompanionExists: boolean;
    englishLinksReleaseNotesCompanion: boolean;
    sourceExists: boolean;
  };
  schemaVersion: string;
  summary: {
    contentFileCount: number;
    docsContentEnglishCompanionFileCount: number;
    docsTranslationWorkflowPresent: boolean;
    docsUnscopedContentSourceFileCount: number;
    hasBilingualRootReadme: boolean;
    hasDocsLocaleWorkflow: boolean;
    hasReleaseDocsTranslationScope: boolean;
    hasReleaseNotesCompanion: boolean;
    hasReleaseNotesCompanionVersionMatch: boolean;
    readmeEnglishLinksReleaseNotesCompanion: boolean;
    releaseDocsPilotCompanionMissingCount: number;
    releaseDocsOrphanCompanionCount: number;
    releaseDocsRequiredCompanionMissingCount: number;
    releaseDocsScopeItemCount: number;
    releaseDocsSourceOnlyWithoutCompanionCount: number;
  };
}

interface CliOptions {
  format: ReleaseDocsWorkflowReportFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPO_ROOT = REPO_ROOT;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function displayPath(filePath: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, filePath);
  return normalizePath(relative && !relative.startsWith("..") ? relative : filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return parsed;
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function dirExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
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
        continue;
      }
      if (entry.isFile()) {
        result.push(entryPath);
      }
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function listTopLevelDirs(dirPath: string): string[] {
  if (!dirExists(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function isEnglishMarkdownCompanion(filePath: string): boolean {
  return /\.(en|en-US)\.mdx?$/i.test(normalizePath(filePath));
}

function isMarkdownContentSource(filePath: string): boolean {
  return /\.mdx?$/i.test(filePath) && !isEnglishMarkdownCompanion(filePath);
}

function readPackageScripts(filePath: string): string[] {
  if (!fileExists(filePath)) {
    return [];
  }
  const json = readJsonObject(filePath);
  const scripts = isRecord(json.scripts) ? json.scripts : {};
  return Object.keys(scripts).sort((left, right) => left.localeCompare(right));
}

function hasConfigMarkers(filePath: string, markers: string[]): boolean {
  if (!fileExists(filePath)) {
    return false;
  }
  const content = fs.readFileSync(filePath, "utf8");
  return markers.every((marker) => content.includes(marker));
}

function readText(filePath: string): string {
  return fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function parseReleaseNotesVersion(filePath: string): string | null {
  const content = readText(filePath);
  const match = content.match(/^##\s+Lime\s+([^\s]+)\s*$/m);
  return match?.[1] ?? null;
}

function readOptionalJsonObject(filePath: string): Record<string, unknown> | null {
  if (!fileExists(filePath)) {
    return null;
  }
  return readJsonObject(filePath);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function analyzeTranslationScope(
  repoRoot: string,
  scopePath: string,
  companionsDir: string,
): ReleaseDocsWorkflowReport["releaseDocsTranslationScope"] {
  const scope = readOptionalJsonObject(scopePath);
  const items = Array.isArray(scope?.items) ? scope.items : [];
  const companionFiles = collectFiles(companionsDir)
    .filter(isEnglishMarkdownCompanion)
    .map((filePath) => displayPath(filePath, repoRoot));
  const scopedSourcePaths = new Set<string>();
  const referencedEnglishCompanions = new Set<string>();
  const missingSources: string[] = [];
  const missingEnglishCompanions: string[] = [];
  const missingPilotEnglishCompanions: string[] = [];
  const sourceOnlyWithoutCompanions: string[] = [];
  let existingSourceCount = 0;
  let existingEnglishCompanionCount = 0;
  let pilotCount = 0;
  let requiredCount = 0;
  let sourceOnlyCount = 0;

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }
    const sourcePath = readString(item.path);
    const priority = readString(item.priority);
    const enUSPath = readString(item.enUSPath);
    if (enUSPath) {
      referencedEnglishCompanions.add(normalizePath(enUSPath));
    }
    if (sourcePath) {
      scopedSourcePaths.add(normalizePath(sourcePath));
    }

    if (priority === "required") {
      requiredCount += 1;
    } else if (priority === "pilot") {
      pilotCount += 1;
    } else if (priority === "source-only") {
      sourceOnlyCount += 1;
    }

    if (sourcePath && fileExists(path.join(repoRoot, sourcePath))) {
      existingSourceCount += 1;
    } else if (sourcePath) {
      missingSources.push(sourcePath);
    }

    if (priority === "required") {
      if (enUSPath && fileExists(path.join(repoRoot, enUSPath))) {
        existingEnglishCompanionCount += 1;
      } else if (sourcePath) {
        missingEnglishCompanions.push(sourcePath);
      }
    } else if (priority === "pilot") {
      if (enUSPath && fileExists(path.join(repoRoot, enUSPath))) {
        existingEnglishCompanionCount += 1;
      } else if (sourcePath) {
        missingPilotEnglishCompanions.push(sourcePath);
      }
    } else if (priority === "source-only" && sourcePath && !enUSPath) {
      sourceOnlyWithoutCompanions.push(sourcePath);
    } else if (enUSPath && fileExists(path.join(repoRoot, enUSPath))) {
      existingEnglishCompanionCount += 1;
    }
  }

  return {
    companionFiles,
    existingEnglishCompanionCount,
    existingSourceCount,
    itemCount: items.filter(isRecord).length,
    missingEnglishCompanions,
    missingPilotEnglishCompanions,
    missingSources,
    orphanEnglishCompanions: companionFiles.filter(
      (filePath) => !referencedEnglishCompanions.has(filePath),
    ),
    path: displayPath(scopePath, repoRoot),
    pilotCount,
    requiredCount,
    schemaVersion: readString(scope?.schemaVersion),
    scopedSourceFiles: Array.from(scopedSourcePaths).sort((left, right) => left.localeCompare(right)),
    sourceLocale: readString(scope?.sourceLocale),
    sourceOnlyCount,
    sourceOnlyWithoutCompanionCount: sourceOnlyWithoutCompanions.length,
    sourceOnlyWithoutCompanions,
    targetLocales: readStringArray(scope?.targetLocales),
  };
}

export function analyzeReleaseDocsWorkflowReport(
  options: Pick<CliOptions, "repoRoot">,
): ReleaseDocsWorkflowReport {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const rootReadmePath = path.join(repoRoot, "README.md");
  const rootReadmeEnPath = path.join(repoRoot, "README.en.md");
  const releaseNotesPath = path.join(repoRoot, "RELEASE_NOTES.md");
  const releaseNotesEnPath = path.join(repoRoot, "RELEASE_NOTES.en.md");
  const docsDir = path.join(repoRoot, "docs");
  const docsPackageJsonPath = path.join(docsDir, "package.json");
  const docsNuxtConfigPath = path.join(docsDir, "nuxt.config.ts");
  const docsContentDir = path.join(docsDir, "content");
  const docsAipromptsDir = path.join(docsDir, "aiprompts");
  const docsDevelopDir = path.join(docsDir, "develop");
  const docsOpsPath = path.join(docsDir, "ops.md");
  const docsBussnissDir = path.join(docsDir, "bussniss");
  const docsOemDir = path.join(docsDir, "oem");
  const releaseDocsTranslationScopePath = path.join(
    repoRoot,
    "docs",
    "roadmap",
    "i18n",
    "release-docs-translation-scope.json",
  );
  const releaseDocsCompanionsDir = path.join(
    repoRoot,
    "docs",
    "roadmap",
    "i18n",
    "companions",
  );

  const contentFiles = collectFiles(docsContentDir);
  const contentEnglishCompanionFiles = contentFiles
    .filter(isEnglishMarkdownCompanion)
    .map((filePath) => displayPath(filePath, repoRoot));
  const contentSourceFiles = contentFiles
    .filter(isMarkdownContentSource)
    .map((filePath) => displayPath(filePath, repoRoot));
  const contentFileCount = contentFiles.length;
  const topLevelContentDirs = listTopLevelDirs(docsContentDir);
  const packageScripts = readPackageScripts(docsPackageJsonPath);
  const hasI18nConfig = hasConfigMarkers(docsNuxtConfigPath, ["i18n", "locales"]);
  const hasLocaleRouting = hasConfigMarkers(docsNuxtConfigPath, ["locales", "baseURL"]);
  const hasTranslationScripts = packageScripts.some((script) =>
    /i18n|locale|translation/.test(script),
  );
  const sourceReleaseNotesVersion = parseReleaseNotesVersion(releaseNotesPath);
  const englishReleaseNotesVersion = parseReleaseNotesVersion(releaseNotesEnPath);
  const releaseNotesVersionsMatch =
    Boolean(sourceReleaseNotesVersion) &&
    sourceReleaseNotesVersion === englishReleaseNotesVersion;
  const readmeEnglishLinksReleaseNotesCompanion = readText(rootReadmeEnPath).includes(
    "./RELEASE_NOTES.en.md",
  );
  const releaseDocsTranslationScope = analyzeTranslationScope(
    repoRoot,
    releaseDocsTranslationScopePath,
    releaseDocsCompanionsDir,
  );
  const scopedSourceFileSet = new Set(releaseDocsTranslationScope.scopedSourceFiles);
  const unscopedContentSourceFiles = contentSourceFiles.filter(
    (filePath) => !scopedSourceFileSet.has(filePath),
  );
  const hasDocsSurface =
    dirExists(docsContentDir) ||
    dirExists(docsAipromptsDir) ||
    dirExists(docsDevelopDir) ||
    fileExists(docsOpsPath) ||
    dirExists(docsBussnissDir) ||
    dirExists(docsOemDir);

  return {
    docsSite: {
      buildScripts: packageScripts,
      contentEnglishCompanionFiles,
      contentFileCount,
      hasI18nConfig,
      hasLocaleRouting,
      packageJsonExists: fileExists(docsPackageJsonPath),
      topLevelContentDirs,
      unscopedContentSourceFiles,
    },
    releaseDocsTranslationScope,
    releaseNotes: {
      englishCompanionExists: fileExists(releaseNotesEnPath),
      englishCompanionVersion: englishReleaseNotesVersion,
      sourceVersion: sourceReleaseNotesVersion,
      sourceExists: fileExists(releaseNotesPath),
      versionsMatch: releaseNotesVersionsMatch,
    },
    repoRoot,
    rootReadme: {
      englishCompanionExists: fileExists(rootReadmeEnPath),
      englishLinksReleaseNotesCompanion: readmeEnglishLinksReleaseNotesCompanion,
      sourceExists: fileExists(rootReadmePath),
    },
    schemaVersion: "lime.i18n.releaseDocsWorkflowReport.v1",
    summary: {
      contentFileCount,
      docsContentEnglishCompanionFileCount: contentEnglishCompanionFiles.length,
      docsTranslationWorkflowPresent: hasTranslationScripts || hasI18nConfig || hasLocaleRouting,
      docsUnscopedContentSourceFileCount: unscopedContentSourceFiles.length,
      hasBilingualRootReadme: fileExists(rootReadmePath) && fileExists(rootReadmeEnPath),
      hasDocsLocaleWorkflow: hasI18nConfig || hasLocaleRouting,
      hasReleaseDocsTranslationScope: fileExists(releaseDocsTranslationScopePath),
      hasReleaseNotesCompanion: fileExists(releaseNotesEnPath),
      hasReleaseNotesCompanionVersionMatch: releaseNotesVersionsMatch,
      readmeEnglishLinksReleaseNotesCompanion,
      releaseDocsPilotCompanionMissingCount:
        releaseDocsTranslationScope.missingPilotEnglishCompanions.length,
      releaseDocsOrphanCompanionCount:
        releaseDocsTranslationScope.orphanEnglishCompanions.length,
      releaseDocsRequiredCompanionMissingCount:
        releaseDocsTranslationScope.missingEnglishCompanions.length,
      releaseDocsScopeItemCount: releaseDocsTranslationScope.itemCount,
      releaseDocsSourceOnlyWithoutCompanionCount:
        releaseDocsTranslationScope.sourceOnlyWithoutCompanionCount,
    },
  };
}

export function formatReleaseDocsWorkflowReport(
  report: ReleaseDocsWorkflowReport,
  format: ReleaseDocsWorkflowReportFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "[i18n:release-docs] workflow inventory",
    `repoRoot: ${displayPath(report.repoRoot, report.repoRoot)}`,
    `root README companion pair: ${report.summary.hasBilingualRootReadme ? "yes" : "no"}`,
    `English README links release notes companion: ${report.summary.readmeEnglishLinksReleaseNotesCompanion ? "yes" : "no"}`,
    `release notes companion: ${report.summary.hasReleaseNotesCompanion ? "yes" : "no"}`,
    `release notes version match: ${report.summary.hasReleaseNotesCompanionVersionMatch ? "yes" : "no"}`,
    `translation scope manifest: ${report.summary.hasReleaseDocsTranslationScope ? "yes" : "no"}`,
    `translation scope items: ${report.summary.releaseDocsScopeItemCount}`,
    `required companion missing: ${report.summary.releaseDocsRequiredCompanionMissingCount}`,
    `pilot companion missing: ${report.summary.releaseDocsPilotCompanionMissingCount}`,
    `orphan companion files: ${report.summary.releaseDocsOrphanCompanionCount}`,
    `source-only without companion: ${report.summary.releaseDocsSourceOnlyWithoutCompanionCount}`,
    `docs locale workflow: ${report.summary.hasDocsLocaleWorkflow ? "yes" : "no"}`,
    `docs translation scripts: ${report.summary.docsTranslationWorkflowPresent ? "yes" : "no"}`,
    `docs/content files: ${report.summary.contentFileCount}`,
    `docs/content English companion files: ${report.summary.docsContentEnglishCompanionFileCount}`,
    `docs/content unscoped source files: ${report.summary.docsUnscopedContentSourceFileCount}`,
    `docs/content sections: ${report.docsSite.topLevelContentDirs.join(", ") || "(none)"}`,
    `docs package.json scripts: ${report.docsSite.buildScripts.join(", ") || "(none)"}`,
    `docs/nuxt.config.ts i18n markers: ${report.docsSite.hasI18nConfig ? "yes" : "no"}`,
  ];

  return `${lines.join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n-release-docs-workflow-report.ts [options]

只读汇总发布材料、官网文档与帮助文档的翻译工作流事实源。
不会修改文件，也不会打包或发布文档。

Options:
  --format json|text   输出格式，默认 text
  --output <file>      将输出写入文件
  --repo-root <path>   指定仓库根目录，默认当前仓库
  --help, -h           显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions & { help?: boolean } {
  const options: CliOptions & { help?: boolean } = {
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

  const report = analyzeReleaseDocsWorkflowReport({
    repoRoot: options.repoRoot,
  });
  const output = formatReleaseDocsWorkflowReport(report, options.format);

  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(path.resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
