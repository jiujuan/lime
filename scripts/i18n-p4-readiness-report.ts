#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type I18nP4ReadinessReportFormat = "text" | "json";

type I18nP4ReadinessCheckStatus = "failed" | "passed";

interface I18nP4ReadinessEvidenceRef {
  exists: boolean;
  path: string;
  schemaVersion: string | null;
}

interface I18nP4ReadinessCheck {
  evidencePath: string;
  id: string;
  notes: string[];
  requirement: string;
  signals: Record<string, unknown>;
  status: I18nP4ReadinessCheckStatus;
}

interface I18nP4ReadinessKnownGap {
  evidencePath: string;
  id: string;
  severity: "decision" | "follow-up";
  summary: string;
}

export interface I18nP4ReadinessReport {
  acceptance: I18nP4ReadinessCheck[];
  deliverables: I18nP4ReadinessCheck[];
  evidence: {
    appMetadata: I18nP4ReadinessEvidenceRef;
    chromeExtension: I18nP4ReadinessEvidenceRef;
    releaseDocs: I18nP4ReadinessEvidenceRef;
    rtlReadiness: I18nP4ReadinessEvidenceRef;
  };
  knownGaps: I18nP4ReadinessKnownGap[];
  repoRoot: string;
  schemaVersion: string;
  summary: {
    acceptanceFailedCount: number;
    acceptancePassedCount: number;
    acceptanceReady: boolean;
    deliverableFailedCount: number;
    deliverablePassedCount: number;
    deliverablesReady: boolean;
    knownGapCount: number;
    missingEvidenceCount: number;
    overallStatus: "incomplete" | "ready" | "ready-with-known-gaps";
  };
}

interface CliOptions {
  format: I18nP4ReadinessReportFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPO_ROOT = REPO_ROOT;

const EVIDENCE_PATHS = {
  appMetadata:
    "docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json",
  chromeExtension:
    "docs/roadmap/i18n/evidence/chrome-extension-workflow-inventory.json",
  releaseDocs:
    "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json",
  rtlReadiness: "docs/roadmap/i18n/evidence/rtl-readiness-inventory.json",
} as const;

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

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  return typeof record[key] === "number" ? record[key] : 0;
}

function readSummary(
  report: Record<string, unknown> | null,
): Record<string, unknown> {
  return isRecord(report?.summary) ? report.summary : {};
}

function readEvidence(
  repoRoot: string,
  relativePath: string,
): { ref: I18nP4ReadinessEvidenceRef; report: Record<string, unknown> | null } {
  const report = readJsonObject(path.join(repoRoot, relativePath));
  return {
    ref: {
      exists: Boolean(report),
      path: relativePath,
      schemaVersion: readString(report?.schemaVersion),
    },
    report,
  };
}

function buildCheck(
  id: string,
  requirement: string,
  evidencePath: string,
  passed: boolean,
  signals: Record<string, unknown>,
  notes: string[] = [],
): I18nP4ReadinessCheck {
  return {
    evidencePath,
    id,
    notes,
    requirement,
    signals,
    status: passed ? "passed" : "failed",
  };
}

function countPassed(checks: I18nP4ReadinessCheck[]): number {
  return checks.filter((check) => check.status === "passed").length;
}

function analyzeKnownGaps(
  chromeSummary: Record<string, unknown>,
  releaseSummary: Record<string, unknown>,
  appMetadataSummary: Record<string, unknown>,
): I18nP4ReadinessKnownGap[] {
  const gaps: I18nP4ReadinessKnownGap[] = [];

  if (
    !readBoolean(chromeSummary, "standardChromeLocaleWorkflowPresent") &&
    (!readBoolean(chromeSummary, "standardChromeLocaleDecisionRecorded") ||
      readBoolean(chromeSummary, "standardChromeLocaleWorkflowRequired"))
  ) {
    gaps.push({
      evidencePath: EVIDENCE_PATHS.chromeExtension,
      id: "chrome-standard-locales-not-used",
      severity: "decision",
      summary:
        "Chrome extension 当前保留 InstallI18n registry，没有迁移到 _locales/messages.json。",
    });
  }

  if (!readBoolean(releaseSummary, "hasDocsLocaleWorkflow")) {
    gaps.push({
      evidencePath: EVIDENCE_PATHS.releaseDocs,
      id: "docs-locale-build-workflow-missing",
      severity: "follow-up",
      summary: "官网 / 帮助文档仍没有 locale route 或 locale build workflow。",
    });
  }

  if (!readBoolean(appMetadataSummary, "hasInstallerLocalizationWorkflow")) {
    gaps.push({
      evidencePath: EVIDENCE_PATHS.appMetadata,
      id: "installer-localization-workflow-missing",
      severity: "follow-up",
      summary: "Installer / app metadata 仍没有真实多语言生成或发布 workflow。",
    });
  }

  return gaps;
}

