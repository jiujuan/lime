#!/usr/bin/env tsx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeTranslations } from "./detect-missing-translations";
import {
  analyzeI18nSourceLocaleExport,
  type I18nSourceLocaleNamespaceExport,
} from "./i18n-source-locale-export";
import { SOURCE_LOCALE } from "../../src/i18n/locales";

export type I18nTranslationPrPackFormat = "text" | "json";

export interface I18nTranslationPrPackEntry {
  key: string;
  namespace: string;
  sourceValue: unknown;
}

export interface I18nTranslationPrPackNamespaceProposal {
  extraKeys: string[];
  missingEntries: I18nTranslationPrPackEntry[];
  namespace: string;
}

export interface I18nTranslationPrPackLocaleProposal {
  coverageRatio: number;
  extraKeyCount: number;
  locale: string;
  missingKeyCount: number;
  namespaceCount: number;
  proposedEntryCount: number;
  sourceKeyCount: number;
  translatedKeyCount: number;
  namespaces: I18nTranslationPrPackNamespaceProposal[];
}

export interface I18nTranslationPrPackReport {
  localeProposals: I18nTranslationPrPackLocaleProposal[];
  resourcesDir: string;
  schemaVersion: string;
  sourceLocale: string;
  sourceLocaleExport: {
    namespaceCount: number;
    sourceKeyCount: number;
    totalRawBytes: number;
  };
  translationCoverage: {
    localeCount: number;
    fullCoverageLocaleCount: number;
    coverageRatio: number;
    sourceKeyCount: number;
    translatedKeyCount: number;
    missingKeyCount: number;
    extraKeyCount: number;
  };
  summary: {
    localeCount: number;
    localesWithGaps: number;
    namespaceCount: number;
    proposedEntryCount: number;
    sourceKeyCount: number;
  };
}

