import { describe, expect, it } from "vitest";

import {
  buildBatches,
  buildRelatedModeInvocation,
  buildVitestCommandArgs,
  findFirstResumableBatchIndex,
  markSkippedBatches,
  parseSmartArgs,
  selectBatchIndexesForRun,
} from "../run-vitest-smart.mjs";

describe("run-vitest-smart", () => {
  it("应解析可恢复批次参数并过滤重复 --run", () => {
    const parsed = parseSmartArgs([
      "--run",
      "--resume",
      "--from-batch",
      "12",
      "--only-batch=15",
      "--json",
    ]);

    expect(parsed.passthroughArgs).toEqual([]);
    expect(parsed.options).toMatchObject({
      fromBatch: 12,
      json: true,
      onlyBatch: 15,
      resume: true,
    });
  });

  it("应保留普通 Vitest 文件过滤参数的原有透传行为", () => {
    const parsed = parseSmartArgs([
      "src/foo.test.ts",
      "--testNamePattern",
      "bar",
    ]);

    expect(parsed.options.related).toBe(false);
    expect(parsed.options.changed).toBe(false);
    expect(parsed.passthroughArgs).toEqual([
      "src/foo.test.ts",
      "--testNamePattern",
      "bar",
    ]);
  });

  it("应按上次失败、运行中或未完成批次恢复", () => {
    expect(
      findFirstResumableBatchIndex({
        batches: [
          { index: 1, status: "passed" },
          { index: 2, status: "failed" },
          { index: 3, status: "pending" },
        ],
      }),
    ).toBe(1);

    expect(
      findFirstResumableBatchIndex({
        batches: [
          { index: 1, status: "passed" },
          { index: 2, status: "running" },
          { index: 3, status: "pending" },
        ],
      }),
    ).toBe(1);
  });

  it("应支持从指定批次或只跑指定批次", () => {
    expect(
      selectBatchIndexesForRun({
        totalBatches: 5,
        fromBatch: 3,
        onlyBatch: null,
      }),
    ).toEqual([2, 3, 4]);

    expect(
      selectBatchIndexesForRun({
        totalBatches: 5,
        fromBatch: null,
        onlyBatch: 4,
      }),
    ).toEqual([3]);
  });

  it("应把 from-batch 前面的批次标记为 skipped，避免 resume 回到第 1 批", () => {
    const state = {
      batches: [
        { index: 1, status: "pending" },
        { index: 2, status: "pending" },
        { index: 3, status: "pending" },
      ],
    };

    const nextState = markSkippedBatches(state, [1, 2]);

    expect(nextState.batches).toEqual([
      { index: 1, status: "skipped" },
      { index: 2, status: "pending" },
      { index: 3, status: "pending" },
    ]);
    expect(findFirstResumableBatchIndex(nextState)).toBe(1);
  });

  it("related 模式应使用 Vitest related 命令而不是把 related 当文件过滤", () => {
    const args = buildVitestCommandArgs(["src/foo.ts"], {
      command: "related",
    });

    expect(args).toEqual(
      expect.arrayContaining(["related", "--run", "src/foo.ts"]),
    );
    expect(args.indexOf("related")).toBeLessThan(args.indexOf("src/foo.ts"));
  });

  it("related 模式跑前端源码时默认排除 Electron main 源码扫描", () => {
    expect(
      buildRelatedModeInvocation(["src/components/agent/chat/index.tsx"]),
    ).toEqual({
      command: "related",
      args: ["--exclude", "electron/**", "src/components/agent/chat/index.tsx"],
    });
  });

  it("related 模式输入 Electron 源码时直接运行相邻测试", () => {
    expect(
      buildRelatedModeInvocation(["electron/hostCommands.ts", "--bail=1"]),
    ).toEqual({
      command: "run",
      args: ["electron/hostCommands.test.ts", "--bail=1"],
    });
  });

  it("related 模式输入 Electron 测试文件时直接运行该测试", () => {
    expect(buildRelatedModeInvocation(["electron/preload.test.ts"])).toEqual({
      command: "run",
      args: ["electron/preload.test.ts"],
    });
  });

  it("应保持串行测试独立成批，其它测试按批次大小聚合", () => {
    const batches = buildBatches([
      "scripts/lib/harness-eval-history-window.test.ts",
      "src/example/a.test.ts",
      "src/example/b.test.ts",
    ]);

    expect(batches[0]).toEqual([
      "scripts/lib/harness-eval-history-window.test.ts",
    ]);
    expect(batches[1]).toEqual([
      "src/example/a.test.ts",
      "src/example/b.test.ts",
    ]);
  });
});
