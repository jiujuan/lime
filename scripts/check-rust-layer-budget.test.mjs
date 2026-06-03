import { describe, expect, it } from "vitest";

import {
  evaluateRustLayerBudget,
  parseArgs,
  renderBudgetResultText,
} from "./check-rust-layer-budget.mjs";

function buildReport({ e2eEntries = [] } = {}) {
  return {
    layers: {
      e2e: {
        runnableByDefault: e2eEntries.length,
      },
    },
    entries: [
      ...e2eEntries,
      {
        file: "src-tauri/tests/real_web_search.rs",
        layer: "e2e",
        packageName: "lime",
        liveGated: true,
        runnableByDefault: false,
      },
    ],
  };
}

describe("check-rust-layer-budget", () => {
  it("应解析 Rust layer 预算参数", () => {
    expect(parseArgs(["--max-e2e-runnable", "0", "--json"])).toMatchObject({
      json: true,
      maxE2eRunnable: 0,
    });
  });

  it("应在 e2e 测试全部 ignore 时通过", () => {
    expect(evaluateRustLayerBudget(buildReport())).toMatchObject({
      ok: true,
      e2eRunnable: 0,
    });
  });

  it("允许 unit 文件同时包含普通单测和 ignored live 测试", () => {
    const result = evaluateRustLayerBudget({
      layers: {
        e2e: {
          runnableByDefault: 0,
        },
      },
      entries: [
        {
          file: "src-tauri/src/services/skill_cmd.rs",
          layer: "unit",
          packageName: "lime",
          cargoScope: "workspace",
          testCount: 3,
          ignoredCount: 1,
          liveGated: true,
          runnableByDefault: true,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      e2eRunnable: 0,
    });
  });

  it("应在 e2e 文件存在非 ignore 测试时失败并输出文件", () => {
    const result = evaluateRustLayerBudget(
      buildReport({
        e2eEntries: [
          {
            file: "src-tauri/tests/live_provider.rs",
            layer: "e2e",
            packageName: "lime",
            cargoScope: "workspace",
            testCount: 2,
            ignoredCount: 1,
            liveGated: true,
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      e2eOverBudgetBy: 1,
    });
    expect(renderBudgetResultText(result)).toContain(
      "- src-tauri/tests/live_provider.rs (lime, runnable tests=1)",
    );
  });
});
