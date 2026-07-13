import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { resolveExecutableSkillId, skillExecutionApi } from "./skill-execution";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function typedSkillMetadata(overrides: Record<string, unknown> = {}) {
  return {
    skillId: "project:writer",
    name: "writer",
    description: "生成文案",
    scope: "project",
    source: "project",
    authority: "workspace",
    enabled: true,
    interface: {
      displayName: "写作助手",
      executionMode: "prompt",
    },
    dependencies: {
      tools: [{ type: "runtime_tool", value: "Read", required: true }],
    },
    policy: {
      allowImplicitInvocation: true,
      whenToUse: "需要生成文案时",
    },
    capabilities: ["Read"],
    locator: {
      directory: "/tmp/skills/writer",
      skillFilePath: "/tmp/skills/writer/SKILL.md",
    },
    ...overrides,
  };
}

describe("skillExecutionApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("可执行 Skill 列表应通过 App Server skill/list 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skills: [typedSkillMetadata()],
      },
    });

    await expect(skillExecutionApi.listExecutableSkills()).resolves.toEqual([
      expect.objectContaining({
        name: "writer",
        skill_id: "project:writer",
        display_name: "写作助手",
        authority: "workspace",
        dependencies: [{ type: "runtime_tool", value: "Read", required: true }],
      }),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledWith("skill/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Skill 详情应通过 App Server skill/read 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skill: {
          metadata: typedSkillMetadata(),
          markdownContent: "# Writer",
          workflowSteps: [],
        },
      },
    });

    await expect(
      skillExecutionApi.getSkillDetail("project:writer"),
    ).resolves.toEqual(
      expect.objectContaining({
        name: "writer",
        markdown_content: "# Writer",
        allowed_tools: ["Read"],
      }),
    );

    expect(appServerRequestMock).toHaveBeenCalledWith("skill/read", {
      skillId: "project:writer",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("App Server Skill 读链缺少必需 result 时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({ result: {} });

    await expect(skillExecutionApi.listExecutableSkills()).rejects.toThrow(
      "App Server skill/list did not return skills",
    );

    appServerRequestMock.mockReset();
    appServerRequestMock.mockResolvedValueOnce({ result: {} });

    await expect(
      skillExecutionApi.getSkillDetail("project:writer"),
    ).rejects.toThrow("App Server skill/read did not return skill");

    expect(safeInvoke).not.toHaveBeenCalledWith("list_executable_skills");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_skill_detail", {
      skillId: "project:writer",
    });
  });

  it("Skill 引用应优先匹配 stable id，并只允许唯一 name 解析", () => {
    const skills = [
      { skill_id: "project:writer", name: "writer" },
      { skill_id: "user:writer", name: "writer" },
      { skill_id: "app:reviewer", name: "reviewer" },
    ];

    expect(resolveExecutableSkillId(skills, "user:writer")).toBe("user:writer");
    expect(resolveExecutableSkillId(skills, "reviewer")).toBe("app:reviewer");
    expect(resolveExecutableSkillId(skills, "writer")).toBeNull();
    expect(resolveExecutableSkillId(skills, "missing")).toBeNull();
  });

  it("Skill 详情响应 identity 与请求不一致时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skill: {
          metadata: typedSkillMetadata({ skillId: "user:writer" }),
          markdownContent: "# Writer",
          workflowSteps: [],
        },
      },
    });

    await expect(
      skillExecutionApi.getSkillDetail("project:writer"),
    ).rejects.toThrow(
      "App Server skill/read returned unexpected skillId: user:writer",
    );
  });

  it("App Server Skill typed metadata 缺少稳定 identity 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skills: [typedSkillMetadata({ skillId: "" })],
      },
    });

    await expect(skillExecutionApi.listExecutableSkills()).rejects.toThrow(
      "skill/list skills[0].skillId is not a non-empty string",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Skill 独立执行 API 不再暴露 executeSkill", () => {
    expect("executeSkill" in skillExecutionApi).toBe(false);
    expect(safeInvoke).not.toHaveBeenCalled();
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
