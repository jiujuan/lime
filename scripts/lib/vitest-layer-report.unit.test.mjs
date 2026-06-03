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
          unitMigrationHints: ["large-component-suite"],
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
    expect(report.componentUnitMigrationCandidates).toMatchObject({
      total: 1,
      byHint: {
        "large-component-suite": 1,
      },
      files: [
        {
          file: "src/c.test.tsx",
          hints: ["large-component-suite"],
        },
      ],
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

  it("文本报告应输出组件 VM 迁移候选", () => {
    const report = buildVitestLayerReport({
      entries: [
        {
          file: "src/components/Foo.test.tsx",
          layer: "component",
          explicitLayer: null,
          live: false,
          reasons: ["react-testing-library"],
          unitMigrationHints: [
            "large-component-suite",
            "business-logic-keywords",
          ],
        },
      ],
    });

    const text = renderVitestLayerReportText(report);

    expect(text).toContain("Component unit-migration candidates: 1");
    expect(text).toContain(
      "- src/components/Foo.test.tsx (large-component-suite, business-logic-keywords)",
    );
  });

  it("应从统计中排除测试夹具支持文件", () => {
    const report = buildVitestLayerReport({
      entries: [
        {
          file: "src/components/Foo.testFixtures.tsx",
          layer: "component",
          explicitLayer: null,
          live: false,
          reasons: ["browser-dom"],
          unitMigrationHints: ["large-component-file"],
        },
        {
          file: "src/components/Foo.test.tsx",
          layer: "component",
          explicitLayer: null,
          live: false,
          reasons: ["browser-dom"],
          unitMigrationHints: ["large-component-file"],
        },
      ],
    });

    expect(report.totals.total).toBe(1);
    expect(report.layers.component.total).toBe(1);
    expect(report.componentUnitMigrationCandidates.files).toEqual([
      {
        file: "src/components/Foo.test.tsx",
        hints: ["large-component-file"],
      },
    ]);
  });
});
