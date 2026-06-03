import { describe, expect, it } from "vitest";

import { isVitestRunnableTestFile } from "./vitest-test-file-filter.mjs";

describe("vitest-test-file-filter", () => {
  it("应保留真实 Vitest 测试文件", () => {
    expect(isVitestRunnableTestFile("src/Foo.test.tsx")).toBe(true);
    expect(isVitestRunnableTestFile("src/Foo.unit.test.ts")).toBe(true);
  });

  it("应排除测试夹具支持文件", () => {
    expect(isVitestRunnableTestFile("src/Foo.testFixtures.tsx")).toBe(false);
    expect(isVitestRunnableTestFile("src/Foo.test-fixture.tsx")).toBe(false);
    expect(isVitestRunnableTestFile("src/Foo.test_fixtures.ts")).toBe(false);
  });
});
