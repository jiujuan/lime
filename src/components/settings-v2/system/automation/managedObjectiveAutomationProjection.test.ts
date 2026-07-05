import { describe, expect, it } from "vitest";
import type { AutomationJobRecord } from "@/lib/api/automation";
import { resolveManagedObjectiveAutomationProjection } from "./managedObjectiveAutomationProjection";

function buildAgentTurnJob(
  requestMetadata: Record<string, unknown> | null,
  overrides: Partial<AutomationJobRecord> = {},
): AutomationJobRecord {
  return {
    id: "job-objective-1",
    name: "目标日报",
    description: "每天推进目标",
    enabled: true,
    workspace_id: "workspace-default",
    execution_mode: "skill",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
    payload: {
      kind: "agent_turn",
      prompt: "继续推进目标",
      session_id: "session-objective-1",
      thread_id: "thread-objective-1",
      system_prompt: null,
      web_search: false,
      request_metadata: requestMetadata,
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
    next_run_at: "2026-05-25T09:00:00Z",
    last_status: "success",
    last_error: null,
    last_run_at: "2026-05-25T08:59:00Z",
    last_finished_at: "2026-05-25T09:00:10Z",
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: null,
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T00:00:00Z",
    ...overrides,
  };
}

describe("resolveManagedObjectiveAutomationProjection", () => {
  it("应解析后端回填的 snake_case objective 绑定", () => {
    const projection = resolveManagedObjectiveAutomationProjection(
      buildAgentTurnJob({
        harness: {
          managed_objective: {
            objective_id: "objective-1",
            owner_type: "automation_job",
            owner_id: "job-objective-1",
            objective_text: "每天生成可审计摘要",
            success_criteria: ["生成 Markdown", "写入证据包"],
            state: "blocked",
            completion_audit: "artifact_or_evidence_required",
            last_audit_summary: "缺少证据包",
            last_evidence_pack_ref: ".lime/harness/job/evidence",
            last_artifact_refs: ["content-posts/daily.md"],
            blocker_reason: "等待补证据",
          },
        },
      }),
    );

    expect(projection).toEqual({
      objectiveId: "objective-1",
      ownerId: "job-objective-1",
      ownerType: "automation_job",
      objectiveText: "每天生成可审计摘要",
      successCriteria: ["生成 Markdown", "写入证据包"],
      status: "blocked",
      completionAudit: "artifact_or_evidence_required",
      requiresArtifactOrEvidence: true,
      lastAuditSummary: "缺少证据包",
      lastEvidencePackRef: ".lime/harness/job/evidence",
      lastArtifactRefs: ["content-posts/daily.md"],
      blockerReason: "等待补证据",
    });
  });

  it("应兼容 camelCase objective 绑定并默认 active 状态", () => {
    const projection = resolveManagedObjectiveAutomationProjection(
      buildAgentTurnJob({
        harness: {
          managedObjective: {
            objectiveId: "objective-2",
            ownerType: "automation_job",
            ownerId: "job-objective-1",
            objectiveText: "继续跟进线索",
            successCriteria: ["整理下一步"],
            completionAudit: { kind: "artifact_or_evidence_required" },
            lastAuditSummary: "Needs artifact",
            lastEvidencePackRef: ".lime/evidence",
            lastArtifactRefs: ["draft.md"],
            blockerReason: "Need input",
          },
        },
      }),
    );

    expect(projection?.status).toBe("active");
    expect(projection?.objectiveText).toBe("继续跟进线索");
    expect(projection?.successCriteria).toEqual(["整理下一步"]);
    expect(projection?.requiresArtifactOrEvidence).toBe(true);
    expect(projection?.lastAuditSummary).toBe("Needs artifact");
    expect(projection?.lastEvidencePackRef).toBe(".lime/evidence");
    expect(projection?.lastArtifactRefs).toEqual(["draft.md"]);
    expect(projection?.blockerReason).toBe("Need input");
  });

  it("owner 不属于 automation job 时不应生成投影", () => {
    const projection = resolveManagedObjectiveAutomationProjection(
      buildAgentTurnJob({
        harness: {
          managed_objective: {
            owner_type: "agent_session",
            objective_text: "不属于自动化任务",
          },
        },
      }),
    );

    expect(projection).toBeNull();
  });

  it("owner_id 指向其它任务时不应生成投影", () => {
    const projection = resolveManagedObjectiveAutomationProjection(
      buildAgentTurnJob({
        harness: {
          managed_objective: {
            owner_type: "automation_job",
            owner_id: "job-other",
            objective_text: "错误绑定",
          },
        },
      }),
    );

    expect(projection).toBeNull();
  });
});
