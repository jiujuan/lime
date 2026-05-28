#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type AppMetadataLocaleBuildManifestFormat = "text" | "json";

type AppMetadataLocaleWorkflowStatus = "blocked" | "missing-scope" | "ready";
type AppMetadataLocaleAction =
  | "block-missing-field"
  | "block-required-localized-value"
  | "copy-stable-field"
  | "include-localized-value"
  | "queue-source-only";

interface AppMetadataScopeItem {
  consumer: string | null;
  field: string | null;
  kind: string | null;
  localization: string | null;
  localizedValues: Record<string, unknown>;
  path: string | null;
  priority: string | null;
}

interface AppMetadataLocaleTarget {
  action: AppMetadataLocaleAction;
  locale: string;
  value: unknown;
}

interface AppMetadataLocaleEntry {
  consumer: string | null;
  field: string;
  fieldExists: boolean;
  kind: string | null;
  localization: string | null;
  path: string;
  priority: string | null;
  sourceValue: unknown;
  targets: AppMetadataLocaleTarget[];
}

export interface AppMetadataLocaleBuildManifest {
  entries: AppMetadataLocaleEntry[];
  repoRoot: string;
  schemaVersion: string;
  scope: {
    generatedConfigEmissionAllowed: boolean;
    manifestGenerationAllowed: boolean;
    path: string;
    workflowStatus: string | null;
  };
  sourceLocale: string | null;
  summary: {
    blockedEntryCount: number;
    entryCount: number;
    generatedConfigEmissionAllowed: boolean;
    localizedEntryCount: number;
    manifestGenerationAllowed: boolean;
    missingFieldCount: number;
    requiredLocalizedMissingCount: number;
    sourceOnlyEntryCount: number;
    stableEntryCount: number;
    targetLocaleCount: number;
    translatableEntryCount: number;
    workflowStatus: AppMetadataLocaleWorkflowStatus;
  };
  targetLocales: string[];
}

