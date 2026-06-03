import { describe, expect, it } from "vitest";
import type { AutomationJobRequest } from "@/lib/api/automation";
import type { Project } from "@/lib/api/project";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import {
  buildFallbackAutomationWorkspace,
  buildServiceSkillAutomationSetupState,
  buildServiceSkillAutomationSubmitRequest,
  buildServiceSkillSelectionPlan,
  getWorkspaceServiceSkillErrorMessage,
  normalizeWorkspaceServiceSkillOptionalText,
  prioritizeAutomationWorkspaces,
  resolveServiceSkillLaunchUserInput,
  shouldCreateServiceSkillAutomationContent,
  siteSkillRequiresProject,
} from "./workspaceServiceSkillEntryActionsViewModel";

function createProject(id: string, workspaceType: Project["workspaceType"]) {
  return {
    id,
    name: `项目 ${id}`,
    workspaceType,
    rootPath: "",
    isDefault: false,
    createdAt: 1,
    updatedAt: 1,
    isFavorite: false,
    isArchived: false,
    tags: [],
  } satisfies Project;
}

function createServiceSkill(
  overrides: Partial<ServiceSkillHomeItem> = {},
): ServiceSkillHomeItem {
  return {
    id: "github-repo-radar",
    title: "GitHub 仓库线索检索",
    summary: "检索主题仓库并沉淀成结构化线索。",
    category: "情报研究",
    outputHint: "仓库列表 + 关键线索",
    source: "cloud_catalog",
    runnerType: "instant",
    defaultExecutorBinding: "browser_assist",
    executionLocation: "client_default",
    defaultArtifactKind: "analysis",
    themeTarget: "general",
    version: "seed-v1",
    slotSchema: [],
    siteCapabilityBinding: {
      adapterName: "github/search",
      saveMode: "project_resource",
    },
    badge: "云目录",
    recentUsedAt: null,
    isRecent: false,
    runnerLabel: "浏览器站点执行",
    runnerTone: "emerald",
    runnerDescription: "复用真实登录态执行站点脚本。",
    actionLabel: "启动采集",
    automationStatus: null,
    ...overrides,
  } as ServiceSkillHomeItem;
}

function createAutomationJobRequest(): AutomationJobRequest {
  return {
    name: "每日趋势摘要｜定时执行",
    description: "围绕指定平台与关键词输出趋势摘要。",
    workspace_id: "project-1",
    execution_mode: "skill",
    schedule: {
      kind: "cron",
      expr: "00 09 * * *",
      tz: "Asia/Shanghai",
    },
    payload: {
      kind: "agent_turn",
      prompt: "自动化 prompt",
      system_prompt: "",
      web_search: false,
    },
    delivery: {
      mode: "none",
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    },
  };
}

