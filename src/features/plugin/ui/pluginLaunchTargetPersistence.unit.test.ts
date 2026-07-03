import { describe, expect, it } from "vitest";
import {
  PLUGIN_RIGHT_SURFACE_TARGET_STORAGE_KEY,
  loadPluginRightSurfaceLaunchTargetsFromStorage,
  parsePluginRightSurfaceLaunchTargets,
  savePluginRightSurfaceLaunchTargetsToStorage,
  serializePluginRightSurfaceLaunchTargets,
  upsertPluginRightSurfaceLaunchTarget,
  type PluginLaunchTargetStorage,
} from "./pluginLaunchTargetPersistence";

class MemoryStorage implements PluginLaunchTargetStorage {
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

describe("pluginLaunchTargetPersistence", () => {
  it("将新的 Claw 会话目标放到最前并按稳定 id 去重", () => {
    const targets = upsertPluginRightSurfaceLaunchTarget(
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
    const targets = upsertPluginRightSurfaceLaunchTarget(
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
    const targets = parsePluginRightSurfaceLaunchTargets(
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
    expect(parsePluginRightSurfaceLaunchTargets("{bad json")).toEqual([]);
    expect(parsePluginRightSurfaceLaunchTargets("{}")).toEqual([]);
    expect(parsePluginRightSurfaceLaunchTargets(null)).toEqual([]);
  });

  it("序列化后可以恢复同一组目标", () => {
    const serialized = serializePluginRightSurfaceLaunchTargets([
      {
        workspaceId: " workspace-main ",
        sessionId: " session-main ",
        label: "主会话",
      },
      { sessionId: " " },
    ]);

    expect(parsePluginRightSurfaceLaunchTargets(serialized)).toEqual([
      {
        workspaceId: "workspace-main",
        sessionId: "session-main",
        label: "主会话",
      },
    ]);
  });

  it("从 storage 读取和写回最近目标", () => {
    const storage = new MemoryStorage();
    savePluginRightSurfaceLaunchTargetsToStorage(storage, [
      { workspaceId: "workspace-main", sessionId: "session-main" },
    ]);

    expect(
      storage.getItem(PLUGIN_RIGHT_SURFACE_TARGET_STORAGE_KEY),
    ).toContain("session-main");
    expect(loadPluginRightSurfaceLaunchTargetsFromStorage(storage)).toEqual([
      { workspaceId: "workspace-main", sessionId: "session-main" },
    ]);
  });

  it("storage 不可用时 fail closed", () => {
    const storage: PluginLaunchTargetStorage = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      },
    };

    expect(loadPluginRightSurfaceLaunchTargetsFromStorage(storage)).toEqual(
      [],
    );
    expect(() =>
      savePluginRightSurfaceLaunchTargetsToStorage(storage, [
        { sessionId: "session-main" },
      ]),
    ).not.toThrow();
  });
});
