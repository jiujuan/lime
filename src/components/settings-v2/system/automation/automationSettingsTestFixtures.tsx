import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Mock } from "vitest";
import { AutomationSettings } from ".";
import type {
  AutomationHealthResult,
  AutomationJobRecord,
  AutomationLastDeliveryRecord,
  AutomationSchedulerConfig,
  AutomationStatus,
} from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";

type AutomationMock = Mock<(...args: unknown[]) => unknown>;

interface AutomationMockSetters {
  mockGetAutomationSchedulerConfig: AutomationMock;
  mockGetAutomationStatus: AutomationMock;
  mockGetAutomationJobs: AutomationMock;
  mockGetAutomationHealth: AutomationMock;
  mockGetAutomationRunHistory: AutomationMock;
  mockListProjects: AutomationMock;
  mockAuditAgentRuntimeObjective: AutomationMock;
  mockOpenPathWithDefaultApp: AutomationMock;
  mockRevealPathInFinder: AutomationMock;
}

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

export function createSchedulerConfig(
  overrides: Partial<AutomationSchedulerConfig> = {},
): AutomationSchedulerConfig {
  return {
    enabled: true,
    poll_interval_secs: 30,
    enable_history: true,
    ...overrides,
  };
}

export function createAutomationStatus(
  overrides: Partial<AutomationStatus> = {},
): AutomationStatus {
  return {
    running: true,
    last_polled_at: "2026-03-16T00:00:00Z",
    next_poll_at: "2026-03-16T00:00:30Z",
    last_job_count: 1,
    total_executions: 1,
    active_job_id: null,
    active_job_name: null,
    ...overrides,
  };
}

export function createLastDelivery(
  overrides: Partial<AutomationLastDeliveryRecord> = {},
): AutomationLastDeliveryRecord {
  return {
    success: false,
    message: "写入本地文件失败: permission denied",
    channel: "local_file",
    target: "/tmp/lime/browser-output.json",
    output_kind: "json",
    output_schema: "json",
    output_format: "json",
    output_preview: '{\n  "session_id": "mock-cdp-session-shop_us"\n}',
    delivery_attempt_id: "dlv-run-browser-1",
    run_id: "run-browser-1",
    execution_retry_count: 0,
    delivery_attempts: 2,
    attempted_at: "2026-03-16T00:00:08Z",
    ...overrides,
  };
}

export function createBrowserJob(
  overrides: Partial<AutomationJobRecord> = {},
): AutomationJobRecord {
  return {
    id: "job-browser-1",
    name: "浏览器巡检",
    description: "启动浏览器并等待人工检查",
    enabled: true,
    workspace_id: "workspace-default",
    execution_mode: "intelligent",
    schedule: { kind: "every", every_secs: 900 },
    payload: {
      kind: "browser_session",
      profile_id: "profile-1",
      profile_key: "shop_us",
      url: "https://seller.example.com/dashboard",
      environment_preset_id: "preset-1",
      target_id: null,
      open_window: false,
      stream_mode: "events",
    },
    delivery: {
      mode: "announce",
      channel: "local_file",
      target: "/tmp/lime/browser-output.json",
      best_effort: false,
      output_schema: "json",
      output_format: "json",
    },
    timeout_secs: 120,
    max_retries: 2,
    next_run_at: "2026-03-16T00:15:00Z",
    last_status: "waiting_for_human",
    last_error: null,
    last_run_at: "2026-03-16T00:00:00Z",
    last_finished_at: null,
    running_started_at: "2026-03-16T00:00:00Z",
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: createLastDelivery(),
    created_at: "2026-03-16T00:00:00Z",
    updated_at: "2026-03-16T00:00:00Z",
    ...overrides,
  };
}

