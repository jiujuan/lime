import { describe, expect, it } from "vitest";
import { memoryMocks } from "./memoryMocks";

describe("memoryMocks", () => {
  it("不再注册记忆旧命令默认 mock", () => {
    expect(memoryMocks).not.toHaveProperty("project_memory_get");
    expect(memoryMocks).not.toHaveProperty("memory_runtime_get_overview");
    expect(memoryMocks).not.toHaveProperty("memory_runtime_get_stats");
    expect(memoryMocks).not.toHaveProperty("memory_runtime_request_analysis");
    expect(memoryMocks).not.toHaveProperty("memory_runtime_cleanup");
    expect(memoryMocks).not.toHaveProperty("memory_runtime_get_working_memory");
    expect(memoryMocks).not.toHaveProperty(
      "memory_runtime_get_extraction_status",
    );
    expect(memoryMocks).not.toHaveProperty("memory_runtime_prefetch_for_turn");
    expect(memoryMocks).not.toHaveProperty("memory_get_effective_sources");
    expect(memoryMocks).not.toHaveProperty("memory_get_auto_index");
    expect(memoryMocks).not.toHaveProperty("memory_toggle_auto");
    expect(memoryMocks).not.toHaveProperty("memory_update_auto_note");
    expect(memoryMocks).not.toHaveProperty("memory_cleanup_memdir");
    expect(memoryMocks).not.toHaveProperty("memory_scaffold_memdir");
    expect(memoryMocks).not.toHaveProperty(
      "memory_scaffold_runtime_agents_template",
    );
    expect(memoryMocks).not.toHaveProperty(
      "memory_ensure_workspace_local_agents_gitignore",
    );
  });
});
