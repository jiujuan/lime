import { beforeEach, describe, expect, it } from "vitest";

import {
  agentRuntimeObjectiveMocks,
  resetAgentRuntimeObjectiveMocks,
} from "./agentRuntimeObjectiveMocks";

describe("agentRuntimeObjectiveMocks", () => {
  beforeEach(() => {
    resetAgentRuntimeObjectiveMocks();
  });

  it("应按会话隔离目标状态", () => {
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-a",
        objectiveText: "目标 A",
      },
    });
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-b",
        objectiveText: "目标 B",
      },
    });

    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_objective({
        sessionId: "session-a",
      })?.objective_text,
    ).toBe("目标 A");
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_objective({
        sessionId: "session-b",
      })?.objective_text,
    ).toBe("目标 B");
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_thread_read({
        sessionId: "session-a",
      }).managed_objective?.objective_text,
    ).toBe("目标 A");
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_thread_read({
        sessionId: "session-b",
      }).managed_objective?.objective_text,
    ).toBe("目标 B");
  });

  it("应只清除指定会话的目标", () => {
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-a",
        objectiveText: "目标 A",
      },
    });
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-b",
        objectiveText: "目标 B",
      },
    });

    expect(
      agentRuntimeObjectiveMocks.agent_runtime_clear_objective({
        sessionId: "session-a",
      }),
    ).toEqual({ cleared: true });
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_objective({
        sessionId: "session-a",
      }),
    ).toBeNull();
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_objective({
        sessionId: "session-b",
      })?.objective_text,
    ).toBe("目标 B");
  });

  it("应写回审计摘要和证据引用", () => {
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-a",
        objectiveText: "目标 A",
      },
    });

    const audited = agentRuntimeObjectiveMocks.agent_runtime_audit_objective({
      request: {
        sessionId: "session-a",
      },
    });

    expect(audited.status).toBe("completed");
    expect(audited.last_audit_summary).toContain("decision=completed");
    expect(audited.last_evidence_pack_ref).toContain(
      ".lime/harness/mock/evidence",
    );
    expect(audited.last_artifact_refs).toEqual([
      ".lime/harness/mock/evidence/artifacts/mock.md",
    ]);
  });

  it("成功标准未知时不应在 mock 审计里伪造完成", () => {
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-a",
        objectiveText: "目标 A",
        successCriteria: ["产出 Markdown 报告"],
      },
    });

    const audited = agentRuntimeObjectiveMocks.agent_runtime_audit_objective({
      request: {
        sessionId: "session-a",
      },
    });

    expect(audited.status).toBe("active");
    expect(audited.last_audit_summary).toContain("decision=verifying");
    expect(audited.last_audit_summary).toContain("unknown_success_criteria");
  });

  it("应支持 automation job owner 的目标审计", () => {
    agentRuntimeObjectiveMocks.agent_runtime_set_objective({
      request: {
        sessionId: "session-a",
        ownerKind: "automation_job",
        ownerId: "job-a",
        objectiveText: "自动化目标",
      },
    });

    const audited = agentRuntimeObjectiveMocks.agent_runtime_audit_objective({
      request: {
        sessionId: "session-a",
        ownerKind: "automation_job",
        ownerId: "job-a",
      },
    });

    expect(audited.owner_kind).toBe("automation_job");
    expect(audited.owner_id).toBe("job-a");
    expect(audited.last_audit_summary).toContain("decision=completed");
    expect(
      agentRuntimeObjectiveMocks.agent_runtime_get_objective({
        sessionId: "session-a",
      }),
    ).toBeNull();
  });
});
