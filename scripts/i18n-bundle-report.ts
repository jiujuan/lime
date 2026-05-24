#!/usr/bin/env tsx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { flattenResource } from "./detect-missing-translations";
import {
  CORE_NAMESPACES,
  getBundledNamespaceResourceParts,
} from "../src/i18n/bundledNamespaceParts";
import { SOURCE_LOCALE } from "../src/i18n/locales";

export type I18nBundleGroupRole = "inline" | "lazy";
export type I18nBundleReportFormat = "text" | "json";

export interface I18nBundleGroupReport {
  fileCount: number;
  keyCount: number;
  localeRawBytes: Record<string, number>;
  namespace: string;
  partNames: string[];
  role: I18nBundleGroupRole;
  sourceLocaleKeyCount: number;
  sourceLocaleRawBytes: number;
  totalRawBytes: number;
}

export interface I18nBundleReport {
  bundleGroups: I18nBundleGroupReport[];
  coreNamespaces: readonly string[];
  localeCount: number;
  resourcesDir: string;
  schemaVersion: string;
  sourceLocale: string;
  summary: {
    coreGroupCount: number;
    inlineGroupCount: number;
    lazyGroupCount: number;
    sourceLocaleFileCount: number;
    sourceLocaleKeyCount: number;
    totalRawBytes: number;
  };
}

interface CliOptions {
  format: I18nBundleReportFormat;
  resourcesDir: string;
  sourceLocale: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RESOURCES_DIR = path.join(REPO_ROOT, "src", "i18n", "resources");

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function displayPath(filePath: string): string {
  const relative = path.relative(REPO_ROOT, filePath);
  return normalizePath(relative && !relative.startsWith("..") ? relative : filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`i18n resource must be a JSON object: ${filePath}`);
  }
  return parsed;
}

function listLocaleDirs(resourcesDir: string): string[] {
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`i18n resources directory does not exist: ${resourcesDir}`);
  }

  return fs
    .readdirSync(resourcesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function listLocaleFiles(localeDir: string): string[] {
  if (!fs.existsSync(localeDir)) {
    return [];
  }

  return fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function resolveBundleNamespace(fileNamespace: string): string {
  for (const namespace of CORE_NAMESPACES) {
    if (getBundledNamespaceResourceParts(namespace).includes(fileNamespace)) {
      return namespace;
    }
  }

  return fileNamespace;
}

function readFileStatBytes(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function countKeys(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  return Object.keys(flattenResource(readJsonObject(filePath))).length;
}

function collectBundleGroupMaps(
  resourcesDir: string,
  sourceLocale: string,
): Map<string, Set<string>> {
  const sourceLocaleDir = path.join(resourcesDir, sourceLocale);
  const fileNamespaces = listLocaleFiles(sourceLocaleDir).map((fileName) =>
    path.basename(fileName, ".json"),
  );
  const groups = new Map<string, Set<string>>();

  for (const fileNamespace of fileNamespaces) {
    const groupNamespace = resolveBundleNamespace(fileNamespace);
    groups.set(groupNamespace, groups.get(groupNamespace) ?? new Set<string>());
    groups.get(groupNamespace)?.add(fileNamespace);
  }

  return groups;
}

function groupRole(namespace: string): I18nBundleGroupRole {
  return CORE_NAMESPACES.includes(namespace as (typeof CORE_NAMESPACES)[number])
    ? "inline"
    : "lazy";
}

function buildBundleGroupReport(
  resourcesDir: string,
  namespace: string,
  partNames: string[],
  locales: string[],
): I18nBundleGroupReport {
  const localeRawBytes: Record<string, number> = {};
  let totalRawBytes = 0;
  let sourceLocaleRawBytes = 0;
  let sourceLocaleKeyCount = 0;
  let keyCount = 0;
  let fileCount = 0;

  for (const locale of locales) {
    const localeDir = path.join(resourcesDir, locale);
    for (const partName of partNames) {
      const filePath = path.join(localeDir, `${partName}.json`);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const bytes = readFileStatBytes(filePath);
      const keys = countKeys(filePath);
      fileCount += 1;
      keyCount += keys;
      totalRawBytes += bytes;
      localeRawBytes[locale] = (localeRawBytes[locale] ?? 0) + bytes;

      if (locale === SOURCE_LOCALE) {
        sourceLocaleRawBytes += bytes;
        sourceLocaleKeyCount += keys;
      }
    }
  }

  return {
    fileCount,
    keyCount,
    localeRawBytes,
    namespace,
    partNames,
    role: groupRole(namespace),
    sourceLocaleKeyCount,
    sourceLocaleRawBytes,
    totalRawBytes,
  };
}

export function analyzeI18nBundleReport(
  options: Pick<CliOptions, "resourcesDir" | "sourceLocale">,
): I18nBundleReport {
  const resourcesDir = path.resolve(options.resourcesDir);
  const sourceLocale = options.sourceLocale || SOURCE_LOCALE;
  const locales = listLocaleDirs(resourcesDir);
  if (!locales.includes(sourceLocale)) {
    throw new Error(`Source locale is missing from resources: ${sourceLocale}`);
  }

  const bundleGroups = [...collectBundleGroupMaps(resourcesDir, sourceLocale).entries()]
    .map(([namespace, partSet]) =>
      buildBundleGroupReport(
        resourcesDir,
        namespace,
        [...partSet].sort((left, right) => left.localeCompare(right)),
        locales,
      ),
    )
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "inline" ? -1 : 1;
      }
      return right.totalRawBytes - left.totalRawBytes;
    });

  return {
    bundleGroups,
    coreNamespaces: CORE_NAMESPACES,
    localeCount: locales.length,
    resourcesDir,
    schemaVersion: "lime.i18n.bundleStrategyReport.v1",
    sourceLocale,
    summary: {
      coreGroupCount: CORE_NAMESPACES.length,
      inlineGroupCount: bundleGroups.filter((group) => group.role === "inline").length,
      lazyGroupCount: bundleGroups.filter((group) => group.role === "lazy").length,
      sourceLocaleFileCount: bundleGroups.reduce(
        (total, group) => total + group.partNames.length,
        0,
      ),
      sourceLocaleKeyCount: bundleGroups.reduce(
        (total, group) => total + group.sourceLocaleKeyCount,
        0,
      ),
      totalRawBytes: bundleGroups.reduce((total, group) => total + group.totalRawBytes, 0),
    },
  };
}

