#!/usr/bin/env tsx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { flattenResource } from "./detect-missing-translations";
import { SOURCE_LOCALE } from "../src/i18n/locales";

export type I18nSourceLocaleExportFormat = "text" | "json";

export interface I18nSourceLocaleNamespaceExport {
  keyCount: number;
  namespace: string;
  rawBytes: number;
  values: Record<string, unknown>;
}

export interface I18nSourceLocaleExportReport {
  namespaces: I18nSourceLocaleNamespaceExport[];
  resourcesDir: string;
  schemaVersion: string;
  sourceLocale: string;
  summary: {
    namespaceCount: number;
    sourceKeyCount: number;
    totalRawBytes: number;
  };
}

interface CliOptions {
  format: I18nSourceLocaleExportFormat;
  output?: string;
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
    throw new Error(`i18n source resource must be a JSON object: ${filePath}`);
  }
  return parsed;
}

function listNamespaceFiles(localeDir: string): string[] {
  if (!fs.existsSync(localeDir)) {
    throw new Error(`Source locale resources directory does not exist: ${localeDir}`);
  }

  return fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function sortRecordByKey(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function analyzeI18nSourceLocaleExport(
  options: Pick<CliOptions, "resourcesDir" | "sourceLocale">,
): I18nSourceLocaleExportReport {
  const resourcesDir = path.resolve(options.resourcesDir);
  const sourceLocale = options.sourceLocale || SOURCE_LOCALE;
  const localeDir = path.join(resourcesDir, sourceLocale);
  const namespaces = listNamespaceFiles(localeDir).map((fileName) => {
    const namespace = path.basename(fileName, ".json");
    const filePath = path.join(localeDir, fileName);
    const values = sortRecordByKey(flattenResource(readJsonObject(filePath)));

    return {
      keyCount: Object.keys(values).length,
      namespace,
      rawBytes: fs.statSync(filePath).size,
      values,
    };
  });

  return {
    namespaces,
    resourcesDir,
    schemaVersion: "lime.i18n.sourceLocaleExport.v1",
    sourceLocale,
    summary: {
      namespaceCount: namespaces.length,
      sourceKeyCount: namespaces.reduce((total, item) => total + item.keyCount, 0),
      totalRawBytes: namespaces.reduce((total, item) => total + item.rawBytes, 0),
    },
  };
}

export function formatI18nSourceLocaleExport(
  report: I18nSourceLocaleExportReport,
  format: I18nSourceLocaleExportFormat = "text",
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}${os.EOL}`;
  }

  const lines = [
    `[i18n:source-export] resources=${displayPath(report.resourcesDir)} source=${report.sourceLocale} namespaces=${report.summary.namespaceCount} keys=${report.summary.sourceKeyCount} rawBytes=${report.summary.totalRawBytes}`,
    "[i18n:source-export] namespaces:",
  ];

  for (const namespace of report.namespaces) {
    lines.push(
      `  - ${namespace.namespace}: keys=${namespace.keyCount} rawBytes=${namespace.rawBytes}`,
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

    if (arg === "--output" && next) {
      options.output = next;
      index += 1;
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

    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run i18n:source-export -- [--format text|json] [--output <path>] [--resources-dir <dir>] [--source-locale <locale>]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function runCli(argv = process.argv.slice(2)): number {
  const options = parseCliArgs(argv);
  const report = analyzeI18nSourceLocaleExport(options);
  const content = formatI18nSourceLocaleExport(report, options.format);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, "utf8");
  } else {
    process.stdout.write(content);
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(
      `[i18n:source-export] 失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