export function analyzeI18nP4ReadinessReport(
  options: Pick<CliOptions, "repoRoot">,
): I18nP4ReadinessReport {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const chrome = readEvidence(repoRoot, EVIDENCE_PATHS.chromeExtension);
  const release = readEvidence(repoRoot, EVIDENCE_PATHS.releaseDocs);
  const rtl = readEvidence(repoRoot, EVIDENCE_PATHS.rtlReadiness);
  const appMetadata = readEvidence(repoRoot, EVIDENCE_PATHS.appMetadata);

  const chromeSummary = readSummary(chrome.report);
  const releaseSummary = readSummary(release.report);
  const rtlSummary = readSummary(rtl.report);
  const appMetadataSummary = readSummary(appMetadata.report);
  const releaseQueue = isRecord(release.report?.releaseDocsTranslationQueue)
    ? release.report.releaseDocsTranslationQueue
    : {};
  const chromeTerminology = Array.isArray(chrome.report?.terminology)
    ? chrome.report.terminology
    : [];
  const terminologyTotal = chromeTerminology.length || 5;
  const terminologyPresentCount = readNumber(
    chromeSummary,
    "terminologyPresentCount",
  );

  const deliverables = [
    buildCheck(
      "chrome-extension-workflow-evaluated",
      "Chrome extension 评估是否迁移到 _locales/messages.json 标准结构。",
      EVIDENCE_PATHS.chromeExtension,
      chrome.ref.exists &&
        readNumber(chromeSummary, "installI18nLocaleDriftCount") === 0 &&
        readNumber(chromeSummary, "optionsLanguageDriftCount") === 0 &&
        terminologyPresentCount >= terminologyTotal,
      {
        installI18nLocaleDriftCount: readNumber(
          chromeSummary,
          "installI18nLocaleDriftCount",
        ),
        optionsLanguageDriftCount: readNumber(
          chromeSummary,
          "optionsLanguageDriftCount",
        ),
        standardChromeLocaleWorkflowPresent: readBoolean(
          chromeSummary,
          "standardChromeLocaleWorkflowPresent",
        ),
        standardChromeLocaleDecisionRecorded: readBoolean(
          chromeSummary,
          "standardChromeLocaleDecisionRecorded",
        ),
        standardChromeLocaleWorkflowRequired: readBoolean(
          chromeSummary,
          "standardChromeLocaleWorkflowRequired",
        ),
        terminologyPresentCount,
        terminologyTotal,
      },
      readBoolean(chromeSummary, "standardChromeLocaleWorkflowPresent")
        ? []
        : ["当前结论是保留轻量 InstallI18n registry，并用 drift count 约束。"],
    ),
    buildCheck(
      "release-docs-workflow-ready",
      "发布说明、官网文档、帮助文档进入独立翻译 workflow。",
      EVIDENCE_PATHS.releaseDocs,
      release.ref.exists &&
        readBoolean(releaseSummary, "hasReleaseDocsTranslationScope") &&
        readBoolean(releaseSummary, "hasReleaseDocsTranslationQueue") &&
        readString(releaseQueue.workflowStatus) === "ready" &&
        readNumber(releaseSummary, "docsUnscopedContentSourceFileCount") ===
          0 &&
        readNumber(releaseSummary, "releaseDocsOrphanCompanionCount") === 0 &&
        readNumber(
          releaseSummary,
          "releaseDocsTranslationQueueMissingSourceCount",
        ) === 0 &&
        readNumber(
          releaseSummary,
          "releaseDocsTranslationQueueRequiredCompanionMissingCount",
        ) === 0,
      {
        docsUnscopedContentSourceFileCount: readNumber(
          releaseSummary,
          "docsUnscopedContentSourceFileCount",
        ),
        hasDocsLocaleWorkflow: readBoolean(
          releaseSummary,
          "hasDocsLocaleWorkflow",
        ),
        hasReleaseDocsTranslationQueue: readBoolean(
          releaseSummary,
          "hasReleaseDocsTranslationQueue",
        ),
        releaseDocsTranslationQueueItemCount: readNumber(
          releaseSummary,
          "releaseDocsTranslationQueueItemCount",
        ),
        releaseDocsTranslationQueueRequiredCompanionMissingCount: readNumber(
          releaseSummary,
          "releaseDocsTranslationQueueRequiredCompanionMissingCount",
        ),
        releaseDocsTranslationQueueSourceOnlyCandidateCount: readNumber(
          releaseSummary,
          "releaseDocsTranslationQueueSourceOnlyCandidateCount",
        ),
        workflowStatus: readString(releaseQueue.workflowStatus),
      },
      readBoolean(releaseSummary, "hasDocsLocaleWorkflow")
        ? []
        : [
            "当前 workflow 是 scope + queue，不是 docs locale route / build workflow。",
          ],
    ),
    buildCheck(
      "rtl-readiness-smoke-complete",
      "引入 RTL locale 前完成布局审计、截图回归与 Playwright smoke。",
      EVIDENCE_PATHS.rtlReadiness,
      rtl.ref.exists &&
        !readBoolean(rtlSummary, "missingPlaywrightSmokeEvidence") &&
        !readBoolean(rtlSummary, "missingRequiredSurfaceSmokeEvidence") &&
        !readBoolean(rtlSummary, "missingRtlScreenshotEvidence") &&
        readNumber(rtlSummary, "requiredSurfaceSmokeMissingCount") === 0,
      {
        highRiskFileCount: readNumber(rtlSummary, "highRiskFileCount"),
        missingPlaywrightSmokeEvidence: readBoolean(
          rtlSummary,
          "missingPlaywrightSmokeEvidence",
        ),
        missingRequiredSurfaceSmokeEvidence: readBoolean(
          rtlSummary,
          "missingRequiredSurfaceSmokeEvidence",
        ),
        missingRtlScreenshotEvidence: readBoolean(
          rtlSummary,
          "missingRtlScreenshotEvidence",
        ),
        requiredSurfaceSmokeCoveredCount: readNumber(
          rtlSummary,
          "requiredSurfaceSmokeCoveredCount",
        ),
        requiredSurfaceSmokeMissingCount: readNumber(
          rtlSummary,
          "requiredSurfaceSmokeMissingCount",
        ),
      },
      ["这只证明强制 RTL smoke surface 完成，不等于真实 RTL locale 已开放。"],
    ),
    buildCheck(
      "app-metadata-localization-evaluated",
      "多平台 installer / app metadata 本地化评估。",
      EVIDENCE_PATHS.appMetadata,
      appMetadata.ref.exists &&
        readBoolean(appMetadataSummary, "hasMetadataTranslationScope") &&
        readNumber(appMetadataSummary, "metadataMissingScopedFieldCount") ===
          0 &&
        readNumber(appMetadataSummary, "metadataUnscopedFieldCount") === 0,
      {
        hasInstallerLocalizationWorkflow: readBoolean(
          appMetadataSummary,
          "hasInstallerLocalizationWorkflow",
        ),
        hasMetadataTranslationScope: readBoolean(
          appMetadataSummary,
          "hasMetadataTranslationScope",
        ),
        metadataMissingScopedFieldCount: readNumber(
          appMetadataSummary,
          "metadataMissingScopedFieldCount",
        ),
        metadataReviewedFieldCount: readNumber(
          appMetadataSummary,
          "metadataReviewedFieldCount",
        ),
        metadataUnscopedFieldCount: readNumber(
          appMetadataSummary,
          "metadataUnscopedFieldCount",
        ),
      },
      readBoolean(appMetadataSummary, "hasInstallerLocalizationWorkflow")
        ? []
        : ["当前完成的是评估与 scope drift 管控，不是 installer 多语言生成。"],
    ),
  ];

  const acceptance = [
    buildCheck(
      "extension-terminology-consistent",
      "extension 与桌面 App 的术语一致。",
      EVIDENCE_PATHS.chromeExtension,
      chrome.ref.exists && terminologyPresentCount >= terminologyTotal,
      {
        terminologyPresentCount,
        terminologyTotal,
      },
    ),
    buildCheck(
      "rtl-required-surfaces-stable",
      "RTL 不破坏设置页、侧栏、Workspace、弹窗主路径。",
      EVIDENCE_PATHS.rtlReadiness,
      rtl.ref.exists &&
        !readBoolean(rtlSummary, "missingRequiredSurfaceSmokeEvidence") &&
        readNumber(rtlSummary, "requiredSurfaceSmokeMissingCount") === 0,
      {
        requiredSurfaceSmokeCoveredCount: readNumber(
          rtlSummary,
          "requiredSurfaceSmokeCoveredCount",
        ),
        requiredSurfaceSmokeMissingCount: readNumber(
          rtlSummary,
          "requiredSurfaceSmokeMissingCount",
        ),
      },
    ),
    buildCheck(
      "release-materials-zh-cn-en-us-covered",
      "发布材料至少覆盖 zh-CN / en-US。",
      EVIDENCE_PATHS.releaseDocs,
      release.ref.exists &&
        readBoolean(releaseSummary, "hasBilingualRootReadme") &&
        readBoolean(releaseSummary, "hasReleaseNotesCompanion") &&
        readBoolean(releaseSummary, "hasReleaseNotesCompanionVersionMatch") &&
        readBoolean(releaseSummary, "readmeEnglishLinksReleaseNotesCompanion"),
      {
        hasBilingualRootReadme: readBoolean(
          releaseSummary,
          "hasBilingualRootReadme",
        ),
        hasReleaseNotesCompanion: readBoolean(
          releaseSummary,
          "hasReleaseNotesCompanion",
        ),
        hasReleaseNotesCompanionVersionMatch: readBoolean(
          releaseSummary,
          "hasReleaseNotesCompanionVersionMatch",
        ),
        readmeEnglishLinksReleaseNotesCompanion: readBoolean(
          releaseSummary,
          "readmeEnglishLinksReleaseNotesCompanion",
        ),
      },
    ),
  ];

  const knownGaps = analyzeKnownGaps(
    chromeSummary,
    releaseSummary,
    appMetadataSummary,
  );
  const deliverablePassedCount = countPassed(deliverables);
  const acceptancePassedCount = countPassed(acceptance);
  const deliverableFailedCount = deliverables.length - deliverablePassedCount;
  const acceptanceFailedCount = acceptance.length - acceptancePassedCount;
  const evidenceRefs = {
    appMetadata: appMetadata.ref,
    chromeExtension: chrome.ref,
    releaseDocs: release.ref,
    rtlReadiness: rtl.ref,
  };
  const missingEvidenceCount = Object.values(evidenceRefs).filter(
    (evidence) => !evidence.exists,
  ).length;
  const deliverablesReady = deliverableFailedCount === 0;
  const acceptanceReady = acceptanceFailedCount === 0;
  const overallStatus =
    deliverablesReady && acceptanceReady
      ? knownGaps.length > 0
        ? "ready-with-known-gaps"
        : "ready"
      : "incomplete";

  return {
    acceptance,
    deliverables,
    evidence: evidenceRefs,
    knownGaps,
    repoRoot,
    schemaVersion: "lime.i18n.p4ReadinessReport.v1",
    summary: {
      acceptanceFailedCount,
      acceptancePassedCount,
      acceptanceReady,
      deliverableFailedCount,
      deliverablePassedCount,
      deliverablesReady,
      knownGapCount: knownGaps.length,
      missingEvidenceCount,
      overallStatus,
    },
  };
}