interface CliOptions {
  format: I18nTranslationPrPackFormat;
  output?: string;
  resourcesDir: string;
  sourceLocale: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_RESOURCES_DIR = path.join(REPO_ROOT, "src", "i18n", "resources");

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function displayPath(filePath: string): string {
  const relative = path.relative(REPO_ROOT, filePath);
  return normalizePath(
    relative && !relative.startsWith("..") ? relative : filePath,
  );
}

function isSourceValue(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function buildSourceValueIndex(
  namespaces: I18nSourceLocaleNamespaceExport[],
): Map<string, unknown> {
  const index = new Map<string, unknown>();
  for (const namespace of namespaces) {
    for (const [key, value] of Object.entries(namespace.values)) {
      index.set(key, value);
    }
  }
  return index;
}

export function buildTranslationPrPackReport(
  resourcesDir: string,
  sourceLocale: string,
): I18nTranslationPrPackReport {
  const translationResult = analyzeTranslations({ resourcesDir, sourceLocale });
  const sourceExport = analyzeI18nSourceLocaleExport({
    resourcesDir,
    sourceLocale,
  });
  const sourceValueIndex = buildSourceValueIndex(sourceExport.namespaces);

  const localeProposals = translationResult.issues.map((issue) => {
    const namespaceProposals = issue.namespaces.map((namespaceIssue) => {
      const missingEntries = namespaceIssue.missingKeys
        .map((key) => {
          const sourceValue = sourceValueIndex.get(key);
          if (!isSourceValue(sourceValue)) {
            return null;
          }

          return {
            key,
            namespace: namespaceIssue.namespace,
            sourceValue,
          } satisfies I18nTranslationPrPackEntry;
        })
        .filter((item): item is I18nTranslationPrPackEntry => item !== null);

      return {
        extraKeys: [...namespaceIssue.extraKeys],
        missingEntries,
        namespace: namespaceIssue.namespace,
      } satisfies I18nTranslationPrPackNamespaceProposal;
    });

    const proposedEntryCount = namespaceProposals.reduce(
      (total, item) => total + item.missingEntries.length,
      0,
    );

    const localeCoverage = translationResult.coverage.localeSummaries.find(
      (item) => item.locale === issue.locale,
    );

    return {
      coverageRatio: localeCoverage?.coverageRatio ?? 0,
      extraKeyCount: localeCoverage?.extraKeyCount ?? 0,
      locale: issue.locale,
      missingKeyCount: localeCoverage?.missingKeyCount ?? 0,
      namespaceCount: issue.namespaces.length,
      proposedEntryCount,
      sourceKeyCount:
        localeCoverage?.sourceKeyCount ?? translationResult.sourceKeyCount,
      translatedKeyCount: localeCoverage?.translatedKeyCount ?? 0,
      namespaces: namespaceProposals,
    } satisfies I18nTranslationPrPackLocaleProposal;
  });

  return {
    localeProposals,
    resourcesDir: path.resolve(resourcesDir),
    schemaVersion: "lime.i18n.translationPrPack.v1",
    sourceLocale,
    sourceLocaleExport: {
      namespaceCount: sourceExport.summary.namespaceCount,
      sourceKeyCount: sourceExport.summary.sourceKeyCount,
      totalRawBytes: sourceExport.summary.totalRawBytes,
    },
    translationCoverage: translationResult.coverage.summary,
    summary: {
      localeCount: translationResult.locales.length,
      localesWithGaps: localeProposals.length,
      namespaceCount: translationResult.namespaces.length,
      proposedEntryCount: localeProposals.reduce(
        (total, item) => total + item.proposedEntryCount,
        0,
      ),
      sourceKeyCount: translationResult.sourceKeyCount,
    },
  };
}

export function formatI18nTranslationPrPackReport(
  report: I18nTranslationPrPackReport,
  format: I18nTranslationPrPackFormat = "text",
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}${os.EOL}`;
  }

  const lines = [
    `[i18n:translation-pr-pack] resources=${displayPath(report.resourcesDir)} source=${report.sourceLocale} locales=${report.summary.localeCount} namespaces=${report.summary.namespaceCount} sourceKeys=${report.summary.sourceKeyCount} proposedEntries=${report.summary.proposedEntryCount}`,
    `[i18n:translation-pr-pack] coverage=${(report.translationCoverage.coverageRatio * 100).toFixed(1)}% translated=${report.translationCoverage.translatedKeyCount}/${report.translationCoverage.sourceKeyCount} missing=${report.translationCoverage.missingKeyCount} extra=${report.translationCoverage.extraKeyCount} fullCoverageLocales=${report.translationCoverage.fullCoverageLocaleCount}/${report.translationCoverage.localeCount}`,
    `[i18n:translation-pr-pack] source export: namespaces=${report.sourceLocaleExport.namespaceCount} keys=${report.sourceLocaleExport.sourceKeyCount} rawBytes=${report.sourceLocaleExport.totalRawBytes}`,
  ];

  if (report.localeProposals.length === 0) {
    lines.push("[i18n:translation-pr-pack] 通过：没有需要生成翻译 PR 的缺口。");
    return `${lines.join(os.EOL)}${os.EOL}`;
  }

  lines.push("[i18n:translation-pr-pack] locale proposals:");
  for (const localeProposal of report.localeProposals) {
    lines.push(
      `  - ${localeProposal.locale}: coverage=${(localeProposal.coverageRatio * 100).toFixed(1)}% proposedEntries=${localeProposal.proposedEntryCount} missing=${localeProposal.missingKeyCount} extra=${localeProposal.extraKeyCount}`,
    );
    for (const namespace of localeProposal.namespaces) {
      lines.push(
        `    * ${namespace.namespace}: missingEntries=${namespace.missingEntries.length} extraKeys=${namespace.extraKeys.length}`,
      );
    }
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
        "Usage: npm run i18n:translation-pr-pack -- [--format text|json] [--output <path>] [--resources-dir <dir>] [--source-locale <locale>]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function runCli(argv = process.argv.slice(2)): number {
  const options = parseCliArgs(argv);
  const report = buildTranslationPrPackReport(
    options.resourcesDir,
    options.sourceLocale,
  );
  const content = formatI18nTranslationPrPackReport(report, options.format);

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
      `[i18n:translation-pr-pack] 失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
