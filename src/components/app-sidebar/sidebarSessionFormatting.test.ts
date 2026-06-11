import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import {
  formatSidebarSessionMeta,
  resolveSidebarSessionTitle,
} from "./sidebarSessionFormatting";

const NOW_MS = Date.UTC(2026, 4, 10, 12, 0, 0);

function buildSession(
  overrides: Partial<AsterSessionInfo> = {},
): AsterSessionInfo {
  return {
    id: "session-1",
    name: "最近会话",
    created_at: Math.floor(NOW_MS / 1000),
    updated_at: Math.floor((NOW_MS - 2 * 60 * 1000) / 1000),
    archived_at: null,
    workspace_id: "project-1",
    ...overrides,
  };
}

describe("sidebarSessionFormatting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("按 UI locale 格式化会话更新时间", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS);

    expect(formatSidebarSessionMeta(buildSession(), { locale: "zh-CN" })).toBe(
      "2分钟前",
    );
    expect(formatSidebarSessionMeta(buildSession(), { locale: "en-US" })).toBe(
      "2m ago",
    );
  });

  it("兼容 App Server current 返回的毫秒级会话时间戳", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS);

    expect(
      formatSidebarSessionMeta(
        buildSession({
          created_at: NOW_MS - 2 * 60 * 1000,
          updated_at: NOW_MS - 2 * 60 * 1000,
        }),
        { locale: "zh-CN" },
      ),
    ).toBe("2分钟前");
  });

  it("空标题使用调用方传入的本地化兜底", () => {
    expect(
      resolveSidebarSessionTitle(
        buildSession({ name: "   " }),
        "Untitled conversation",
      ),
    ).toBe("Untitled conversation");
  });

  it("运行时错误包络不应作为侧栏会话标题展示", () => {
    const runtimeErrorEnvelope = [
      "Ran into this error: Server error: upstream temporarily unavailable.",
      "",
      "Please retry if you think this is a transient or recoverable error.",
    ].join("\n");

    expect(
      resolveSidebarSessionTitle(
        buildSession({ name: runtimeErrorEnvelope }),
        "Untitled conversation",
      ),
    ).toBe("Untitled conversation");
    expect(
      resolveSidebarSessionTitle(
        buildSession({ name: "Ran into this erro..." }),
        "Untitled conversation",
      ),
    ).toBe("Untitled conversation");
  });
});
