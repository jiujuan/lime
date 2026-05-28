import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeI18nRoadmapReadinessReport,
  formatI18nRoadmapReadinessReport,
  runCli,
} from "./i18n-roadmap-readiness-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-roadmap-"));
  tempDirs.push(dir);
  return dir;
}

function writeText(root: string, relativePath: string, value: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReadyRepo(root: string, sourceKeyCount = 120): void {
  writeJson(root, "package.json", {
    scripts: {
      "detect-translations": "tsx scripts/detect-missing-translations.ts",
      "i18n:bundle-report:json": "tsx scripts/i18n-bundle-report.ts --format json",
      "i18n:check": "npm run detect-translations",
      "i18n:source-export:json":
        "tsx scripts/i18n-source-locale-export.ts --format json",
      "i18n:translation-pr-pack:json":
        "tsx scripts/i18n-translation-pr-pack.ts --format json",
      "i18n:unused:json": "tsx scripts/i18n-unused-key-check.ts --format json",
    },
  });
  writeText(
    root,
    "src/i18n/locales.ts",
    `
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;
export function normalizeLocale(input?: string | null) {
  const lower = String(input || "").toLowerCase();
  if (lower === "zh") return "zh-CN";
  if (lower === "en") return "en-US";
  return "zh-CN";
}
export function normalizeLocalePreference(input?: string | null) {
  return input || "auto";
}
export function toLegacyPatchLanguage() {
  return "zh";
}
export function resolveDocumentDirection() {
  return "ltr";
}
`,
  );
  writeText(
    root,
    "src/i18n/createI18n.ts",
    `
import { initReactI18next } from "react-i18next";
import { loadBundledI18nResources } from "./loadNamespace";
import { resolveDocumentDirection } from "./locales";
document.documentElement.lang = "zh-CN";
document.documentElement.dir = resolveDocumentDirection("zh-CN");
export function initLimeI18n() {
  return initReactI18next;
}
export const options = {
  fallbackLng: "zh-CN",
  resources: loadBundledI18nResources(),
  react: { useSuspense: false },
};
`,
  );
  writeText(root, "src/i18n/legacy-patch/I18nPatchProvider.tsx", "export {};\n");
  writeText(root, "src/lib/api/appConfigTypes.ts", "export interface Config { language: string; }\n");
  writeText(root, "src/i18n/__tests__/locales.test.ts", "normalizeLocale('zh');\n");
  writeText(root, "src/i18n/__tests__/loadNamespace.test.ts", "fallback namespace\n");
  writeText(
    root,
    "src/components/settings-v2/general/appearance/index.tsx",
    "useTranslation(); UI_LOCALE_OPTIONS; changeLimeLocale('en-US');\n",
  );
  writeText(
    root,
    "src/components/AppSidebar.test.tsx",
    'changeLimeLocale("en-US"); document.documentElement.lang; saveConfig({ language: "en-US" });\n',
  );
  writeText(
    root,
    "scripts/quality-task-planner.mjs",
    "i18n:translation-pr-pack:json i18n:bundle-report:json i18n:p4-readiness-report:json\n",
  );
  writeText(root, "docs/roadmap/i18n/glossary.md", "# glossary\n");
  writeText(root, ".github/pull_request_template.md", "namespace\n");

  writeJson(root, "docs/roadmap/i18n/evidence/source-locale-export.json", {
    namespaces: [
      {
        namespace: "common",
        values: {
          "common.errorCode": "errorCode",
        },
      },
      { namespace: "navigation", values: { "navigation.home": "首页" } },
      {
        namespace: "settings",
        values: {
          "settings.appearance.responseLanguage.title": "回复语言",
        },
      },
      {
        namespace: "workspace",
        values: {
          "workspace.artifact.title": "artifact",
          "workspace.browserEnvironment.description":
            "Accept-Language 不控制 Lime 界面语言。",
          "workspace.browserProfile.title": "workspace.browser",
        },
      },
      { namespace: "errors", values: { "errors.errorCode": "errorCode" } },
      { namespace: "agent", values: { "agentChat.title": "Agent" } },
      { namespace: "agentInputbar", values: { "agentChat.inputbar.send": "发送" } },
      { namespace: "agentRuntime", values: { "agentChat.runtime.title": "运行" } },
      { namespace: "agentSkills", values: { "agentChat.skills.title": "技能" } },
    ],
    schemaVersion: "lime.i18n.sourceLocaleExport.v1",
    sourceLocale: "zh-CN",
    summary: {
      namespaceCount: 9,
      sourceKeyCount,
    },
  });
  writeJson(root, "docs/roadmap/i18n/evidence/translation-coverage-report.json", {
    coverage: {
      summary: {
        extraKeyCount: 0,
        fullCoverageLocaleCount: 1,
        localeCount: 1,
        missingKeyCount: 0,
        sourceKeyCount,
      },
    },
    locales: ["en-US"],
    schemaVersion: "lime.i18n.translationCheckReport.v1",
    summary: {
      hasIssues: false,
      issueCount: 0,
      sourceKeyCount,
    },
  });
  writeJson(root, "docs/roadmap/i18n/evidence/translation-pr-pack.json", {
    schemaVersion: "lime.i18n.translationPrPack.v1",
    summary: {
      localesWithGaps: 0,
      proposedEntryCount: 0,
      sourceKeyCount,
    },
  });
  writeJson(root, "docs/roadmap/i18n/evidence/bundle-strategy-report.json", {
    schemaVersion: "lime.i18n.bundleStrategyReport.v1",
    summary: {
      inlineGroupCount: 6,
      sourceLocaleKeyCount: sourceKeyCount,
      totalRawBytes: 12345,
    },
  });
  writeJson(root, "docs/roadmap/i18n/evidence/language-boundary-report.json", {
    schemaVersion: "lime.i18n.languageBoundaryReport.v1",
    summary: {
      categorySummaries: [
        { category: "uiLocale", count: 10 },
        { category: "agentResponseLanguage", count: 3 },
        { category: "browserEnvironmentLanguage", count: 4 },
      ],
      unknownCount: 0,
    },
  });
  writeJson(
    root,
    "docs/roadmap/i18n/evidence/content-target-language-boundary-report.json",
    {
      schemaVersion: "lime.i18n.languageBoundaryReport.v1",
      summary: {
        entryCount: 12,
        unknownCount: 0,
      },
    },
  );
  writeJson(root, "docs/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json", {
    schemaVersion: "lime.i18n.i18nextCliParityBenchmark.v1",
    summary: {
      cliTypes: { exitCode: 0 },
    },
  });
  writeJson(root, "docs/roadmap/i18n/evidence/patch-retirement-gate-report.json", {
    legacy: {
      classificationDriftCandidateCount: 0,
      violationCount: 0,
      zeroReferenceCandidateCount: 0,
    },
    patch: {
      totalRuns: 3,
    },
    retirementReady: true,
    schemaVersion: "lime.i18n.patchRetirementGate.v1",
  });
  writeJson(root, "docs/roadmap/i18n/evidence/p4-readiness-report.json", {
    knownGaps: [],
    schemaVersion: "lime.i18n.p4ReadinessReport.v1",
    summary: {
      acceptanceFailedCount: 0,
      acceptancePassedCount: 3,
      acceptanceReady: true,
      deliverableFailedCount: 0,
      deliverablePassedCount: 4,
      deliverablesReady: true,
      knownGapCount: 0,
      overallStatus: "ready",
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n roadmap readiness report", () => {
  it("应聚合 P0-P4 readiness，并把 P4 已知后续缺口保留为整体状态", () => {
    const root = createTempDir();
    writeReadyRepo(root);

    const report = analyzeI18nRoadmapReadinessReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.roadmapReadinessReport.v1");
    expect(report.summary).toEqual({
      acceptanceFailedCount: 0,
      acceptancePassedCount: 16,
      deliverableFailedCount: 0,
      deliverablePassedCount: 23,
      knownGapCount: 0,
      missingEvidenceCount: 0,
      overallStatus: "ready",
      phaseCount: 5,
      phaseIncompleteCount: 0,
      phaseReadyCount: 5,
      phaseReadyWithKnownGapsCount: 0,
    });
    expect(report.phases.map((phase) => [phase.id, phase.status])).toEqual([
      ["P0", "ready"],
      ["P1", "ready"],
      ["P2", "ready"],
      ["P3", "ready"],
      ["P4", "ready"],
    ]);
    expect(formatI18nRoadmapReadinessReport(report, "text")).toContain(
      "overall status: ready",
    );
  });

  it("应在 P3 evidence source key 计数不一致时标记整体未完成", () => {
    const root = createTempDir();
    writeReadyRepo(root);
    writeJson(root, "docs/roadmap/i18n/evidence/translation-pr-pack.json", {
      schemaVersion: "lime.i18n.translationPrPack.v1",
      summary: {
        localesWithGaps: 0,
        proposedEntryCount: 0,
        sourceKeyCount: 121,
      },
    });

    const report = analyzeI18nRoadmapReadinessReport({ repoRoot: root });

    expect(report.summary.overallStatus).toBe("incomplete");
    expect(report.summary.phaseIncompleteCount).toBe(1);
    expect(
      report.phases.find((phase) => phase.id === "P3")?.status,
    ).toBe("incomplete");
    expect(
      report.phases
        .find((phase) => phase.id === "P3")
        ?.acceptance.find(
          (check) => check.id === "automation-evidence-source-key-sync",
        )?.status,
    ).toBe("failed");
  });

  it("应支持 CLI 写出 JSON evidence", () => {
    const root = createTempDir();
    writeReadyRepo(root);
    const outFile = path.join(root, "roadmap-readiness.json");
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const exitCode = runCli([
      "--format",
      "json",
      "--repo-root",
      root,
      "--output",
      outFile,
    ]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outFile, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.roadmapReadinessReport.v1",
        summary: expect.objectContaining({
          overallStatus: "ready",
        }),
      }),
    );
  });
});
