import { describe, expect, it } from "vitest";

import {
  buildVitestLayerReport,
  renderVitestLayerReportText,
} from "./vitest-layer-report.mjs";

describe("vitest-layer-report", () => {
  it("应统计每层总数、默认可运行数和 live gate 数", () => {
    const report = buildVitestLayerReport({
      includeLiveProviderTests: false,
      entries: [
        {
          file: "src/a.unit.test.ts",
          layer: "unit",
          explicitLayer: "unit",
          live: false,
          reasons: ["name:unit"],
        },
        {
          file: "src/b.live.test.ts",
          layer: "e2e",
          explicitLayer: null,
          live: true,
          reasons: ["name:live"],
        },
        {
          file: "src/c.test.tsx",
          layer: "component",
          explicitLayer: null,
          live: false,
          reasons: ["extension:tsx"],
        },
      ],
    });

    expect(report.totals).toMatchObject({
      total: 3,
      runnableByDefault: 2,
      liveGated: 1,
    });
    expect(report.layers.unit).toMatchObject({
      total: 1,
      runnableByDefault: 1,
      explicit: 1,
    });
    expect(report.layers.e2e).toMatchObject({
      total: 1,
      runnableByDefault: 0,
      liveGated: 1,
    });
  });

  it("文本报告应输出可读的分层表格", () => {
    const report = buildVitestLayerReport({
      entries: [
        {
          file: "src/a.test.ts",
          layer: "unit",
          explicitLayer: null,
          live: false,
          reasons: ["default:unit"],
        },
      ],
    });

    expect(renderVitestLayerReportText(report)).toContain("| unit | 1 |");
  });
});