describe("workspaceServiceSkillEntryActionsViewModel", () => {
  it("应把未知异常归一为可展示错误文案", () => {
    expect(getWorkspaceServiceSkillErrorMessage(new Error("连接失败"))).toBe(
      "连接失败",
    );
    expect(getWorkspaceServiceSkillErrorMessage("权限不足")).toBe("权限不足");
    expect(getWorkspaceServiceSkillErrorMessage({ code: "UNKNOWN" })).toBe(
      "请稍后重试",
    );
  });

  it("应归一化入口输入，并让显式 launchUserInput 覆盖当前输入", () => {
    expect(normalizeWorkspaceServiceSkillOptionalText("  继续分析  ")).toBe(
      "继续分析",
    );
    expect(normalizeWorkspaceServiceSkillOptionalText("   ")).toBeUndefined();
    expect(resolveServiceSkillLaunchUserInput(" 当前输入 ")).toBe("当前输入");
    expect(
      resolveServiceSkillLaunchUserInput(" 当前输入 ", {
        launchUserInput: " 显式输入 ",
      }),
    ).toBe("显式输入");
    expect(
      resolveServiceSkillLaunchUserInput(" 当前输入 ", {
        launchUserInput: null,
      }),
    ).toBeUndefined();
  });

  it("应只在站点技能确实需要项目保存时要求项目", () => {
    expect(siteSkillRequiresProject(createServiceSkill())).toBe(true);
    expect(
      siteSkillRequiresProject(
        createServiceSkill({
          siteCapabilityBinding: {
            adapterName: "github/search",
            saveMode: "current_content",
          },
        }),
      ),
    ).toBe(false);
    expect(
      siteSkillRequiresProject(
        createServiceSkill({
          readinessRequirements: {
            requiresProject: true,
          },
          siteCapabilityBinding: {
            adapterName: "github/search",
            saveMode: "current_content",
          },
        }),
      ),
    ).toBe(true);
    expect(
      siteSkillRequiresProject(
        createServiceSkill({
          defaultExecutorBinding: "agent_turn",
          siteCapabilityBinding: undefined,
        }),
      ),
    ).toBe(false);
  });

  it("技能参数齐全时应生成直接启动计划", () => {
    const skill = createServiceSkill({
      slotSchema: [
        {
          key: "repository_query",
          label: "检索主题",
          type: "text",
          required: true,
          placeholder: "例如 browser assist mcp",
        },
      ],
    });

    const plan = buildServiceSkillSelectionPlan({
      skill,
      options: {
        initialSlotValues: {
          repository_query: "browser assist mcp",
        },
        launchUserInput: " 优先看最近 30 天 ",
      },
      nextRequestCount: 3,
    });

    expect(plan).toEqual({
      kind: "launch",
      slotValues: {
        repository_query: "browser assist mcp",
      },
      launchUserInput: "优先看最近 30 天",
    });
  });

  it("技能缺少必填参数时应生成挂起 A2UI 补参计划", () => {
    const skill = createServiceSkill({
      slotSchema: [
        {
          key: "repository_query",
          label: "检索主题",
          type: "text",
          required: true,
          placeholder: "例如 browser assist mcp",
        },
      ],
    });

    const plan = buildServiceSkillSelectionPlan({
      skill,
      options: {
        requestKey: 20260409,
        initialSlotValues: {
          repository_query: "",
        },
        prefillHint: "已根据 Skills 页入口推荐自动预填。",
      },
      nextRequestCount: 3,
    });

    expect(plan).toMatchObject({
      kind: "pending",
      pendingInput: {
        requestKey: "github-repo-radar:20260409",
        skill,
        initialSlotValues: {
          repository_query: "",
        },
        prefillHint: "已根据 Skills 页入口推荐自动预填。",
      },
    });
  });

  it("挂起补参计划缺少显式 requestKey 时应使用下一次请求计数", () => {
    const skill = createServiceSkill({
      slotSchema: [
        {
          key: "repository_query",
          label: "检索主题",
          type: "text",
          required: true,
          placeholder: "例如 browser assist mcp",
        },
      ],
    });

    const plan = buildServiceSkillSelectionPlan({
      skill,
      nextRequestCount: 8,
    });

    expect(plan).toMatchObject({
      kind: "pending",
      pendingInput: {
        requestKey: "github-repo-radar:8",
      },
    });
  });

  it("应构造本地自动化 setup 的初始值和 pending usage", () => {
    const skill = createServiceSkill({
      id: "daily-trend-briefing",
      title: "每日趋势摘要",
      summary: "围绕指定平台与关键词输出趋势摘要。",
      runnerType: "scheduled",
      defaultExecutorBinding: "automation_job",
      slotSchema: [
        {
          key: "platform",
          label: "监测平台",
          type: "platform",
          required: true,
          placeholder: "选择平台",
          defaultValue: "x",
          options: [{ value: "x", label: "X / Twitter" }],
        },
        {
          key: "industry_keywords",
          label: "行业关键词",
          type: "textarea",
          required: true,
          placeholder: "输入关键词",
        },
        {
          key: "schedule_time",
          label: "推送时间",
          type: "schedule_time",
          required: false,
          placeholder: "例如 每天 09:00",
          defaultValue: "每天 09:00",
        },
      ],
      siteCapabilityBinding: undefined,
    });
    const slotValues = {
      platform: "x",
      industry_keywords: "AI Agent，创作者工具",
      schedule_time: "每天 09:00",
    };

    const state = buildServiceSkillAutomationSetupState({
      skill,
      slotValues,
      input: "  请重点看最近 30 天  ",
      workspaceId: "project-1",
    });

    expect(state.pendingAutomation).toMatchObject({
      skill,
      slotValues,
      userInput: "请重点看最近 30 天",
      usage: {
        skillId: "daily-trend-briefing",
        runnerType: "scheduled",
        slotValues,
      },
    });
    expect(state.pendingAutomation.prompt).toContain("请重点看最近 30 天");
    expect(state.dialogInitialValues).toMatchObject({
      name: "每日趋势摘要｜定时执行",
      workspace_id: "project-1",
      execution_mode: "skill",
      payload_kind: "agent_turn",
      schedule_kind: "cron",
      cron_expr: "00 09 * * *",
    });
  });

  it("应规划自动化提交时的主稿创建和 agent_turn payload metadata", () => {
    const skill = createServiceSkill({
      id: "daily-trend-briefing",
      title: "每日趋势摘要",
      summary: "围绕指定平台与关键词输出趋势摘要。",
      runnerType: "scheduled",
      defaultExecutorBinding: "automation_job",
      slotSchema: [
        {
          key: "industry_keywords",
          label: "行业关键词",
          type: "textarea",
          required: true,
          placeholder: "输入关键词",
        },
      ],
      siteCapabilityBinding: undefined,
    });
    const slotValues = {
      industry_keywords: "AI Agent，创作者工具",
    };
    const setupState = buildServiceSkillAutomationSetupState({
      skill,
      slotValues,
      input: "请重点看最近 30 天",
      workspaceId: "project-1",
    });
    const request = createAutomationJobRequest();

    expect(
      shouldCreateServiceSkillAutomationContent({
        pendingAutomation: setupState.pendingAutomation,
        request,
        contentId: null,
      }),
    ).toBe(true);
    expect(
      shouldCreateServiceSkillAutomationContent({
        pendingAutomation: setupState.pendingAutomation,
        request,
        contentId: "content-current",
      }),
    ).toBe(false);

    const plan = buildServiceSkillAutomationSubmitRequest({
      pendingAutomation: setupState.pendingAutomation,
      request,
      contentId: "content-current",
    });

    expect(plan.automationContentId).toBe("content-current");
    expect(plan.request.payload).toMatchObject({
      kind: "agent_turn",
      content_id: "content-current",
      request_metadata: {
        service_skill: expect.objectContaining({
          id: "daily-trend-briefing",
          title: "每日趋势摘要",
          runner_type: "scheduled",
        }),
      },
    });
  });

  it("应把当前项目排到自动化工作区列表首位，缺失时构造 fallback", () => {
    const generalProject = createProject("project-general", "general");
    const temporaryProject = createProject("project-temporary", "temporary");
    const workspaces = [generalProject, temporaryProject];

    expect(prioritizeAutomationWorkspaces(workspaces, null)).toBe(workspaces);
    expect(
      prioritizeAutomationWorkspaces(workspaces, "project-temporary").map(
        (workspace) => workspace.id,
      ),
    ).toEqual(["project-temporary", "project-general"]);

    const prioritized = prioritizeAutomationWorkspaces(
      workspaces,
      "project-new",
      "video",
    );

    expect(prioritized.map((workspace) => workspace.id)).toEqual([
      "project-new",
      "project-general",
      "project-temporary",
    ]);
    expect(prioritized[0]).toEqual(
      buildFallbackAutomationWorkspace("project-new", "video"),
    );
  });
});