function renderGroupLabel(group: I18nBundleGroupReport): string {
  return `${group.namespace}${group.partNames.length > 1 ? ` (${group.partNames.join(", ")})` : ""}`;
}

export function formatI18nBundleReport(
  report: I18nBundleReport,
  format: I18nBundleReportFormat = "text",
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}${os.EOL}`;
  }

  const lines = [
    `[i18n:bundle] resources=${report.resourcesDir} source=${report.sourceLocale} locales=${report.localeCount} core=${report.summary.coreGroupCount} inline=${report.summary.inlineGroupCount} lazy=${report.summary.lazyGroupCount} sourceFiles=${report.summary.sourceLocaleFileCount} sourceKeys=${report.summary.sourceLocaleKeyCount} rawBytes=${report.summary.totalRawBytes}`,
  ];

  lines.push("[i18n:bundle] bundle groups:");
  for (const group of report.bundleGroups) {
    lines.push(
      `  - ${renderGroupLabel(group)}: role=${group.role} parts=${group.partNames.length} files=${group.fileCount} keys=${group.keyCount} rawBytes=${group.totalRawBytes}`,
    );
  }

  const largestInline = report.bundleGroups
    .filter((group) => group.role === "inline")
    .sort((left, right) => right.totalRawBytes - left.totalRawBytes)[0];
  if (largestInline) {
    lines.push(
      `[i18n:bundle] strategy: keep current core groups inline; largest inline group is ${largestInline.namespace}. Future non-core namespaces should default to lazy chunking unless they are on the startup path.`,
    );
  }

  return `${lines.join(os.EOL)}${os.EOL}`;
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: "text",
    resourcesDir: DEFAULT_RESOURCES_DIR,
    sourceLocale: SOURCE_LOCALE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--format" && next) {
      if (next === "json" || next === "text") {
        options.format = next;
        index += 1;
        continue;
      }
      throw new Error(`Unknown or missing format value: ${next}`);
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

    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run i18n:bundle-report -- [--format text|json] [--resources-dir <dir>] [--source-locale <locale>]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function runCli(argv = process.argv.slice(2)): number {
  const options = parseCliArgs(argv);
  const report = analyzeI18nBundleReport(options);
  process.stdout.write(formatI18nBundleReport(report, options.format));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(
      `[i18n:bundle] 失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
