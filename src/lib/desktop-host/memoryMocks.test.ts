import { describe, expect, it } from "vitest";
import { memoryMocks } from "./memoryMocks";

describe("memoryMocks", () => {
  it("不再注册旧 project_memory_get 聚合读默认 mock", () => {
    expect(memoryMocks).not.toHaveProperty("project_memory_get");
    expect(memoryMocks).toHaveProperty("memory_runtime_get_overview");
  });
});
