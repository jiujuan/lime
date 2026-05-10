import { beforeEach, describe, expect, it } from "vitest";

import {
  getI18nPatchMetricsReport,
  recordI18nLanguageChange,
  replaceTextInDOM,
  replaceTextInNode,
  resetI18nPatchMetrics,
} from "../legacy-patch/dom-replacer";

describe("legacy patch metrics", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetI18nPatchMetrics();
  });

  it("应统计 DOM Patch 命中节点与命中文本段", () => {
    document.body.innerHTML = "<button>设置</button><span>通用</span>";

    const run = replaceTextInDOM("en");
    const report = getI18nPatchMetricsReport();

    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).toContain("General");
    expect(run.replacedNodes).toBe(2);
    expect(run.matchedSegments).toBe(2);
    expect(report.totalRuns).toBe(1);
    expect(report.totalReplacedNodes).toBe(2);
    expect(report.totalMatchedSegments).toBe(2);
    expect(report.lastRun?.language).toBe("en");
  });

  it("应记录零命中运行，支撑 Patch 退出报告", () => {
    document.body.innerHTML = "<section>No Chinese text</section>";

    replaceTextInDOM("en");
    const report = getI18nPatchMetricsReport();

    expect(report.totalRuns).toBe(1);
    expect(report.totalReplacedNodes).toBe(0);
    expect(report.totalMatchedSegments).toBe(0);
    expect(report.recentRuns[0]?.rootKind).toBe("document");
  });

  it("应分别记录语言切换与子树 Patch", () => {
    document.body.innerHTML = "<main><span>设置</span></main>";
    const span = document.querySelector("span");

    recordI18nLanguageChange();
    if (span) {
      replaceTextInNode(span, "en");
    }
    const report = getI18nPatchMetricsReport();

    expect(report.languageChanges).toBe(1);
    expect(report.totalRuns).toBe(1);
    expect(report.recentRuns[0]?.rootKind).toBe("element");
  });
});
