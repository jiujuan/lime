#!/usr/bin/env tsx
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface TranslationCheckOptions {
  resourcesDir: string;
  sourceLocale?: string;
}

export interface NamespaceIssue {
  namespace: string;
  missingKeys: string[];
  extraKeys: string[];
}

export interface LocaleIssue {
  locale: string;
  missingNamespaces: string[];
  extraNamespaces: string[];
  namespaces: NamespaceIssue[];
}

export interface TranslationCheckResult {
  resourcesDir: string;
  sourceLocale: string;
  locales: string[];
  namespaces: string[];
  sourceKeyCount: number;
  issues: LocaleIssue[];
}

interface CliOptions extends TranslationCheckOptions {
  fix: boolean;
  verbose: boolean;
}

const DEFAULT_SOURCE_LOCALE = "zh-CN";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RESOURCES_DIR = path.join(REPO_ROOT, "src", "i18n", "resources");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Translation resource must be a JSON object: ${filePath}`);
  }
  return parsed;
}

function listJsonNamespaces(localeDir: string): string[] {
  if (!fs.existsSync(localeDir)) {
    return [];
  }

  return fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.basename(entry.name, ".json"))
    .sort((left, right) => left.localeCompare(right));
}

function listLocaleDirs(resourcesDir: string): string[] {
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`Translation resources directory does not exist: ${resourcesDir}`);
  }

  return fs
    .readdirSync(resourcesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function flattenResource(
  resource: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(resource)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      Object.assign(flattened, flattenResource(value, nextKey));
    } else {
      flattened[nextKey] = value;
    }
  }

  return flattened;
}

function sortedDifference(left: Iterable<string>, right: Set<string>): string[] {
  return [...left]
    .filter((item) => !right.has(item))
    .sort((a, b) => a.localeCompare(b));
}

function readNamespaceKeys(localeDir: string, namespace: string): Set<string> {
  const filePath = path.join(localeDir, `${namespace}.json`);
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  return new Set(Object.keys(flattenResource(readJsonObject(filePath))));
}

function countSourceKeys(sourceLocaleDir: string, namespaces: string[]): number {
  return namespaces.reduce(
    (total, namespace) => total + readNamespaceKeys(sourceLocaleDir, namespace).size,
    0,
  );
}

export function hasTranslationIssues(result: TranslationCheckResult): boolean {
  return result.issues.some(
    (issue) =>
      issue.missingNamespaces.length > 0 ||
      issue.extraNamespaces.length > 0 ||
      issue.namespaces.some(
        (namespaceIssue) =>
          namespaceIssue.missingKeys.length > 0 || namespaceIssue.extraKeys.length > 0,
      ),
  );
}

export function analyzeTranslations(
  options: TranslationCheckOptions,
): TranslationCheckResult {
  const resourcesDir = path.resolve(options.resourcesDir);
  const sourceLocale = options.sourceLocale || DEFAULT_SOURCE_LOCALE;
  const locales = listLocaleDirs(resourcesDir);
  const sourceLocaleDir = path.join(resourcesDir, sourceLocale);

  if (!locales.includes(sourceLocale)) {
    throw new Error(`Source locale is missing from resources: ${sourceLocale}`);
  }

  const namespaces = listJsonNamespaces(sourceLocaleDir);
  const sourceNamespaceSet = new Set(namespaces);
  const issues: LocaleIssue[] = [];

  for (const locale of locales) {
    if (locale === sourceLocale) {
      continue;
    }

    const localeDir = path.join(resourcesDir, locale);
    const localeNamespaces = listJsonNamespaces(localeDir);
    const localeNamespaceSet = new Set(localeNamespaces);
    const missingNamespaces = sortedDifference(namespaces, localeNamespaceSet);
    const extraNamespaces = sortedDifference(localeNamespaces, sourceNamespaceSet);
    const namespaceIssues: NamespaceIssue[] = [];

    for (const namespace of namespaces) {
      if (!localeNamespaceSet.has(namespace)) {
        continue;
      }

      const sourceKeys = readNamespaceKeys(sourceLocaleDir, namespace);
      const targetKeys = readNamespaceKeys(localeDir, namespace);
      const missingKeys = sortedDifference(sourceKeys, targetKeys);
      const extraKeys = sortedDifference(targetKeys, sourceKeys);

      if (missingKeys.length > 0 || extraKeys.length > 0) {
        namespaceIssues.push({ namespace, missingKeys, extraKeys });
      }
    }

    if (
      missingNamespaces.length > 0 ||
      extraNamespaces.length > 0 ||
      namespaceIssues.length > 0
    ) {
      issues.push({
        locale,
        missingNamespaces,
        extraNamespaces,
        namespaces: namespaceIssues,
      });
    }
  }

  return {
    resourcesDir,
    sourceLocale,
    locales,
    namespaces,
    sourceKeyCount: countSourceKeys(sourceLocaleDir, namespaces),
    issues,
  };
}

function sortObjectByKey(resource: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(resource).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function writeJsonObject(filePath: string, resource: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sortObjectByKey(resource), null, 2)}${os.EOL}`);
}

