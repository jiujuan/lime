import { describe, expect, it } from "vitest";

import { parseArgs, selectLayerEntries } from "./run-vitest-layer.mjs";

describe("run-vitest-layer 参数解析", () => {
  it("应把 Vitest 选项透传给 Vitest，而不是当成文件过滤器", () => {
    expect(parseArgs(["unit", "--run", "--reporter=dot"])).toMatchObject({
      layer: "unit",
      filters: [],
      vitestArgs: ["--reporter=dot"],
    });
  });

  it("应保留普通路径作为当前层文件过滤器", () => {
    expect(parseArgs(["unit", "src/lib/foo.test.ts"])).toMatchObject({
      layer: "unit",
      filters: ["src/lib/foo.test.ts"],
      vitestArgs: [],
    });
  });

  it("显式过滤器命中当前层时返回目标层文件", () => {
    const result = selectLayerEntries(
      [
        { file: "src/lib/foo.unit.test.ts", layer: "unit" },
        { file: "src/lib/foo.boundary.test.ts", layer: "integration" },
      ],
      "unit",
      ["src/lib/foo.unit.test.ts"],
    );

    expect(result).toMatchObject({
      entries: [{ file: "src/lib/foo.unit.test.ts", layer: "unit" }],
      filterMisses: [],
    });
  });

  it("显式过滤器只命中其他层时返回错层失败信息", () => {
    const result = selectLayerEntries(
      [
        {
          file: "scripts/rust-test-layer-classifier.test.mjs",
          layer: "integration",
        },
      ],
      "unit",
      ["scripts/rust-test-layer-classifier.test.mjs"],
    );

    expect(result.entries).toEqual([]);
    expect(result.filterMisses).toEqual([
      {
        filter: "scripts/rust-test-layer-classifier.test.mjs",
        reason: "wrong-layer",
        layers: ["integration"],
      },
    ]);
  });

  it("显式过滤器没有命中任何可运行测试文件时返回失败信息", () => {
    const result = selectLayerEntries(
      [{ file: "src/lib/foo.unit.test.ts", layer: "unit" }],
      "unit",
      ["src/lib/missing.unit.test.ts"],
    );

    expect(result.entries).toEqual([]);
    expect(result.filterMisses).toEqual([
      {
        filter: "src/lib/missing.unit.test.ts",
        reason: "no-runnable-test-file",
        layers: [],
      },
    ]);
  });
});
