import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  cleanupMountedAutomationSettings,
  clickElement,
  createAgentTurnJob,
  createAutomationRun,
  createBrowserJob,
  createLastDelivery,
  getBodyText,
  hoverTip,
  leaveTip,
  openJobDetails,
  renderSettings,
  setupDefaultAutomationMocks,
  setupManagedObjectiveAutomationMocks,
  setupSceneAppAutomationMocks,
} from "./automationSettingsTestFixtures";

const {
  mockGetAutomationSchedulerConfig,
  mockGetAutomationStatus,
  mockGetAutomationJobs,
  mockGetAutomationHealth,
  mockGetAutomationRunHistory,
  mockListProjects,
  mockAuditAgentRuntimeObjective,
  mockOpenPathWithDefaultApp,
  mockRevealPathInFinder,
  mockAutomationJobDialog,
} = vi.hoisted(() => ({
  mockGetAutomationSchedulerConfig: vi.fn(),
  mockGetAutomationStatus: vi.fn(),
  mockGetAutomationJobs: vi.fn(),
  mockGetAutomationHealth: vi.fn(),
  mockGetAutomationRunHistory: vi.fn(),
  mockListProjects: vi.fn(),
  mockAuditAgentRuntimeObjective: vi.fn(),
  mockOpenPathWithDefaultApp: vi.fn(),
  mockRevealPathInFinder: vi.fn(),
  mockAutomationJobDialog: vi.fn(),
}));

vi.mock("@/lib/api/automation", () => ({
  getAutomationSchedulerConfig: mockGetAutomationSchedulerConfig,
  getAutomationStatus: mockGetAutomationStatus,
  getAutomationJobs: mockGetAutomationJobs,
  getAutomationHealth: mockGetAutomationHealth,
  getAutomationRunHistory: mockGetAutomationRunHistory,
  createAutomationJob: vi.fn(),
  updateAutomationJob: vi.fn(),
  deleteAutomationJob: vi.fn(),
  runAutomationJobNow: vi.fn(),
  updateAutomationSchedulerConfig: vi.fn(),
}));

vi.mock("@/lib/api/project", () => ({
  listProjects: mockListProjects,
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  auditAgentRuntimeObjective: mockAuditAgentRuntimeObjective,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  openPathWithDefaultApp: mockOpenPathWithDefaultApp,
  revealPathInFinder: mockRevealPathInFinder,
}));

vi.mock("./AutomationHealthPanel", () => ({
  AutomationHealthPanel: () => <div data-testid="automation-health-panel" />,
}));

vi.mock("./AutomationJobDialog", () => ({
  AutomationJobDialog: (props: {
    open: boolean;
    mode: "create" | "edit";
    initialValues?: Record<string, unknown> | null;
    threadLineage?: { sessionId?: string | null; threadId?: string | null };
  }) => {
    mockAutomationJobDialog(props);
    const payloadKind =
      props.initialValues &&
      typeof props.initialValues.payload_kind === "string"
        ? props.initialValues.payload_kind
        : "-";
    const scheduleKind =
      props.initialValues &&
      typeof props.initialValues.schedule_kind === "string"
        ? props.initialValues.schedule_kind
        : "-";
    return props.open ? (
      <div data-testid="automation-job-dialog">
        {props.mode}:{payloadKind}:{scheduleKind}
      </div>
    ) : null;
  },
}));