export function createAgentTurnJob(
  overrides: Partial<AutomationJobRecord> = {},
): AutomationJobRecord {
  return {
    id: "job-agent-1",
    name: "日报摘要",
    description: "生成日报",
    enabled: true,
    workspace_id: "workspace-default",
    execution_mode: "skill",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
    payload: {
      kind: "agent_turn",
      prompt: "请输出日报摘要",
      system_prompt: null,
      web_search: false,
    },
    delivery: {
      mode: "none",
      channel: null,
      target: null,
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    },
    timeout_secs: 120,
    max_retries: 2,
    next_run_at: "2026-03-16T09:00:00Z",
    last_status: "success",
    last_error: null,
    last_run_at: "2026-03-16T08:59:00Z",
    last_finished_at: "2026-03-16T09:00:10Z",
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: null,
    created_at: "2026-03-16T00:00:00Z",
    updated_at: "2026-03-16T00:00:00Z",
    ...overrides,
  };
}

export function createAutomationHealth(
  overrides: Partial<AutomationHealthResult> = {},
): AutomationHealthResult {
  return {
    total_jobs: 1,
    enabled_jobs: 1,
    pending_jobs: 0,
    running_jobs: 0,
    failed_jobs: 0,
    cooldown_jobs: 0,
    stale_running_jobs: 0,
    failed_last_24h: 0,
    failure_trend_24h: [],
    alerts: [],
    risky_jobs: [
      {
        job_id: "job-browser-1",
        name: "浏览器巡检",
        status: "waiting_for_human",
        consecutive_failures: 0,
        retry_count: 0,
        detail_message: "等待你确认是否继续执行",
        auto_disabled_until: null,
        updated_at: "2026-03-16T00:00:10Z",
      },
    ],
    generated_at: "2026-03-16T00:00:00Z",
    ...overrides,
  };
}

export function createAutomationRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-browser-1",
    source: "automation",
    source_ref: "job-browser-1",
    session_id: "mock-cdp-session-shop_us",
    status: "running",
    started_at: "2026-03-16T00:00:00Z",
    finished_at: null,
    duration_ms: null,
    error_code: null,
    error_message: null,
    metadata: JSON.stringify({
      payload_kind: "browser_session",
      profile_key: "shop_us",
      session_id: "mock-cdp-session-shop_us",
      browser_lifecycle_state: "waiting_for_human",
      human_reason: "等待你确认是否继续执行",
      delivery: createLastDelivery(),
    }),
    created_at: "2026-03-16T00:00:00Z",
    updated_at: "2026-03-16T00:00:10Z",
    ...overrides,
  };
}

export function setupDefaultAutomationMocks(mocks: AutomationMockSetters) {
  mocks.mockGetAutomationSchedulerConfig.mockResolvedValue(
    createSchedulerConfig(),
  );
  mocks.mockGetAutomationStatus.mockResolvedValue(createAutomationStatus());
  mocks.mockGetAutomationJobs.mockResolvedValue([createBrowserJob()]);
  mocks.mockGetAutomationHealth.mockResolvedValue(createAutomationHealth());
  mocks.mockGetAutomationRunHistory.mockResolvedValue([createAutomationRun()]);
  mocks.mockListProjects.mockResolvedValue([
    {
      id: "workspace-default",
      name: "默认工作区",
      rootPath: "/workspace/default",
    },
  ]);
  mocks.mockAuditAgentRuntimeObjective.mockResolvedValue({});
  mocks.mockOpenPathWithDefaultApp.mockResolvedValue(undefined);
  mocks.mockRevealPathInFinder.mockResolvedValue(undefined);
}

export async function renderSettings(
  props: Partial<ComponentProps<typeof AutomationSettings>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(<AutomationSettings {...props} />);
  });
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return container;
}

export async function cleanupMountedAutomationSettings() {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
}

export async function openJobDetails(container: HTMLDivElement, jobId: string) {
  const button = container.querySelector(
    `[data-testid='automation-job-open-details-${jobId}']`,
  ) as HTMLButtonElement | null;

  if (!button) {
    throw new Error(`未找到持续流程详情按钮: ${jobId}`);
  }

  await clickElement(button, 2);
}

export function getBodyText() {
  return document.body.textContent ?? "";
}

export async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`未找到提示按钮: ${ariaLabel}`);
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger;
}

export async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
  });
}

export async function clickElement(
  element: HTMLElement | null,
  flushCount = 1,
) {
  if (!element) {
    throw new Error("未找到可点击元素");
  }

  await act(async () => {
    element.click();
    for (let index = 0; index < flushCount; index += 1) {
      await Promise.resolve();
    }
  });
}

