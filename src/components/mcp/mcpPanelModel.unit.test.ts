import { describe, expect, it } from "vitest";
import {
  getMcpCapabilityCount,
  getMcpPanelStatusMeta,
  getMcpTabCount,
  getRunningMcpServerCount,
  type McpPanelTabCounts,
} from "./mcpPanelModel";

describe("mcpPanelModel", () => {
  it("统计运行中服务器和能力总数", () => {
    expect(
      getRunningMcpServerCount([
        { is_running: true },
        { is_running: false },
        { is_running: true },
      ]),
    ).toBe(2);

    expect(
      getMcpCapabilityCount({
        tools: [{ name: "search" }],
        prompts: [{ name: "summary" }, { name: "rewrite" }],
        resources: [],
      }),
    ).toBe(3);
  });

  it("按 Tab 映射摘要计数", () => {
    const counts: McpPanelTabCounts = {
      servers: 2,
      tools: 3,
      prompts: 4,
      resources: 5,
    };

    expect(getMcpTabCount("runtime", counts)).toBe(2);
    expect(getMcpTabCount("config", counts)).toBe(2);
    expect(getMcpTabCount("tools", counts)).toBe(3);
    expect(getMcpTabCount("prompts", counts)).toBe(4);
    expect(getMcpTabCount("resources", counts)).toBe(5);
  });

  it("同步状态优先显示错误，其次显示加载态", () => {
    expect(getMcpPanelStatusMeta({ loading: true, error: "boom" }).status).toBe(
      "error",
    );

    const loadingMeta = getMcpPanelStatusMeta({ loading: true, error: null });
    expect(loadingMeta.status).toBe("loading");
    expect(loadingMeta.spinning).toBe(true);

    expect(getMcpPanelStatusMeta({ loading: false, error: null }).status).toBe(
      "ready",
    );
  });
});
