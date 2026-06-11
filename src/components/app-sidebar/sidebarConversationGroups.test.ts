import { describe, expect, it } from "vitest";
import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import {
  buildSidebarConversationGroups,
  flattenSidebarConversationGroups,
  type SidebarOpenedProjectSummary,
} from "./sidebarConversationGroups";

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

const openedProjects: SidebarOpenedProjectSummary[] = [
  {
    id: "project-a",
    name: "content-factory-app",
    rootPath: "/repo/content-factory-app",
  },
  {
    id: "project-b",
    name: "lime",
    rootPath: "/repo/lime",
  },
];

describe("sidebarConversationGroups", () => {
  it("只为已打开项目建立项目分组，并把项目会话挂到对应项目下", () => {
    const groups = buildSidebarConversationGroups({
      openedProjects,
      sessions: [
        session("a-1", { workspace_id: "project-a" }),
        session("b-1", { workspace_id: "project-b" }),
        session("hidden-1", { workspace_id: "project-hidden" }),
        session("standalone-1"),
      ],
    });

    expect(groups.projectSections).toHaveLength(2);
    expect(groups.projectSections[0]).toMatchObject({
      project: { id: "project-a", name: "content-factory-app" },
      sessions: [{ id: "a-1" }],
    });
    expect(groups.projectSections[1]).toMatchObject({
      project: { id: "project-b", name: "lime" },
      sessions: [{ id: "b-1" }],
    });
    expect(groups.standaloneSessions.map((item) => item.id)).toEqual([
      "standalone-1",
    ]);
    expect(flattenSidebarConversationGroups(groups).map((item) => item.id)).toEqual(
      ["a-1", "b-1", "standalone-1"],
    );
  });

  it("用 working_dir 兜底归属 Codex 风格的项目历史", () => {
    const groups = buildSidebarConversationGroups({
      openedProjects,
      sessions: [
        session("cwd-project", { working_dir: "/repo/lime/" }),
        session("cwd-standalone", { working_dir: "/repo/other" }),
      ],
    });

    expect(groups.projectSections[1].sessions.map((item) => item.id)).toEqual([
      "cwd-project",
    ]);
    expect(groups.standaloneSessions.map((item) => item.id)).toEqual([
      "cwd-standalone",
    ]);
  });

  it("左侧导航只构建未归档会话分组", () => {
    const groups = buildSidebarConversationGroups({
      openedProjects,
      sessions: [
        session("active", { workspace_id: "project-a" }),
        session("archived", {
          workspace_id: "project-a",
          archived_at: 1,
        }),
      ],
    });

    expect(groups.projectSections[0].sessions.map((item) => item.id)).toEqual([
      "active",
    ]);
    expect(groups.standaloneSessions).toEqual([]);
  });
});
