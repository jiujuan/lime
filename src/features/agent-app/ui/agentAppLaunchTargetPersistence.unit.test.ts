import { describe, expect, it } from "vitest";
import {
  AGENT_APP_RIGHT_SURFACE_TARGET_STORAGE_KEY,
  loadAgentAppRightSurfaceLaunchTargetsFromStorage,
  parseAgentAppRightSurfaceLaunchTargets,
  saveAgentAppRightSurfaceLaunchTargetsToStorage,
  serializeAgentAppRightSurfaceLaunchTargets,
  upsertAgentAppRightSurfaceLaunchTarget,
  type AgentAppLaunchTargetStorage,
} from "./agentAppLaunchTargetPersistence";

class MemoryStorage implements AgentAppLaunchTargetStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("agentAppLaunchTargetPersistence", () => {
  it("将新的 Claw 会话目标放到最前并按稳定 id 去重", () => {
    const targets = upsertAgentAppRightSurfaceLaunchTarget(
      [
        {
          workspaceId: "workspace-main",
          sessionId: "session-main",
          label: "旧标题",
        },
        {
          workspaceId: "workspace-main",
          sessionId: "session-review",
        },
      ],
      {
        workspaceId: " workspace-main ",
        sessionId: " session-main ",
        label: "新标题",
      },
    );

    expect(targets).toEqual([
      {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "新标题",
      },
      {
        workspaceId: "workspace-main",
        sessionId: "session-review",
      },
    ]);
  });

  it("最多保留指定数量的最近 Claw 会话目标", () => {
    const targets = upsertAgentAppRightSurfaceLaunchTarget(
      [
        { sessionId: "session-1" },
        { sessionId: "session-2" },
        { sessionId: "session-3" },
      ],
      { sessionId: "session-0" },
      2,
    );

    expect(targets).toEqual([
      { sessionId: "session-0" },
      { sessionId: "session-1" },
    ]);
  });

  it("解析持久化内容时过滤无效项和非 session 目标", () => {
    const targets = parseAgentAppRightSurfaceLaunchTargets(
      JSON.stringify([
        null,
        "bad-target",
        { workspaceId: "workspace-only" },
        { workspaceId: 123, sessionId: "session-main" },
        { workspaceId: "workspace-main", sessionId: "session-main" },
        { workspaceId: "workspace-main", sessionId: "session-main" },
        {
          workspaceId: "workspace-main",
          sessionId: "session-review",
          title: "复盘会话",
        },
      ]),
    );

    expect(targets).toEqual([
      { sessionId: "session-main" },
      { workspaceId: "workspace-main", sessionId: "session-main" },
      {
        workspaceId: "workspace-main",
        sessionId: "session-review",
        title: "复盘会话",
      },
    ]);
  });

  it("坏 JSON 和非数组内容返回空列表", () => {
    expect(parseAgentAppRightSurfaceLaunchTargets("{bad json")).toEqual([]);
    expect(parseAgentAppRightSurfaceLaunchTargets("{}")).toEqual([]);
    expect(parseAgentAppRightSurfaceLaunchTargets(null)).toEqual([]);
  });

  it("序列化后可以恢复同一组目标", () => {
    const serialized = serializeAgentAppRightSurfaceLaunchTargets([
      {
        workspaceId: " workspace-main ",
        sessionId: " session-main ",
        label: "主会话",
      },
      { sessionId: " " },
    ]);

    expect(parseAgentAppRightSurfaceLaunchTargets(serialized)).toEqual([
      {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "主会话",
      },
    ]);
  });

  it("从 storage 读取和写回最近目标", () => {
    const storage = new MemoryStorage();
    saveAgentAppRightSurfaceLaunchTargetsToStorage(storage, [
      { workspaceId: "workspace-main", sessionId: "session-main" },
    ]);

    expect(
      storage.getItem(AGENT_APP_RIGHT_SURFACE_TARGET_STORAGE_KEY),
    ).toContain("session-main");
    expect(loadAgentAppRightSurfaceLaunchTargetsFromStorage(storage)).toEqual([
      { workspaceId: "workspace-main", sessionId: "session-main" },
    ]);
  });

  it("storage 不可用时 fail closed", () => {
    const storage: AgentAppLaunchTargetStorage = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      },
    };

    expect(loadAgentAppRightSurfaceLaunchTargetsFromStorage(storage)).toEqual(
      [],
    );
    expect(() =>
      saveAgentAppRightSurfaceLaunchTargetsToStorage(storage, [
        { sessionId: "session-main" },
      ]),
    ).not.toThrow();
  });
});
