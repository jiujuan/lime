import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeI18nP4ReadinessReport,
  formatI18nP4ReadinessReport,
  runCli,
} from "./i18n-p4-readiness-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-p4-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReadyEvidence(root: string): void {
  writeJson(
    root,
    "internal/roadmap/i18n/evidence/chrome-extension-workflow-inventory.json",
    {
      schemaVersion: "lime.i18n.chromeExtensionWorkflowReport.v1",
      summary: {
        installI18nLocaleDriftCount: 0,
        optionsLanguageDriftCount: 0,
        standardChromeLocaleDecisionRecorded: true,
        standardChromeLocaleWorkflowRequired: false,
        standardChromeLocaleWorkflowPresent: false,
        terminologyPresentCount: 5,
      },
      terminology: [
        { present: true, term: "Lime Browser Bridge" },
        { present: true, term: "Lime Browser Connector" },
        { present: true, term: "Lime Agent" },
        { present: true, term: "Browser Connection" },
        { present: true, term: "Relay" },
      ],
    },
  );
  writeJson(
    root,
    "internal/roadmap/i18n/evidence/release-docs-workflow-inventory.json",
    {
      releaseDocsTranslationQueue: {
        workflowStatus: "ready",
      },
      schemaVersion: "lime.i18n.releaseDocsWorkflowReport.v1",
      summary: {
        docsUnscopedContentSourceFileCount: 0,
        hasBilingualRootReadme: true,
        hasDocsLocaleWorkflow: true,
        hasReleaseDocsTranslationQueue: true,
        hasReleaseDocsTranslationScope: true,
        hasReleaseNotesCompanion: true,
        hasReleaseNotesCompanionVersionMatch: true,
        readmeEnglishLinksReleaseNotesCompanion: true,
        releaseDocsOrphanCompanionCount: 0,
        releaseDocsTranslationQueueItemCount: 12,
        releaseDocsTranslationQueueMissingSourceCount: 0,
        releaseDocsTranslationQueueRequiredCompanionMissingCount: 0,
        releaseDocsTranslationQueueSourceOnlyCandidateCount: 12,
      },
    },
  );
  writeJson(
    root,
    "internal/roadmap/i18n/evidence/rtl-readiness-inventory.json",
    {
      schemaVersion: "lime.i18n.rtlReadinessReport.v1",
      summary: {
        highRiskFileCount: 23,
        missingPlaywrightSmokeEvidence: false,
        missingRequiredSurfaceSmokeEvidence: false,
        missingRtlScreenshotEvidence: false,
        requiredSurfaceSmokeCoveredCount: 4,
        requiredSurfaceSmokeMissingCount: 0,
      },
    },
  );
  writeJson(
    root,
    "internal/roadmap/i18n/evidence/app-metadata-workflow-inventory.json",
    {
      schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
      summary: {
        appMetadataLocaleBuildManifestReady: true,
        hasAppMetadataLocaleBuildManifest: true,
        hasInstallerLocalizationWorkflow: true,
        hasMetadataTranslationScope: true,
        metadataMissingScopedFieldCount: 0,
        metadataReviewedFieldCount: 11,
        metadataUnscopedFieldCount: 0,
      },
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n P4 readiness report", () => {
  it("应聚合 P4 evidence 并区分已满足验收与已知后续缺口", () => {
    const root = createTempDir();
    writeReadyEvidence(root);

    const report = analyzeI18nP4ReadinessReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.p4ReadinessReport.v1");
    expect(report.summary).toEqual({
      acceptanceFailedCount: 0,
      acceptancePassedCount: 3,
      acceptanceReady: true,
      deliverableFailedCount: 0,
      deliverablePassedCount: 4,
      deliverablesReady: true,
      knownGapCount: 0,
      missingEvidenceCount: 0,
      overallStatus: "ready",
    });
    expect(
      report.deliverables.map((check) => [check.id, check.status]),
    ).toEqual([
      ["chrome-extension-workflow-evaluated", "passed"],
      ["release-docs-workflow-ready", "passed"],
      ["rtl-readiness-smoke-complete", "passed"],
      ["app-metadata-localization-evaluated", "passed"],
    ]);
    expect(report.acceptance.map((check) => [check.id, check.status])).toEqual([
      ["extension-terminology-consistent", "passed"],
      ["rtl-required-surfaces-stable", "passed"],
      ["release-materials-zh-cn-en-us-covered", "passed"],
    ]);
    expect(report.knownGaps.map((gap) => gap.id)).toEqual([]);
    expect(formatI18nP4ReadinessReport(report, "text")).toContain(
      "[i18n:p4] readiness report",
    );
    expect(formatI18nP4ReadinessReport(report, "text")).toContain(
      "overall status: ready",
    );
    expect(JSON.parse(formatI18nP4ReadinessReport(report, "json"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.p4ReadinessReport.v1",
      }),
    );
  });

  it("应在 evidence 缺失或关键计数未归零时标记 P4 未完成", () => {
    const root = createTempDir();
    writeReadyEvidence(root);
    writeJson(
      root,
      "internal/roadmap/i18n/evidence/chrome-extension-workflow-inventory.json",
      {
        schemaVersion: "lime.i18n.chromeExtensionWorkflowReport.v1",
        summary: {
          installI18nLocaleDriftCount: 0,
          optionsLanguageDriftCount: 0,
          standardChromeLocaleWorkflowPresent: false,
          terminologyPresentCount: 5,
        },
        terminology: [
          { present: true, term: "Lime Browser Bridge" },
          { present: true, term: "Lime Browser Connector" },
          { present: true, term: "Lime Agent" },
          { present: true, term: "Browser Connection" },
          { present: true, term: "Relay" },
        ],
      },
    );
    writeJson(
      root,
      "internal/roadmap/i18n/evidence/release-docs-workflow-inventory.json",
      {
        releaseDocsTranslationQueue: {
          workflowStatus: "blocked",
        },
        schemaVersion: "lime.i18n.releaseDocsWorkflowReport.v1",
        summary: {
          docsUnscopedContentSourceFileCount: 1,
          hasBilingualRootReadme: true,
          hasReleaseDocsTranslationQueue: true,
          hasReleaseDocsTranslationScope: true,
          hasReleaseNotesCompanion: false,
          hasReleaseNotesCompanionVersionMatch: false,
          readmeEnglishLinksReleaseNotesCompanion: false,
          releaseDocsOrphanCompanionCount: 0,
          releaseDocsTranslationQueueItemCount: 2,
          releaseDocsTranslationQueueMissingSourceCount: 1,
          releaseDocsTranslationQueueRequiredCompanionMissingCount: 1,
        },
      },
    );

    const report = analyzeI18nP4ReadinessReport({ repoRoot: root });

    expect(report.summary.overallStatus).toBe("incomplete");
    expect(report.summary.deliverableFailedCount).toBe(1);
    expect(report.summary.acceptanceFailedCount).toBe(1);
    expect(
      report.deliverables.find(
        (check) => check.id === "release-docs-workflow-ready",
      )?.status,
    ).toBe("failed");
    expect(
      report.acceptance.find(
        (check) => check.id === "release-materials-zh-cn-en-us-covered",
      )?.status,
    ).toBe("failed");
  });

  it("应在 installer metadata locale manifest 未 ready 时保留已知缺口", () => {
    const root = createTempDir();
    writeReadyEvidence(root);
    writeJson(
      root,
      "internal/roadmap/i18n/evidence/app-metadata-workflow-inventory.json",
      {
        schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
        summary: {
          appMetadataLocaleBuildManifestReady: false,
          hasAppMetadataLocaleBuildManifest: true,
          hasInstallerLocalizationWorkflow: false,
          hasMetadataTranslationScope: true,
          metadataMissingScopedFieldCount: 0,
          metadataReviewedFieldCount: 11,
          metadataUnscopedFieldCount: 0,
        },
      },
    );

    const report = analyzeI18nP4ReadinessReport({ repoRoot: root });

    expect(report.summary.overallStatus).toBe("ready-with-known-gaps");
    expect(report.knownGaps.map((gap) => gap.id)).toEqual([
      "installer-localization-workflow-missing",
    ]);
  });

  it("应支持 CLI 写出 JSON evidence", () => {
    const root = createTempDir();
    writeReadyEvidence(root);
    const outFile = path.join(root, "p4-readiness.json");
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
        schemaVersion: "lime.i18n.p4ReadinessReport.v1",
        summary: expect.objectContaining({
          overallStatus: "ready",
        }),
      }),
    );
  });
});