export function setupSceneAppAutomationMocks(mocks: AutomationMockSetters) {
  const sceneAppJob = createAgentTurnJob({
    id: "job-sceneapp-1",
    name: "故事短视频套件｜定时执行",
    description: "按统一做法合同持续产出 Project Pack。",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
    payload: {
      kind: "agent_turn",
      prompt: "请执行 SceneApp 自动化任务。",
      system_prompt: null,
      web_search: false,
      request_metadata: {
        sceneapp: {
          id: "story-video-suite",
          title: "故事短视频套件",
          sceneapp_type: "hybrid",
          delivery_contract: "project_pack",
        },
        harness: {
          sceneapp_id: "story-video-suite",
          entry_source: "sceneapp_detail_preview",
          project_id: "workspace-default",
          workspace_id: "workspace-default",
          sceneapp_launch: {
            sceneapp_id: "story-video-suite",
            entry_source: "sceneapp_detail_preview",
            project_id: "workspace-default",
            workspace_id: "workspace-default",
            reference_memory_ids: ["memory-1"],
          },
        },
        sceneapp_reference_memory_ids: ["memory-1"],
        sceneapp_slots: {
          topic: "AI 创作者工具",
        },
      },
    },
    last_delivery: createLastDelivery({
      success: true,
      message: "写入成功",
      channel: "local_file",
      target: "/tmp/lime/story-video-suite/brief.md",
      output_kind: "document",
      output_schema: "text",
      output_format: "text",
      output_preview: "# brief",
      delivery_attempt_id: "delivery-sceneapp-1",
      run_id: "run-sceneapp-1",
      execution_retry_count: 0,
      delivery_attempts: 1,
      attempted_at: "2026-03-16T09:00:10Z",
    }),
  });
  const sceneAppAgentRun = createAutomationRun({
    id: "run-sceneapp-1",
    source_ref: "job-sceneapp-1",
    session_id: "session-sceneapp-1",
    status: "success",
    started_at: "2026-03-16T08:59:00Z",
    finished_at: "2026-03-16T09:00:10Z",
    duration_ms: 70_000,
    metadata: JSON.stringify({
      sceneapp: {
        id: "story-video-suite",
      },
    }),
    created_at: "2026-03-16T08:59:00Z",
    updated_at: "2026-03-16T09:00:10Z",
  });

  mocks.mockGetAutomationJobs.mockResolvedValue([sceneAppJob]);
  mocks.mockGetAutomationRunHistory.mockResolvedValue([sceneAppAgentRun]);

  return {
    sceneAppJob,
  };
}

export function setupManagedObjectiveAutomationMocks(
  mocks: AutomationMockSetters,
) {
  const managedObjectiveJob = createAgentTurnJob({
    id: "job-managed-objective-1",
    name: "目标日报",
    description: "持续推进可审计目标。",
    max_retries: 1,
    payload: {
      kind: "agent_turn",
      prompt: "请继续推进目标。",
      system_prompt: null,
      web_search: false,
      request_metadata: {
        harness: {
          managed_objective: {
            objective_id: "objective-1",
            owner_type: "automation_job",
            owner_id: "job-managed-objective-1",
            objective_text: "产出可审计日报",
            success_criteria: ["生成 Markdown", "附带证据包"],
            state: "active",
            last_evidence_pack_ref:
              ".lime/harness/job-managed-objective-1/evidence",
            last_artifact_refs: ["reports/daily.md"],
          },
        },
      },
    },
  });
  const managedObjectiveRun = createAutomationRun({
    id: "run-managed-objective-1",
    source_ref: "job-managed-objective-1",
    session_id: "session-managed-objective-1",
    status: "success",
    started_at: "2026-03-16T08:59:00Z",
    finished_at: "2026-03-16T09:00:10Z",
    duration_ms: 70_000,
    metadata: "{}",
    created_at: "2026-03-16T08:59:00Z",
    updated_at: "2026-03-16T09:00:10Z",
  });

  mocks.mockGetAutomationJobs.mockResolvedValue([managedObjectiveJob]);
  mocks.mockGetAutomationRunHistory.mockResolvedValue([managedObjectiveRun]);

  return {
    managedObjectiveJob,
  };
}
