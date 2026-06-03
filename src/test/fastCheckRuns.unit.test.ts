import { describe, expect, it } from "vitest";

import { fastCheckRuns } from "./fastCheckRuns";

describe("fastCheckRuns", () => {
  it("本地默认把属性测试降到 25 runs", () => {
    expect(fastCheckRuns(100, { env: {} })).toBe(25);
    expect(fastCheckRuns(50, { env: {} })).toBe(25);
  });

  it("CI 保持原始 runs 数量", () => {
    expect(fastCheckRuns(100, { env: { CI: "true" } })).toBe(100);
    expect(fastCheckRuns(50, { env: { CI: "1" } })).toBe(50);
  });

  it("环境变量可显式覆盖 runs 数量", () => {
    expect(fastCheckRuns(100, { env: { LIME_FAST_CHECK_RUNS: "10" } })).toBe(
      10,
    );
  });

  it("本地 runs 不超过 CI runs 且至少为 1", () => {
    expect(fastCheckRuns(5, { env: {}, localRuns: 25 })).toBe(5);
    expect(fastCheckRuns(100, { env: {}, localRuns: 0 })).toBe(1);
  });
});