export function applyTranslationFixes(options: TranslationCheckOptions): void {
  const resourcesDir = path.resolve(options.resourcesDir);
  const sourceLocale = options.sourceLocale || DEFAULT_SOURCE_LOCALE;
  const sourceLocaleDir = path.join(resourcesDir, sourceLocale);
  const sourceNamespaces = listJsonNamespaces(sourceLocaleDir);
  const locales = listLocaleDirs(resourcesDir).filter((locale) => locale !== sourceLocale);

  for (const locale of locales) {
    const localeDir = path.join(resourcesDir, locale);

    for (const namespace of sourceNamespaces) {
      const sourcePath = path.join(sourceLocaleDir, `${namespace}.json`);
      const targetPath = path.join(localeDir, `${namespace}.json`);
      const sourceResource = flattenResource(readJsonObject(sourcePath));
      const targetResource = fs.existsSync(targetPath)
        ? flattenResource(readJsonObject(targetPath))
        : {};

      let changed = false;
      for (const [key, value] of Object.entries(sourceResource)) {
        if (!(key in targetResource)) {
          targetResource[key] = value;
          changed = true;
        }
      }

      if (changed || !fs.existsSync(targetPath)) {
        writeJsonObject(targetPath, targetResource);
      }
    }
  }
}

function formatList(items: string[]): string {
  return items.length === 0 ? "-" : items.join(", ");
}

export function formatTranslationReport(
  result: TranslationCheckResult,
  options: { verbose?: boolean } = {},
): string {
  const lines: string[] = [];
  const issueCount = result.issues.length;
  lines.push(
    `[i18n:check] resources=${path.relative(REPO_ROOT, result.resourcesDir) || result.resourcesDir} source=${result.sourceLocale} locales=${result.locales.length} namespaces=${result.namespaces.length} sourceKeys=${result.sourceKeyCount}`,
  );

  if (!hasTranslationIssues(result)) {
    lines.push("[i18n:check] 通过：所有 locale 与 source namespace/key 保持一致。");
    if (options.verbose) {
      lines.push(`[i18n:check] locale 列表: ${result.locales.join(", ")}`);
      lines.push(`[i18n:check] namespace 列表: ${result.namespaces.join(", ")}`);
    }
    return lines.join(os.EOL);
  }

  lines.push(`[i18n:check] 发现 ${issueCount} 个 locale 存在翻译结构差异。`);
  for (const localeIssue of result.issues) {
    lines.push(`[i18n:check] locale=${localeIssue.locale}`);
    if (localeIssue.missingNamespaces.length > 0) {
      lines.push(
        `  missing namespaces: ${formatList(localeIssue.missingNamespaces)}`,
      );
    }
    if (localeIssue.extraNamespaces.length > 0) {
      lines.push(`  extra namespaces: ${formatList(localeIssue.extraNamespaces)}`);
    }
    for (const namespaceIssue of localeIssue.namespaces) {
      lines.push(`  namespace=${namespaceIssue.namespace}`);
      if (namespaceIssue.missingKeys.length > 0) {
        lines.push(`    missing keys: ${formatList(namespaceIssue.missingKeys)}`);
      }
      if (namespaceIssue.extraKeys.length > 0) {
        lines.push(`    extra keys: ${formatList(namespaceIssue.extraKeys)}`);
      }
    }
  }

  return lines.join(os.EOL);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    fix: false,
    resourcesDir: DEFAULT_RESOURCES_DIR,
    sourceLocale: DEFAULT_SOURCE_LOCALE,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--fix") {
      options.fix = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (arg === "--resources-dir" && next) {
      options.resourcesDir = next;
      index += 1;
      continue;
    }
    if (arg === "--source-locale" && next) {
      options.sourceLocale = next;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(`Usage: npm run detect-translations -- [--fix] [--verbose] [--resources-dir <dir>] [--source-locale <locale>]`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function runCli(argv = process.argv.slice(2)): number {
  const options = parseCliArgs(argv);

  if (options.fix) {
    applyTranslationFixes(options);
  }

  const result = analyzeTranslations(options);
  console.log(formatTranslationReport(result, { verbose: options.verbose }));
  return hasTranslationIssues(result) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(
      `[i18n:check] 失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