vi.mock("@/components/execution/LatestRunStatusBadge", () => ({
  LatestRunStatusBadge: () => <div data-testid="latest-run-status-badge" />,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const automationMocks = {
  mockGetAutomationSchedulerConfig,
  mockGetAutomationStatus,
  mockGetAutomationJobs,
  mockGetAutomationHealth,
  mockGetAutomationRunHistory,
  mockListProjects,
  mockAuditAgentRuntimeObjective,
  mockOpenPathWithDefaultApp,
  mockRevealPathInFinder,
};

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("zh-CN");
  setupDefaultAutomationMocks(automationMocks);
});

afterEach(async () => {
  await cleanupMountedAutomationSettings();
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("AutomationSettings", () => {
  it("应把工作台说明和任务入口说明收进 tips", async () => {
    const container = await renderSettings();

    expect(getBodyText()).not.toContain(
      "把值得持续跟进的做法接成长期跟进，统一查看持续流程、运行和调度设置。",
    );
    expect(getBodyText()).not.toContain(
      "默认页只保留从 Agent 对话接回来的持续流程动作。模板会先帮你写好节奏、起手信息和输出去向，浏览器自动化不再保留单独起手入口。",
    );
    expect(container.textContent).toContain(
      "统一查看持续流程、运行状态和调度设置。",
    );
    expect(container.textContent).toContain("系统入口");
    expect(container.textContent).not.toContain("Automation Workspace");

    const heroTip = await hoverTip("持续流程说明");
    expect(getBodyText()).toContain(
      "把值得持续跟进的做法接成长期跟进，统一查看持续流程、运行和调度设置。",
    );
    await leaveTip(heroTip);

    const taskTip = await hoverTip("开始这条说明");
    expect(getBodyText()).toContain(
      "默认页只保留从 Agent 对话接回来的持续流程动作。模板会先帮你写好节奏、起手信息和输出去向，浏览器自动化不再保留单独起手入口。",
    );
    await leaveTip(taskTip);
  });

  it("遗留浏览器任务应展示下线提示并移除接管面板", async () => {
    const container = await renderSettings();
    await openJobDetails(container, "job-browser-1");
    const documentText = document.body.textContent ?? "";

    expect(documentText).toContain("持续流程详情");
    expect(documentText).toContain("浏览器自动化已下线");
    expect(documentText).toContain("系统不会再自动启动 Chrome");
    expect(documentText).toContain("等待人工处理");
    expect(documentText).toContain("已下线");
    expect(documentText).toContain("等待你确认是否继续执行");
    expect(documentText).toContain("输出契约");
    expect(documentText).toContain("最近一次投递结果");
    expect(documentText).toContain("投递失败");
    expect(documentText).toContain("写入本地文件失败: permission denied");
    expect(documentText).toContain("投递失败记为本轮失败");
    expect(documentText).toContain("投递键: dlv-run-browser-1");
    expect(documentText).toContain("执行重试: 0 / 投递尝试: 2");
    expect(documentText).not.toContain("浏览器实时接管");
  }, 10_000);

  it("应展示 Google Sheets 作为输出目标标签", async () => {
    const sheetsTarget =
      "spreadsheet_id=sheet-1;sheet=巡检结果;credentials_file=C:/lime/service-account.json";

    mockGetAutomationJobs.mockResolvedValueOnce([
      createBrowserJob({
        id: "job-browser-2",
        name: "Google Sheets 巡检输出",
        description: "把结构化结果追加到表格",
        delivery: {
          mode: "announce",
          channel: "google_sheets",
          target: sheetsTarget,
          best_effort: true,
          output_schema: "table",
          output_format: "json",
        },
        last_status: "success",
        last_finished_at: "2026-03-16T00:00:08Z",
        running_started_at: null,
        last_delivery: createLastDelivery({
          success: true,
          message: "Google Sheets 已追加 2 行",
          channel: "google_sheets",
          target: sheetsTarget,
          output_kind: "table",
          output_schema: "table",
          output_format: "json",
          output_preview: '{"rows":[["https://example.com","ok"]]}',
          delivery_attempt_id: "dlv-run-browser-2",
          run_id: "run-browser-2",
          execution_retry_count: 1,
          delivery_attempts: 1,
        }),
      }),
    ]);

    const container = await renderSettings();
    await openJobDetails(container, "job-browser-2");
    const documentText = document.body.textContent ?? "";

    expect(documentText).toContain("Google Sheets");
    expect(documentText).toContain("Google Sheets 已追加 2 行");
  }, 10_000);

  it("settings 模式应只保留调度器设置入口", async () => {
    const container = await renderSettings({
      mode: "settings",
      onOpenWorkspace: vi.fn(),
    });

    expect(container.textContent).toContain("持续流程设置");
    expect(container.textContent).toContain("打开持续流程");
    expect(container.textContent).not.toContain("持续流程详情");
    expect(container.textContent).not.toContain("新建持续流程");
    expect(container.textContent).toContain("启用调度器");
    expect(container.querySelector("table")).toBeNull();
    expect(
      container.querySelector("[data-testid='automation-health-panel']"),
    ).toBeNull();
    expect(mockGetAutomationRunHistory).not.toHaveBeenCalled();
  });

  it("workspace 模式应显示自动化工作台并隐藏调度器编辑", async () => {
    const container = await renderSettings({
      mode: "workspace",
      onOpenSettings: vi.fn(),
    });

    expect(
      container.querySelector(".lime-workbench-theme-scope"),
    ).not.toBeNull();
    expect(container.textContent).toContain("持续流程");
    expect(container.textContent).toContain("开始这条");
    expect(container.textContent).toContain("已在运行的持续流程");
    expect(container.textContent).not.toContain("持续流程详情");
    expect(container.textContent).toContain("持续流程设置");
    expect(container.textContent).toContain("新建持续流程");
    expect(container.textContent).toContain("持续流程");
    expect(container.textContent).toContain("概览");
    expect(container.textContent).not.toContain("保存调度器");
    expect(container.textContent).not.toContain("启用调度器");
    expect(
      container.querySelector(
        "[data-testid='automation-job-open-details-job-browser-1']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='automation-health-panel']"),
    ).toBeNull();
    expect(mockGetAutomationRunHistory).not.toHaveBeenCalled();
  });

  it("workspace 模式点击详情按钮后应打开任务详情弹窗", async () => {
    const container = await renderSettings({
      mode: "workspace",
    });

    await openJobDetails(container, "job-browser-1");

    expect(
      document.body.querySelector(".lime-workbench-theme-scope"),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        "[data-testid='automation-job-details-dialog']",
      ),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("持续流程详情");
    expect(document.body.textContent).toContain("浏览器巡检");
    expect(mockGetAutomationRunHistory).toHaveBeenLastCalledWith(
      "job-browser-1",
      15,
    );
  });

  it("workspace 模式加载运行历史失败时应显示本地化 toast", async () => {
    mockGetAutomationRunHistory.mockRejectedValueOnce(
      new Error("network down"),
    );
    const container = await renderSettings({
      mode: "workspace",
    });

    await openJobDetails(container, "job-browser-1");

    expect(toast.error).toHaveBeenCalledWith("加载运行历史失败: network down");
  });

  it("绑定目标详情应从最新运行会话触发 automation owner 审计", async () => {
    setupManagedObjectiveAutomationMocks(automationMocks);
    const container = await renderSettings({
      mode: "workspace",
    });

    await openJobDetails(container, "job-managed-objective-1");

    const auditButton = document.body.querySelector<HTMLButtonElement>(
      "[data-testid='automation-managed-objective-audit-job-managed-objective-1']",
    );
    expect(auditButton).not.toBeNull();

    await clickElement(auditButton, 2);

    expect(mockAuditAgentRuntimeObjective).toHaveBeenCalledWith({
      sessionId: "session-managed-objective-1",
      ownerKind: "automation_job",
      ownerId: "job-managed-objective-1",
    });
    expect(toast.success).toHaveBeenCalledWith("目标审计已更新");
  });

  it("绑定目标详情应打开工作区内的证据引用", async () => {
    setupManagedObjectiveAutomationMocks(automationMocks);
    const container = await renderSettings({
      mode: "workspace",
    });

    await openJobDetails(container, "job-managed-objective-1");

    const openEvidenceButton = document.body.querySelector<HTMLButtonElement>(
      "[data-testid='automation-managed-objective-open-evidence-job-managed-objective-1-0']",
    );
    expect(openEvidenceButton).not.toBeNull();

    await clickElement(openEvidenceButton);

    expect(mockOpenPathWithDefaultApp).toHaveBeenCalledWith(
      "/workspace/default/.lime/harness/job-managed-objective-1/evidence",
    );
  });

  it("workspace 模式切换到概览 tab 后才显示统计与健康面板", async () => {
    const container = await renderSettings({
      mode: "workspace",
    });

    const overviewTab = container.querySelector(
      "[data-testid='automation-tab-overview']",
    ) as HTMLButtonElement | null;

    expect(overviewTab).not.toBeNull();
    expect(
      container.querySelector("[data-testid='automation-health-panel']"),
    ).toBeNull();

    await clickElement(overviewTab);

    expect(container.textContent).toContain("运行概览");
    expect(
      container.querySelector("[data-testid='automation-health-panel']"),
    ).not.toBeNull();
  });

  it("workspace 模式缺少 Thread lineage 时点击模板应 fail closed", async () => {
    const container = await renderSettings({
      mode: "workspace",
    });

    const templateButton = container.querySelector(
      "[data-testid='automation-template-daily-brief']",
    ) as HTMLButtonElement | null;

    expect(templateButton).not.toBeNull();

    await clickElement(templateButton);

    expect(toast.error).toHaveBeenCalledWith(
      "请先从当前项目对话中创建持续流程",
    );
    expect(
      container.querySelector("[data-testid='automation-job-dialog']"),
    ).toBeNull();
  });

  it("workspace 模式带 Thread lineage 时点击模板应打开 Agent 任务预填弹窗", async () => {
    const container = await renderSettings({
      mode: "workspace",
      threadLineage: {
        sessionId: "session-automation-1",
        threadId: "thread-automation-1",
      },
    });

    const templateButton = container.querySelector(
      "[data-testid='automation-template-daily-brief']",
    ) as HTMLButtonElement | null;

    expect(templateButton).not.toBeNull();

    await clickElement(templateButton);

    expect(
      container.querySelector("[data-testid='automation-job-dialog']")
        ?.textContent,
    ).toBe("create:agent_turn:cron");
    expect(mockAutomationJobDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadLineage: {
          sessionId: "session-automation-1",
          threadId: "thread-automation-1",
        },
      }),
    );
  });

  it("workspace 模式应支持从页面参数直接落到概览 tab", async () => {
    const container = await renderSettings({
      mode: "workspace",
      initialWorkspaceTab: "overview",
    });

    expect(container.textContent).toContain("运行概览");
    expect(
      container.querySelector("[data-testid='automation-health-panel']"),
    ).not.toBeNull();
  });

  it("workspace 模式应支持按页面参数预选任务", async () => {
    mockGetAutomationJobs.mockResolvedValueOnce([
      createBrowserJob({ last_delivery: null }),
      createAgentTurnJob({
        id: "job-agent-2",
      }),
    ]);

    await renderSettings({
      mode: "workspace",
      initialSelectedJobId: "job-agent-2",
    });

    expect(mockGetAutomationRunHistory).toHaveBeenLastCalledWith(
      "job-agent-2",
      15,
    );
  });

  it("工作区列表挂起时不应阻塞持续流程页面首屏", async () => {
    mockListProjects.mockImplementationOnce(() => new Promise(() => {}));

    const container = await renderSettings({
      mode: "workspace",
    });

    expect(container.textContent).toContain("持续流程");
    expect(container.textContent).toContain("开始这条");
    expect(container.textContent).toContain("已在运行的持续流程");
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("核心调度器配置加载失败时应显示错误态而不是一直 loading", async () => {
    mockGetAutomationSchedulerConfig.mockRejectedValueOnce(
      new Error("scheduler offline"),
    );

    const container = await renderSettings({
      mode: "workspace",
    });

    expect(container.textContent).toContain("持续流程页面加载失败");
    expect(container.textContent).toContain("scheduler offline");
    expect(container.textContent).toContain("重新加载");
    expect(container.querySelector("table")).toBeNull();
  });

  it("服务型技能自动化任务应展示参数摘要与主稿绑定", async () => {
    const scheduledSkillMetadata = {
      service_skill: {
        id: "daily-trend-briefing",
        title: "每日趋势摘要",
        runner_type: "scheduled",
        execution_location: "client_default",
        source: "cloud_catalog",
        slot_values: [
          {
            key: "platform",
            label: "监测平台",
            value: "X / Twitter",
          },
          {
            key: "industry_keywords",
            label: "行业关键词",
            value: "AI Agent，创作者工具",
          },
        ],
        user_input: "重点关注新增热点与异常波动。",
      },
      harness: {
        theme: "general",
        content_id: "content-service-skill-1",
      },
    };

    mockGetAutomationJobs.mockResolvedValueOnce([
      createAgentTurnJob({
        id: "job-service-skill-1",
        name: "每日趋势摘要｜定时执行",
        description: "围绕指定平台与关键词输出趋势摘要。",
        payload: {
          kind: "agent_turn",
          prompt: "[技能任务] 每日趋势摘要",
          session_id: "session-service-skill-1",
          thread_id: "thread-service-skill-1",
          system_prompt: null,
          web_search: false,
          content_id: "content-service-skill-1",
          request_metadata: scheduledSkillMetadata,
        },
        last_status: "error",
        last_error: "模型返回空结果",
        consecutive_failures: 1,
      }),
    ]);
    mockGetAutomationRunHistory.mockResolvedValueOnce([
      createAutomationRun({
        id: "run-service-skill-1",
        source_ref: "job-service-skill-1",
        session_id: "session-service-skill-1",
        status: "error",
        started_at: "2026-03-16T08:59:00Z",
        finished_at: "2026-03-16T09:00:10Z",
        duration_ms: 70_000,
        error_code: "empty_result",
        error_message: "模型返回空结果",
        metadata: JSON.stringify({
          ...scheduledSkillMetadata,
          service_skill: {
            ...scheduledSkillMetadata.service_skill,
            slot_values: [
              {
                key: "platform",
                label: "监测平台",
                value: "小红书",
              },
              {
                key: "industry_keywords",
                label: "行业关键词",
                value: "AI 短视频",
              },
            ],
            user_input: "优先记录增速最快的话题。",
          },
          content_id: "content-service-skill-run-1",
        }),
      }),
    ]);

    const container = await renderSettings({
      mode: "workspace",
      initialSelectedJobId: "job-service-skill-1",
    });
    const serviceSkillSummary = container.querySelector(
      "[data-testid='automation-job-service-skill-summary-job-service-skill-1']",
    );
    const runWindow = container.querySelector(
      "[data-testid='automation-job-run-window-job-service-skill-1']",
    );
    const runServiceSkillSummary = document.body.querySelector(
      "[data-testid='automation-run-service-skill-summary-run-service-skill-1']",
    );
    const dialog = document.body.querySelector(
      "[data-testid='automation-job-details-dialog']",
    );
    const dialogText = document.body.textContent ?? "";

    expect(serviceSkillSummary?.textContent).toContain("技能流程");
    expect(serviceSkillSummary?.textContent).toContain("定时运行");
    expect(serviceSkillSummary?.textContent).toContain("客户端执行");
    expect(serviceSkillSummary?.textContent).toContain("云目录");
    expect(serviceSkillSummary?.textContent).toContain("技能：每日趋势摘要");
    expect(serviceSkillSummary?.textContent).toContain(
      "参数摘要: 监测平台: X / Twitter · 行业关键词: AI Agent，创作者工具",
    );
    expect(runWindow?.textContent).toContain("下次:");
    expect(runWindow?.textContent).toContain("最近:");
    expect(runServiceSkillSummary?.textContent).toContain("技能流程运行上下文");
    expect(runServiceSkillSummary?.textContent).toContain("定时运行");
    expect(runServiceSkillSummary?.textContent).toContain("客户端执行");
    expect(runServiceSkillSummary?.textContent).toContain("技能：每日趋势摘要");
    expect(runServiceSkillSummary?.textContent).toContain(
      "参数摘要: 监测平台: 小红书 · 行业关键词: AI 短视频",
    );
    expect(runServiceSkillSummary?.textContent).toContain(
      "补充要求: 优先记录增速最快的话题。",
    );
    expect(dialog).not.toBeNull();
    expect(dialogText).toContain("技能流程上下文");
    expect(dialogText).toContain("每日趋势摘要");
    expect(dialogText).toContain("定时运行");
    expect(dialogText).toContain("客户端执行");
    expect(dialogText).toContain("云目录");
    expect(dialogText).toContain("主题: general");
    expect(dialogText).toContain("主稿绑定: content-service-skill-1");
    expect(dialogText).toContain("参数摘要");
    expect(dialogText).toContain("监测平台: X / Twitter");
    expect(dialogText).toContain("行业关键词: AI Agent，创作者工具");
    expect(dialogText).toContain("补充要求");
    expect(dialogText).toContain("重点关注新增热点与异常波动。");
    expect(dialogText).toContain("失败原因");
    expect(dialogText).toContain("模型返回空结果");
  });

  it("自动化任务列表应展示绑定目标摘要", async () => {
    mockGetAutomationJobs.mockResolvedValueOnce([
      createAgentTurnJob({
        id: "job-managed-objective-1",
        name: "每日目标摘要｜定时执行",
        description: "围绕目标持续生成可审计摘要。",
        payload: {
          kind: "agent_turn",
          prompt: "继续推进每日目标摘要。",
          session_id: "session-managed-objective-1",
          thread_id: "thread-managed-objective-1",
          system_prompt: null,
          web_search: false,
          request_metadata: {
            harness: {
              managed_objective: {
                objective_id: "objective-managed-1",
                owner_type: "automation_job",
                owner_id: "job-managed-objective-1",
                objective_text: "每天生成可审计的 Markdown 趋势摘要",
                success_criteria: [
                  "生成 Markdown artifact",
                  "写入 evidence pack",
                ],
                state: "blocked",
                completion_audit: "artifact_or_evidence_required",
              },
            },
          },
        },
        last_status: "error",
        last_error: "等待补充输入",
        consecutive_failures: 3,
      }),
    ]);

    const container = await renderSettings({ mode: "workspace" });
    const objectiveSummary = container.querySelector(
      "[data-testid='automation-job-managed-objective-summary-job-managed-objective-1']",
    );

    expect(objectiveSummary).not.toBeNull();
    expect(objectiveSummary?.textContent).toContain("目标");
    expect(objectiveSummary?.textContent).toContain("已阻塞");
    expect(objectiveSummary?.textContent).toContain(
      "每天生成可审计的 Markdown 趋势摘要",
    );
    expect(objectiveSummary?.textContent).toContain("2 条成功标准");
    expect(objectiveSummary?.textContent).toContain("需产物或证据审计");
  });

  it("旧目录 cloud_required 任务应显示兼容标记而不是云执行", async () => {
    const compatSkillMetadata = {
      service_skill: {
        id: "account-performance-tracking",
        title: "账号增长跟踪",
        runner_type: "managed",
        execution_location: "cloud_required",
        source: "cloud_catalog",
        slot_values: [
          {
            key: "account",
            label: "监测账号",
            value: "@lime_next",
          },
        ],
      },
      harness: {
        theme: "growth",
        content_id: "content-service-skill-compat-1",
      },
    };

    mockGetAutomationJobs.mockResolvedValueOnce([
      createAgentTurnJob({
        id: "job-service-skill-compat-1",
        name: "账号跟踪｜旧目录兼容",
        description: "从旧目录兼容标记迁移过来的技能任务。",
        schedule: { kind: "every", every_secs: 3600 },
        max_retries: 1,
        next_run_at: "2026-03-16T10:00:00Z",
        last_run_at: "2026-03-16T09:00:00Z",
        last_finished_at: "2026-03-16T09:00:30Z",
        payload: {
          kind: "agent_turn",
          prompt: "[技能任务] 账号跟踪",
          session_id: "session-service-skill-compat-1",
          thread_id: "thread-service-skill-compat-1",
          system_prompt: null,
          web_search: false,
          content_id: "content-service-skill-compat-1",
          request_metadata: compatSkillMetadata,
        },
      }),
    ]);
    mockGetAutomationRunHistory.mockResolvedValueOnce([
      createAutomationRun({
        id: "run-service-skill-compat-1",
        source_ref: "job-service-skill-compat-1",
        session_id: "session-service-skill-compat-1",
        status: "success",
        started_at: "2026-03-16T09:00:00Z",
        finished_at: "2026-03-16T09:00:30Z",
        duration_ms: 30_000,
        metadata: JSON.stringify({
          service_skill: {
            ...compatSkillMetadata.service_skill,
            execution_location: "client_default",
          },
          harness: {
            theme: "growth",
          },
        }),
        created_at: "2026-03-16T09:00:00Z",
        updated_at: "2026-03-16T09:00:30Z",
      }),
    ]);

    const container = await renderSettings({
      mode: "workspace",
      initialSelectedJobId: "job-service-skill-compat-1",
    });
    const serviceSkillSummary = container.querySelector(
      "[data-testid='automation-job-service-skill-summary-job-service-skill-compat-1']",
    );
    const runServiceSkillSummary = document.body.querySelector(
      "[data-testid='automation-run-service-skill-summary-run-service-skill-compat-1']",
    );
    const dialogText = document.body.textContent ?? "";

    expect(serviceSkillSummary?.textContent).toContain("客户端执行");
    expect(serviceSkillSummary?.textContent).toContain("旧目录兼容");
    expect(serviceSkillSummary?.textContent).not.toContain("云执行");
    expect(runServiceSkillSummary?.textContent).toContain("客户端执行");
    expect(runServiceSkillSummary?.textContent).toContain("旧目录兼容");
    expect(runServiceSkillSummary?.textContent).toContain(
      "沿用旧目录兼容标记，实际仍在客户端执行。",
    );
    expect(dialogText).toContain("旧目录兼容");
    expect(dialogText).toContain("沿用旧目录兼容标记，实际仍在客户端执行。");
    expect(dialogText).not.toContain("云执行");
  });

  it("旧 SceneApp 自动化任务应只显示下线提示，不再保留独立运行面入口", async () => {
    setupSceneAppAutomationMocks(automationMocks);

    await renderSettings({
      mode: "workspace",
      initialSelectedJobId: "job-sceneapp-1",
    });

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("故事短视频套件");
    expect(dialogText).toContain(
      "这条持续流程来自旧 SceneApp 独立运行面；当前只保留历史任务信息，不再回流做法摘要或启动旧运行链。",
    );
    expect(dialogText).not.toContain("接回生成");
    expect(dialogText).not.toContain("按 Project Pack 对齐");
    expect(dialogText).not.toContain("最近结果");
    expect(dialogText).not.toContain("保存到灵感库");
  }, 10_000);
});
