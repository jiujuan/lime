import { describe, expect, it } from "vitest";

import {
  countExecutedTestsFromCargoOutput,
  findCargoTestFilters,
  shouldFailOnZeroExecutedTests,
} from "./run-rust-layer.mjs";

describe("run-rust-layer unit helpers", () => {
  it("识别 Cargo package 参数后的测试过滤器", () => {
    expect(
      findCargoTestFilters(["-p", "lime-agent", "request_tool_policy"]),
    ).toEqual(["request_tool_policy"]);
  });

  it("不会把 Cargo 选项值当成测试过滤器", () => {
    expect(
      findCargoTestFilters([
        "--package=lime-agent",
        "--features",
        "offline-fixtures",
        "--workspace",
      ]),
    ).toEqual([]);
  });

  it("统计 Cargo 输出里真实执行过的测试数量", () => {
    expect(
      countExecutedTestsFromCargoOutput(`
running 1 test
test workspace_support::tests::sanitize_project_dir_name_should_replace_invalid_chars ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 1551 filtered out; finished in 0.01s
`),
    ).toBe(1);
  });

  it("过滤器空跑时统计为 0 个执行测试", () => {
    expect(
      countExecutedTestsFromCargoOutput(`
running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 1552 filtered out; finished in 0.00s
`),
    ).toBe(0);
  });

  it("只在带测试过滤器且非 --list 时启用空跑失败保护", () => {
    expect(
      shouldFailOnZeroExecutedTests(
        ["-p", "lime-agent", "request_tool_policy"],
        [],
      ),
    ).toBe(true);
    expect(shouldFailOnZeroExecutedTests(["--workspace"], [])).toBe(false);
    expect(
      shouldFailOnZeroExecutedTests(["request_tool_policy"], ["--list"]),
    ).toBe(false);
  });
});