interface CliOptions {
  check: boolean;
  format: AppMetadataLocaleBuildManifestFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SCOPE_PATH =
  "docs/roadmap/i18n/app-metadata-translation-scope.json";

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
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

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readScopeItems(
  scope: Record<string, unknown> | null,
): AppMetadataScopeItem[] {
  const rawItems = Array.isArray(scope?.items) ? scope.items : [];
  return rawItems.filter(isRecord).map((item) => ({
    consumer: readString(item.consumer),
    field: readString(item.field),
    kind: readString(item.kind),
    localization: readString(item.localization),
    localizedValues: isRecord(item.localizedValues)
      ? item.localizedValues
      : {},
    path: readString(item.path),
    priority: readString(item.priority),
  }));
}

function readFieldPath(source: unknown, fieldPath: string): unknown {
  let current = source;
  const segmentPattern = /([^[.\]]+)|\[(\d+)\]/g;

  for (const match of fieldPath.matchAll(segmentPattern)) {
    const property = match[1];
    const index = match[2] ? Number.parseInt(match[2], 10) : null;

    if (property) {
      if (!isRecord(current)) {
        return undefined;
      }
      current = current[property];
      continue;
    }

    if (index !== null) {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[index];
    }
  }

  return current;
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== null && value !== undefined;
}

function readSourceValue(
  repoRoot: string,
  sourcePath: string,
  field: string,
): unknown {
  const filePath = path.join(repoRoot, sourcePath);
  const json = readJsonObject(filePath);
  return json ? readFieldPath(json, field) : undefined;
}

function resolveTarget(
  item: AppMetadataScopeItem,
  locale: string,
  fieldExists: boolean,
  sourceValue: unknown,
): AppMetadataLocaleTarget {
  if (!fieldExists) {
    return { action: "block-missing-field", locale, value: null };
  }

  if (
    item.localization === "stable-brand" ||
    item.localization === "stable-identifier"
  ) {
    return { action: "copy-stable-field", locale, value: sourceValue };
  }

  if (
    item.localization === "source-only" ||
    item.localization === "internal-source-only"
  ) {
    return { action: "queue-source-only", locale, value: sourceValue };
  }

  const localizedValue = item.localizedValues[locale];
  if (hasValue(localizedValue)) {
    return {
      action: "include-localized-value",
      locale,
      value: localizedValue,
    };
  }

  return {
    action: "block-required-localized-value",
    locale,
    value: null,
  };
}

export function buildAppMetadataLocaleBuildManifest(
  options: Pick<CliOptions, "repoRoot">,
): AppMetadataLocaleBuildManifest {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const scopePath = path.join(repoRoot, DEFAULT_SCOPE_PATH);
  const scope = readJsonObject(scopePath);
  const sourceLocale = readString(scope?.sourceLocale);
  const targetLocales = readStringArray(scope?.targetLocales);
  const manifestGenerationAllowed = scope
    ? scope.manifestGenerationAllowed !== false
    : false;
  const generatedConfigEmissionAllowed = readBoolean(
    scope?.generatedMetadataAllowed,
  );
  const items = readScopeItems(scope);
  const entries: AppMetadataLocaleEntry[] = [];

  for (const item of items) {
    if (!item.path || !item.field) {
      continue;
    }
    const sourceValue = readSourceValue(repoRoot, item.path, item.field);
    const fieldExists = hasValue(sourceValue);
    entries.push({
      consumer: item.consumer,
      field: item.field,
      fieldExists,
      kind: item.kind,
      localization: item.localization,
      path: item.path,
      priority: item.priority,
      sourceValue: fieldExists ? sourceValue : null,
      targets: targetLocales.map((locale) =>
        resolveTarget(item, locale, fieldExists, sourceValue),
      ),
    });
  }

  const missingFieldCount = entries.filter((entry) => !entry.fieldExists).length;
  const requiredLocalizedMissingCount = entries.filter((entry) =>
    entry.targets.some(
      (target) => target.action === "block-required-localized-value",
    ),
  ).length;
  const blockedEntryCount =
    missingFieldCount + requiredLocalizedMissingCount;
  const workflowStatus: AppMetadataLocaleWorkflowStatus = !scope
    ? "missing-scope"
    : !manifestGenerationAllowed || blockedEntryCount > 0
      ? "blocked"
      : "ready";

  return {
    entries,
    repoRoot,
    schemaVersion: "lime.i18n.appMetadataLocaleBuildManifest.v1",
    scope: {
      generatedConfigEmissionAllowed,
      manifestGenerationAllowed,
      path: DEFAULT_SCOPE_PATH,
      workflowStatus: readString(scope?.workflowStatus),
    },
    sourceLocale,
    summary: {
      blockedEntryCount,
      entryCount: entries.length,
      generatedConfigEmissionAllowed,
      localizedEntryCount: entries.filter((entry) =>
        entry.targets.some(
          (target) => target.action === "include-localized-value",
        ),
      ).length,
      manifestGenerationAllowed,
      missingFieldCount,
      requiredLocalizedMissingCount,
      sourceOnlyEntryCount: entries.filter((entry) =>
        entry.targets.some((target) => target.action === "queue-source-only"),
      ).length,
      stableEntryCount: entries.filter((entry) =>
        entry.targets.some((target) => target.action === "copy-stable-field"),
      ).length,
      targetLocaleCount: targetLocales.length,
      translatableEntryCount: entries.filter(
        (entry) => entry.localization === "translatable",
      ).length,
      workflowStatus,
    },
    targetLocales,
  };
}

export function formatAppMetadataLocaleBuildManifest(
  manifest: AppMetadataLocaleBuildManifest,
  format: AppMetadataLocaleBuildManifestFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  return `${[
    "[i18n:app-metadata-locale] build manifest",
    `workflow status: ${manifest.summary.workflowStatus}`,
    `source locale: ${manifest.sourceLocale ?? "(missing)"}`,
    `target locales: ${manifest.targetLocales.join(", ") || "(none)"}`,
    `entries: ${manifest.summary.entryCount}`,
    `localized entries: ${manifest.summary.localizedEntryCount}`,
    `stable entries: ${manifest.summary.stableEntryCount}`,
    `source-only entries: ${manifest.summary.sourceOnlyEntryCount}`,
    `required localized missing: ${manifest.summary.requiredLocalizedMissingCount}`,
    `missing fields: ${manifest.summary.missingFieldCount}`,
    `generated config emission: ${
      manifest.summary.generatedConfigEmissionAllowed ? "enabled" : "disabled"
    }`,
  ].join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n-app-metadata-locale-build-manifest.ts [options]

生成 installer / app metadata locale build manifest，用于发布前审阅元数据本地化。
该脚本不会写入 tauri.conf、package.json 或平台安装器配置。

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

  const manifest = buildAppMetadataLocaleBuildManifest({
    repoRoot: options.repoRoot,
  });
  const output = formatAppMetadataLocaleBuildManifest(
    manifest,
    options.format,
  );

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
