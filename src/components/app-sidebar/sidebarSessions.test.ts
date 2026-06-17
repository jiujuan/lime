import { describe, expect, it } from "vitest";
import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import { sortSidebarSessions } from "./sidebarSessions";

function session(
  id: string,
  overrides: Partial<AsterSessionInfo> = {},
): AsterSessionInfo {
  return {
    id,
    name: id,
    created_at: 1,
    updated_at: 1,
    archived_at: null,
    ...overrides,
  };
}

describe("sidebarSessions", () => {
  it("按更新时间倒序排列，并容忍旧 read model 缺少 id 或时间字段", () => {
    const staleShape = {
      name: "旧形状会话",
      archived_at: null,
    } as unknown as AsterSessionInfo;

    expect(() =>
      sortSidebarSessions([
        session("older", { updated_at: 10, created_at: 10 }),
        staleShape,
        session("newer", { updated_at: 20, created_at: 20 }),
      ]),
    ).not.toThrow();

    expect(
      sortSidebarSessions([
        session("older", { updated_at: 10, created_at: 10 }),
        staleShape,
        session("newer", { updated_at: 20, created_at: 20 }),
      ]).map((item) => item.id || item.name),
    ).toEqual(["newer", "older", "旧形状会话"]);
  });
});
