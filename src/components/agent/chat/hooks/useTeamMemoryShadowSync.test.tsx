import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTeamMemorySnapshot } from "@/lib/teamMemorySync";
import type { TeamDefinition } from "../utils/teamDefinitions";
import { useTeamMemoryShadowSync } from "./useTeamMemoryShadowSync";

interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface HookHarness {
  rerender: (options: HookOptions) => void;
  unmount: () => void;
}

interface HookOptions {
  repoScope?: string | null;
  activeTheme?: string | null;
  sessionId?: string | null;
  selectedTeam?: TeamDefinition | null;
  storage: MemoryStorage;
}

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function mountHook(initialOptions: HookOptions): HookHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function TestComponent({ options }: { options: HookOptions }) {
    useTeamMemoryShadowSync(options);
    return null;
  }

  const render = (options: HookOptions) => {
    act(() => {
      root.render(<TestComponent options={options} />);
    });
  };

  render(initialOptions);

  return {
    rerender: render,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function createSelectedTeam(): TeamDefinition {
  return {
    id: "team-research",
    source: "builtin",
    label: "研究双人组",
    description: "负责梳理主线、拆分并验证关键任务。",
    presetId: "research-team",
    roles: [
      {
        id: "researcher",
        label: "研究员",
        summary: "整理上下文和证据。",
      },
      {
        id: "executor",
        label: "执行员",
        summary: "把方案落到代码与验证。",
      },
    ],
  };
}

describe("useTeamMemoryShadowSync", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("只应把 Subagents profile 选择写入 repo 作用域快照", () => {
    const storage = createMemoryStorage();
    const harness = mountHook({
      storage,
      repoScope: "/tmp/repo",
      activeTheme: "general",
      sessionId: "session-a",
      selectedTeam: createSelectedTeam(),
    });

    try {
      const snapshot = readTeamMemorySnapshot(storage, "/tmp/repo");
      expect(snapshot?.entries["team.selection"]?.content).toContain(
        "Subagents profile：研究双人组",
      );
      expect(snapshot?.entries["team.selection"]?.content).toContain("角色：");
      expect(Object.keys(snapshot?.entries ?? {})).toEqual(["team.selection"]);
    } finally {
      harness.unmount();
    }
  });

  it("应在运行态清空后移除团队条目，但保留无关 memory", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "lime:team-memory:/tmp/repo",
      JSON.stringify({
        repoScope: "/tmp/repo",
        entries: {
          "team.subagents": {
            key: "team.subagents",
            content: "旧子任务影子",
            updatedAt: 1,
          },
          "team.parent_context": {
            key: "team.parent_context",
            content: "旧父会话影子",
            updatedAt: 1,
          },
          keep: {
            key: "keep",
            content: "保留的外部约定",
            updatedAt: 1,
          },
        },
      }),
    );

    const harness = mountHook({
      storage,
      repoScope: "/tmp/repo",
      activeTheme: "general",
      sessionId: "session-a",
      selectedTeam: createSelectedTeam(),
    });

    try {
      harness.rerender({
        storage,
        repoScope: "/tmp/repo",
        activeTheme: "general",
        sessionId: "session-a",
        selectedTeam: null,
      });

      const snapshot = readTeamMemorySnapshot(storage, "/tmp/repo");
      expect(snapshot?.entries.keep?.content).toBe("保留的外部约定");
      expect(snapshot?.entries["team.selection"]).toBeUndefined();
      expect(snapshot?.entries["team.subagents"]).toBeUndefined();
      expect(snapshot?.entries["team.parent_context"]).toBeUndefined();
    } finally {
      harness.unmount();
    }
  });
});
