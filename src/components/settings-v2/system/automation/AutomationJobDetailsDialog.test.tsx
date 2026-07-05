import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AutomationJobDetailsDialog } from "./AutomationJobDetailsDialog";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
});

afterEach(async () => {
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
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

async function renderDialog(
  props: Partial<ComponentProps<typeof AutomationJobDetailsDialog>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(
      <AutomationJobDetailsDialog
        open
        onOpenChange={vi.fn()}
        job={
          {
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
            last_delivery: {
              success: false,
              message: "写入本地文件失败: permission denied",
              channel: "local_file",
              target: "/tmp/lime/browser-output.json",
              output_kind: "json",
              output_schema: "json",
              output_format: "json",
              output_preview:
                '{\n  "session_id": "mock-cdp-session-shop_us"\n}',
              delivery_attempt_id: "dlv-run-browser-1",
              run_id: "run-browser-1",
              execution_retry_count: 0,
              delivery_attempts: 2,
              attempted_at: "2026-03-16T00:00:08Z",
            },
            created_at: "2026-03-16T00:00:00Z",
            updated_at: "2026-03-16T00:00:00Z",
          } as any
        }
        workspaceName="默认工作区"
        serviceSkillContext={null}
        jobRuns={
          [
            {
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
              metadata: "{}",
              created_at: "2026-03-16T00:00:00Z",
              updated_at: "2026-03-16T00:00:10Z",
            },
          ] as any
        }
        historyLoading={false}
        onRefreshHistory={vi.fn()}
        {...props}
      />,
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  return container;
}

function getBodyText() {
  return document.body.textContent ?? "";
}

async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("AutomationJobDetailsDialog", () => {
  it("旧 SceneApp 自动化详情只展示下线提示", async () => {
    await renderDialog({
      retiredSceneAppMessage:
        "This ongoing flow came from the legacy standalone SceneApp runtime.",
    });

    expect(getBodyText()).toContain("Legacy SceneApp Retired");
    expect(getBodyText()).toContain(
      "This ongoing flow came from the legacy standalone SceneApp runtime.",
    );
    expect(getBodyText()).not.toContain("This Run Judgment");
    expect(getBodyText()).not.toContain("Save to Inspiration");
  });

  it("应把头部长说明收进 tip 并展示轻量摘要", async () => {
    await renderDialog();

    expect(getBodyText()).toContain("Ongoing Flow Details");
    expect(getBodyText()).toContain(
      "Review this ongoing flow's status, output destination, and recent runs.",
    );
    expect(getBodyText()).toContain("Workspace: 默认工作区");
    expect(getBodyText()).not.toContain(
      "When migrating legacy browser flows, confirm the legacy configuration and risk notice here too.",
    );

    const headerTip = await hoverTip("Ongoing flow detail help");
    expect(getBodyText()).toContain(
      "When migrating legacy browser flows, confirm the legacy configuration and risk notice here too.",
    );
    await leaveTip(headerTip);
  });

  it("点击刷新应调用历史刷新方法", async () => {
    const onRefreshHistory = vi.fn();
    await renderDialog({ onRefreshHistory });

    const refreshButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh"),
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      refreshButton?.click();
      await Promise.resolve();
    });

    expect(onRefreshHistory).toHaveBeenCalledWith("job-browser-1");
  });

  it("agent_turn 任务详情应展示解析后的权限模式", async () => {
    await renderDialog({
      job: {
        id: "job-agent-1",
        name: "每日摘要",
        description: "生成一份摘要",
        enabled: true,
        workspace_id: "workspace-default",
        execution_mode: "intelligent",
        schedule: { kind: "every", every_secs: 900 },
        payload: {
          kind: "agent_turn",
          prompt: "请生成摘要",
          session_id: "session-agent-1",
          thread_id: "thread-agent-1",
          system_prompt: null,
          web_search: false,
          content_id: null,
          approval_policy: "never",
          sandbox_policy: "danger-full-access",
          request_metadata: {
            harness: {
              access_mode: "read-only",
            },
          },
        },
        delivery: {
          mode: "none",
          channel: null,
          target: null,
          best_effort: true,
          output_schema: "text",
          output_format: "text",
        },
        timeout_secs: null,
        max_retries: 1,
        next_run_at: null,
        last_status: "success",
        last_error: null,
        last_run_at: null,
        last_finished_at: null,
        running_started_at: null,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: null,
        last_delivery: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      } as any,
    });

    expect(getBodyText()).toContain("Access Mode: Full access");
  });

  it("agent_turn 任务详情应展示绑定目标与审计要求", async () => {
    await renderDialog({
      job: {
        id: "job-objective-1",
        name: "Daily goal brief",
        description: "Keep the goal moving.",
        enabled: true,
        workspace_id: "workspace-default",
        execution_mode: "skill",
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
        payload: {
          kind: "agent_turn",
          prompt: "Continue the managed objective.",
          session_id: "session-objective-1",
          thread_id: "thread-objective-1",
          system_prompt: null,
          web_search: false,
          content_id: null,
          request_metadata: {
            harness: {
              managed_objective: {
                objective_id: "objective-1",
                owner_type: "automation_job",
                owner_id: "job-objective-1",
                objective_text: "Publish an auditable daily Markdown brief",
                success_criteria: [
                  "Create a Markdown artifact",
                  "Attach evidence pack references",
                ],
                state: "needs_input",
                completion_audit: "artifact_or_evidence_required",
                last_audit_summary: "Latest audit needs more evidence.",
                last_evidence_pack_ref:
                  ".lime/harness/job-objective-1/evidence",
                last_artifact_refs: [
                  "content-posts/daily.md",
                  "content-posts/daily-checklist.md",
                ],
                blocker_reason: "Waiting for source notes",
              },
            },
          },
        },
        delivery: {
          mode: "none",
          channel: null,
          target: null,
          best_effort: true,
          output_schema: "text",
          output_format: "text",
        },
        timeout_secs: null,
        max_retries: 1,
        next_run_at: null,
        last_status: "pending",
        last_error: null,
        last_run_at: null,
        last_finished_at: null,
        running_started_at: null,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: null,
        last_delivery: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      } as any,
      jobRuns: [],
    });

    const details = document.body.querySelector(
      "[data-testid='automation-job-managed-objective-details-job-objective-1']",
    );

    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("Bound Goal");
    expect(details?.textContent).toContain("Needs input");
    expect(details?.textContent).toContain("Blocker: Waiting for source notes");
    expect(details?.textContent).toContain(
      "Publish an auditable daily Markdown brief",
    );
    expect(details?.textContent).toContain("Create a Markdown artifact");
    expect(details?.textContent).toContain("Attach evidence pack references");
    expect(details?.textContent).toContain("Audit Requirement");
    expect(details?.textContent).toContain(
      "Completion requires an artifact or evidence pack",
    );
    expect(details?.textContent).toContain("Latest audit evidence");
    expect(details?.textContent).toContain("Latest audit needs more evidence.");
    expect(details?.textContent).toContain("Evidence pack");
    expect(details?.textContent).toContain(
      ".lime/harness/job-objective-1/evidence",
    );
    expect(details?.textContent).toContain("Artifact refs (2)");
    expect(details?.textContent).toContain("content-posts/daily.md");
    expect(details?.textContent).toContain("content-posts/daily-checklist.md");
  });

  it("绑定目标没有运行会话时应禁用审计动作并给出恢复路径", async () => {
    const onAuditManagedObjective = vi.fn();
    await renderDialog({
      onAuditManagedObjective,
      job: {
        id: "job-objective-1",
        name: "Daily goal brief",
        description: "Keep the goal moving.",
        enabled: true,
        workspace_id: "workspace-default",
        execution_mode: "skill",
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
        payload: {
          kind: "agent_turn",
          prompt: "Continue the managed objective.",
          session_id: "session-objective-1",
          thread_id: "thread-objective-1",
          system_prompt: null,
          web_search: false,
          content_id: null,
          request_metadata: {
            harness: {
              managed_objective: {
                objective_id: "objective-1",
                owner_type: "automation_job",
                owner_id: "job-objective-1",
                objective_text: "Publish an auditable daily Markdown brief",
                success_criteria: ["Create a Markdown artifact"],
                state: "active",
              },
            },
          },
        },
        delivery: {
          mode: "none",
          channel: null,
          target: null,
          best_effort: true,
          output_schema: "text",
          output_format: "text",
        },
        timeout_secs: null,
        max_retries: 1,
        next_run_at: null,
        last_status: "pending",
        last_error: null,
        last_run_at: null,
        last_finished_at: null,
        running_started_at: null,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: null,
        last_delivery: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      } as any,
      jobRuns: [],
    });

    const auditButton = document.body.querySelector<HTMLButtonElement>(
      "[data-testid='automation-managed-objective-audit-job-objective-1']",
    );

    expect(auditButton).not.toBeNull();
    expect(auditButton?.disabled).toBe(true);
    expect(getBodyText()).toContain(
      "No run session is available for audit yet.",
    );
    expect(onAuditManagedObjective).not.toHaveBeenCalled();
  });

  it("绑定目标证据引用应按工作区根目录打开和定位", async () => {
    const onOpenManagedObjectiveReference = vi.fn();
    const onRevealManagedObjectiveReference = vi.fn();
    await renderDialog({
      workspaceRoot: "/workspace/root",
      onOpenManagedObjectiveReference,
      onRevealManagedObjectiveReference,
      job: {
        id: "job-objective-1",
        name: "Daily goal brief",
        description: "Keep the goal moving.",
        enabled: true,
        workspace_id: "workspace-default",
        execution_mode: "skill",
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
        payload: {
          kind: "agent_turn",
          prompt: "Continue the managed objective.",
          session_id: "session-objective-1",
          thread_id: "thread-objective-1",
          system_prompt: null,
          web_search: false,
          content_id: null,
          request_metadata: {
            harness: {
              managed_objective: {
                objective_id: "objective-1",
                owner_type: "automation_job",
                owner_id: "job-objective-1",
                objective_text: "Publish an auditable daily Markdown brief",
                success_criteria: ["Create a Markdown artifact"],
                state: "active",
                last_evidence_pack_ref:
                  ".lime/harness/job-objective-1/evidence",
                last_artifact_refs: ["content-posts/daily.md"],
              },
            },
          },
        },
        delivery: {
          mode: "none",
          channel: null,
          target: null,
          best_effort: true,
          output_schema: "text",
          output_format: "text",
        },
        timeout_secs: null,
        max_retries: 1,
        next_run_at: null,
        last_status: "pending",
        last_error: null,
        last_run_at: null,
        last_finished_at: null,
        running_started_at: null,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: null,
        last_delivery: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      } as any,
    });

    const openEvidenceButton = document.body.querySelector<HTMLButtonElement>(
      "[data-testid='automation-managed-objective-open-evidence-job-objective-1-0']",
    );
    const revealArtifactButton = document.body.querySelector<HTMLButtonElement>(
      "[data-testid='automation-managed-objective-reveal-artifact-job-objective-1-0']",
    );

    await act(async () => {
      openEvidenceButton?.click();
      revealArtifactButton?.click();
      await Promise.resolve();
    });

    expect(onOpenManagedObjectiveReference).toHaveBeenCalledWith(
      "/workspace/root/.lime/harness/job-objective-1/evidence",
    );
    expect(onRevealManagedObjectiveReference).toHaveBeenCalledWith(
      "/workspace/root/content-posts/daily.md",
    );
  });
});