export function formatI18nP4ReadinessReport(
  report: I18nP4ReadinessReport,
  format: I18nP4ReadinessReportFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "[i18n:p4] readiness report",
    `overall status: ${report.summary.overallStatus}`,
    `deliverables: ${report.summary.deliverablePassedCount} passed / ${report.summary.deliverableFailedCount} failed`,
    `acceptance: ${report.summary.acceptancePassedCount} passed / ${report.summary.acceptanceFailedCount} failed`,
    `missing evidence: ${report.summary.missingEvidenceCount}`,
    `known gaps: ${report.summary.knownGapCount}`,
    "",
    "deliverables:",
    ...report.deliverables.map((check) => `- ${check.id}: ${check.status}`),
    "",
    "acceptance:",
    ...report.acceptance.map((check) => `- ${check.id}: ${check.status}`),
  ];

  if (report.knownGaps.length > 0) {
    lines.push(
      "",
      "known gaps:",
      ...report.knownGaps.map((gap) => `- ${gap.id}: ${gap.summary}`),
    );
  }

  return `${lines.join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n-p4-readiness-report.ts [options]

聚合 i18n P4 Chrome extension、发布材料、RTL 与 app metadata evidence。
只读生成 readiness 报告，不修改运行时、不发布文档、不启用新 locale。

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

  const report = analyzeI18nP4ReadinessReport({
    repoRoot: options.repoRoot,
  });
  const output = formatI18nP4ReadinessReport(report, options.format);

  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), {
      recursive: true,
    });
    fs.writeFileSync(path.resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
