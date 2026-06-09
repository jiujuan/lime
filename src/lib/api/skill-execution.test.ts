import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { skillExecutionApi } from "./skill-execution";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("skillExecutionApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("可执行 Skill 列表应通过 App Server skill/list 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skills: [
          {
            name: "writer",
            display_name: "写作助手",
            description: "生成文案",
            execution_mode: "prompt",
            has_workflow: false,
          },
        ],
      },
    });

    await expect(skillExecutionApi.listExecutableSkills()).resolves.toEqual([
      expect.objectContaining({
        name: "writer",
        display_name: "写作助手",
      }),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledWith("skill/list", {});
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Skill 详情应通过 App Server skill/read 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skill: {
          name: "writer",
          display_name: "写作助手",
          description: "生成文案",
          execution_mode: "prompt",
          has_workflow: false,
          markdown_content: "# Writer",
          allowed_tools: [],
        },
      },
    });

    await expect(skillExecutionApi.getSkillDetail("writer")).resolves.toEqual(
      expect.objectContaining({
        name: "writer",
        markdown_content: "# Writer",
      }),
    );

    expect(appServerRequestMock).toHaveBeenCalledWith("skill/read", {
      skillName: "writer",
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

    await expect(skillExecutionApi.getSkillDetail("writer")).rejects.toThrow(
      "App Server skill/read did not return skill",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith("list_executable_skills");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_skill_detail", {
      skillName: "writer",
    });
  });

  it("Skill 独立执行 API 不再暴露 executeSkill", () => {
    expect("executeSkill" in skillExecutionApi).toBe(false);
    expect(safeInvoke).not.toHaveBeenCalled();
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
