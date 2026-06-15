import { describe, expect, it } from "vitest";

import { normalizeExecutionStrategyToReact } from "./executionStrategyCompat";

describe("executionStrategyCompat", () => {
  it("只把历史策略输入归一为 current react", () => {
    expect(normalizeExecutionStrategyToReact("react")).toBe("react");
    expect(
      normalizeExecutionStrategyToReact("code_orchestrated"),
    ).toBe("react");
    expect(normalizeExecutionStrategyToReact("auto")).toBe("react");
    expect(normalizeExecutionStrategyToReact("unknown")).toBeNull();
    expect(normalizeExecutionStrategyToReact(undefined)).toBeNull();
  });
});
