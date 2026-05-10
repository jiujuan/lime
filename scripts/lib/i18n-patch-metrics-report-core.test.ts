import { describe, expect, it } from "vitest";

import {
  createI18nPatchMetricsReport,
  renderI18nPatchMetricsTextReport,
} from "./i18n-patch-metrics-report-core.mjs";

describe("i18n-patch-metrics-report-core", () => {
  it("应把 runtime metrics 转成稳定报告，并保留门限问题", () => {
    const report = createI18nPatchMetricsReport({
      generatedAt: "2026-05-10T00:00:00.000Z",
      sourcePath: ".lime/i18n/patch-metrics.json",
      thresholds: {
        maxMatchedSegments: 1,
        maxReplacedNodes: 1,
      },
      metrics: {
        patchTimes: [10, 20],
        languageChanges: 2,
        totalRuns: 2,
        totalReplacedNodes: 3,
        totalMatchedSegments: 4,
        runs: [
          {
            durationMs: 10,
            language: "en",
            matchedSegments: 4,
            replacedNodes: 3,
            rootKind: "document",
            timestamp: 1778400000000,
          },
        ],
      },
    });

    expect(report.schemaVersion).toBe("lime.i18n.patchMetricsReport.v1");
    expect(report.status).toBe("active-patch");
    expect(report.retirementCandidate).toBe(false);
    expect(report.summary.totalMatchedSegments).toBe(4);
    expect(report.summary.averagePatchTimeMs).toBe(15);
    expect(report.thresholdIssues.map((issue) => issue.field)).toEqual([
      "totalMatchedSegments",
      "totalReplacedNodes",
    ]);
  });

  it("应识别零命中样本为退出候选，但不等价于可直接删除", () => {
    const report = createI18nPatchMetricsReport({
      metrics: {
        languageChanges: 1,
        recentRuns: [
          {
            durationMs: 2,
            language: "en",
            matchedSegments: 0,
            replacedNodes: 0,
            rootKind: "document",
            timestamp: 1778400000000,
          },
        ],
        totalMatchedSegments: 0,
        totalReplacedNodes: 0,
        totalRuns: 1,
      },
    });

    expect(report.status).toBe("no-hit");
    expect(report.retirementCandidate).toBe(true);
    expect(report.recommendations.join("\n")).toContain("不能直接删除");
  });

  it("应渲染可读文本报告", () => {
    const report = createI18nPatchMetricsReport({
      generatedAt: "2026-05-10T00:00:00.000Z",
      metrics: {},
      sourcePath: "",
    });
    const text = renderI18nPatchMetricsTextReport(report);

    expect(text).toContain("Lime i18n Patch Metrics Report");
    expect(text).toContain("状态: missing-metrics");
    expect(text).toContain("退出候选: no");
  });
});
