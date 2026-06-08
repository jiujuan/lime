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

  it("Skill 执行 side-effect 仍保持 Desktop compat 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      success: true,
      output: "done",
      steps_completed: [],
    });

    await expect(
      skillExecutionApi.executeSkill({
        skillName: "writer",
        userInput: "写一段介绍",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
      }),
    );

    expect(safeInvoke).toHaveBeenCalledWith("execute_skill", {
      skillName: "writer",
      userInput: "写一段介绍",
    });
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("Skill 执行收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "execute_skill",
        source: "electron-host",
        status: "not-supported",
      },
      success: true,
      output: "diagnostic fallback",
      steps_completed: [],
    });

    await expect(
      skillExecutionApi.executeSkill({
        skillName: "writer",
        userInput: "写一段介绍",
      }),
    ).rejects.toThrow("execute_skill 尚未接入真实 Skill execution current 通道");

    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("Skill 执行收到错误 envelope 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      error: { code: -32603, message: "not implemented" },
    });

    await expect(
      skillExecutionApi.executeSkill({
        skillName: "writer",
        userInput: "写一段介绍",
      }),
    ).rejects.toThrow("execute_skill did not return a skill execution result");

    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("Skill 执行缺少 steps_completed 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      success: true,
      output: "done",
    });

    await expect(
      skillExecutionApi.executeSkill({
        skillName: "writer",
        userInput: "写一段介绍",
      }),
    ).rejects.toThrow("execute_skill did not return a skill execution result");

    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("Skill 执行返回无效步骤条目时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      success: true,
      steps_completed: [{ step_id: "step-1", step_name: "生成" }],
    });

    await expect(
      skillExecutionApi.executeSkill({
        skillName: "writer",
        userInput: "写一段介绍",
      }),
    ).rejects.toThrow(
      "execute_skill did not return valid skill execution steps",
    );

    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
