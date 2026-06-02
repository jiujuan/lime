import { afterEach, describe, expect, it } from "vitest";

import {
  getExecutionStrategyStorageKey,
  loadPersisted,
  loadTransient,
  resolvePersistedExecutionStrategy,
  resolveWorkspaceAgentPreferences,
} from "./agentChatStorage";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("agentChatStorage", () => {
  it("读取超大的会话临时态时应直接丢弃，避免同步 JSON parse 卡住会话切换", () => {
    const key = "aster_thread_items_workspace-1";
    sessionStorage.setItem(key, `"${"x".repeat(1_500_001)}"`);

    expect(loadTransient(key, ["fallback"])).toEqual(["fallback"]);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("读取超大的会话快照 map 时应直接丢弃，避免点击旧对话时解析历史大缓存", () => {
    const key = "aster_session_snapshots_workspace-1";
    sessionStorage.setItem(key, `{"topic-heavy":"${"x".repeat(1_500_001)}"}`);

    expect(loadTransient(key, { fallback: true })).toEqual({ fallback: true });
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("读取超大的持久化会话快照 map 时应直接丢弃，避免 localStorage 解析阻塞", () => {
    const key = "aster_session_snapshots_persisted_workspace-1";
    localStorage.setItem(key, `{"topic-heavy":"${"x".repeat(1_500_001)}"}`);

    expect(loadPersisted(key, { fallback: true })).toEqual({
      fallback: true,
    });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("没有任何持久化偏好时不应回退到硬编码 Claude 默认值", () => {
    expect(resolveWorkspaceAgentPreferences("workspace-empty-pref")).toEqual({
      providerType: "",
      model: "",
    });
  });

  it("有 workspace 但没有持久化执行策略时应默认进入普通 Agent 主链", () => {
    expect(resolvePersistedExecutionStrategy("workspace-code-default")).toBe(
      "react",
    );
  });

  it("没有 workspace 时执行策略应降级为普通对话", () => {
    expect(resolvePersistedExecutionStrategy(null)).toBe("react");
  });

  it("已有 current workspace 执行策略偏好时应保持普通 Agent 主链", () => {
    const storageKey = getExecutionStrategyStorageKey("workspace-user-pref");
    expect(storageKey).toBeTruthy();
    localStorage.setItem(storageKey!, JSON.stringify("react"));

    expect(resolvePersistedExecutionStrategy("workspace-user-pref")).toBe(
      "react",
    );
  });

  it("读取 legacy code_orchestrated 偏好时应归一到普通 Agent 主链", () => {
    const storageKey = getExecutionStrategyStorageKey("workspace-legacy-code");
    expect(storageKey).toBeTruthy();
    localStorage.setItem(storageKey!, JSON.stringify("code_orchestrated"));

    expect(resolvePersistedExecutionStrategy("workspace-legacy-code")).toBe(
      "react",
    );
  });

  it("读取 legacy auto 偏好时应归一到普通 Agent 主链", () => {
    const storageKey = getExecutionStrategyStorageKey("workspace-legacy-auto");
    expect(storageKey).toBeTruthy();
    localStorage.setItem(storageKey!, JSON.stringify("auto"));

    expect(resolvePersistedExecutionStrategy("workspace-legacy-auto")).toBe(
      "react",
    );
  });
});
