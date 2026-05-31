import { describe, expect, it } from "vitest";

import { parseArgs } from "./run-vitest-layer.mjs";

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
});
