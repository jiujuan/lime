import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import type { ManagedObjective } from "@/lib/api/agentRuntime";
import { ManagedObjectivePanel } from "./ManagedObjectivePanel";

const {
  auditAgentRuntimeObjectiveMock,
  clearAgentRuntimeObjectiveMock,
  continueAgentRuntimeObjectiveMock,
  setAgentRuntimeObjectiveMock,
  toastMock,
  updateAgentRuntimeObjectiveStatusMock,
} = vi.hoisted(() => ({
  auditAgentRuntimeObjectiveMock: vi.fn(),
  clearAgentRuntimeObjectiveMock: vi.fn(),
  continueAgentRuntimeObjectiveMock: vi.fn(),
  setAgentRuntimeObjectiveMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
  updateAgentRuntimeObjectiveStatusMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    auditAgentRuntimeObjective: auditAgentRuntimeObjectiveMock,
    clearAgentRuntimeObjective: clearAgentRuntimeObjectiveMock,
    continueAgentRuntimeObjective: continueAgentRuntimeObjectiveMock,
    setAgentRuntimeObjective: setAgentRuntimeObjectiveMock,
    updateAgentRuntimeObjectiveStatus: updateAgentRuntimeObjectiveStatusMock,
  };
});

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
}

const mountedPanels: MountedPanel[] = [];

function createObjective(
  status: ManagedObjective["status"] = "active",
): ManagedObjective {
  return {
    objective_id: "objective-1",
    workspace_id: "workspace-1",
    owner_kind: "agent_session",
    owner_id: "session-1",
    objective_text: "完成 /goal GUI 接入",
    success_criteria: ["目标可保存", "目标可继续"],
    status,
    budget_policy: null,
    risk_policy: null,
    approval_policy: null,
    continuation_policy: null,
    last_audit_summary: null,
    last_evidence_pack_ref: null,
    last_artifact_refs: [],
    blocker_reason: null,
    created_at: "2026-05-24T00:00:00Z",
    updated_at: "2026-05-24T00:00:00Z",
  };
}

function renderPanel(
  props: {
    objective?: ManagedObjective | null;
    runtimeBusy?: boolean;
    onObjectiveChanged?: () => void | Promise<void>;
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ManagedObjectivePanel
        sessionId="session-1"
        workspaceId="workspace-1"
        objective={props.objective ?? null}
        runtimeBusy={props.runtimeBusy}
        onObjectiveChanged={props.onObjectiveChanged}
      />,
    );
  });

  mountedPanels.push({ container, root });
  return container;
}

function setTextareaValue(textarea: HTMLTextAreaElement | null, value: string) {
  expect(textarea).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickButton(button: HTMLButtonElement | null) {
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  clearAgentRuntimeObjectiveMock.mockReset();
  auditAgentRuntimeObjectiveMock.mockReset();
  continueAgentRuntimeObjectiveMock.mockReset();
  setAgentRuntimeObjectiveMock.mockReset();
  updateAgentRuntimeObjectiveStatusMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  for (const mounted of mountedPanels.splice(0)) {
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("ManagedObjectivePanel", () => {
  it("应把空态表单保存成当前会话目标", async () => {
    const nextObjective = createObjective();
    const onObjectiveChanged = vi.fn(async () => undefined);
    setAgentRuntimeObjectiveMock.mockResolvedValue(nextObjective);
    const container = renderPanel({ onObjectiveChanged });

    setTextareaValue(
      container.querySelector<HTMLTextAreaElement>(
        '[data-testid="managed-objective-objective-input"]',
      ),
      "完成 /goal GUI 接入",
    );
    setTextareaValue(
      container.querySelector<HTMLTextAreaElement>(
        '[data-testid="managed-objective-criteria-input"]',
      ),
      "目标可保存\n目标可继续",
    );

    await clickButton(
      container.querySelector('[data-testid="managed-objective-save"]'),
    );

    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      objectiveText: "完成 /goal GUI 接入",
      successCriteria: ["目标可保存", "目标可继续"],
    });
    expect(onObjectiveChanged).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("进行中");
  });

  it("应在 active 状态提交继续目标请求", async () => {
    const objective = createObjective("active");
    const onObjectiveChanged = vi.fn(async () => undefined);
    continueAgentRuntimeObjectiveMock.mockResolvedValue({
      submitted: true,
      queued_turn_id: "queued-objective-1",
      objective,
    });
    const container = renderPanel({ objective, onObjectiveChanged });

    await clickButton(
      container.querySelector('[data-testid="managed-objective-continue"]'),
    );

    expect(continueAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(onObjectiveChanged).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("已提交继续目标请求");
  });

  it("应通过验证命令回写审计摘要并展示结果", async () => {
    const objective = createObjective("active");
    const onObjectiveChanged = vi.fn(async () => undefined);
    const auditedObjective = {
      ...createObjective("completed"),
      last_audit_summary:
        "decision=completed; pending_requests=0; evidence_pack=/tmp/evidence; artifacts=1; blockers=none",
      last_evidence_pack_ref: "/tmp/evidence",
      last_artifact_refs: ["/tmp/evidence/artifacts/result.md"],
    };
    auditAgentRuntimeObjectiveMock.mockResolvedValue(auditedObjective);
    const container = renderPanel({ objective, onObjectiveChanged });

    await clickButton(
      container.querySelector('[data-testid="managed-objective-audit"]'),
    );

    expect(auditAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(onObjectiveChanged).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("已验证会话目标");
    expect(container.textContent).toContain("验证结果");
    expect(container.textContent).toContain("/tmp/evidence");
    expect(container.textContent).toContain("result.md");
  });

  it("运行中会话不允许重复继续目标", () => {
    const container = renderPanel({
      objective: createObjective("active"),
      runtimeBusy: true,
    });

    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="managed-objective-continue"]',
    );

    expect(continueButton?.disabled).toBe(true);
    expect(container.textContent).toContain("当前会话正在执行或排队");
  });

  it("应只展示后端 projection 状态，不从审计摘要推断完成", () => {
    const objective = {
      ...createObjective("active"),
      last_audit_summary:
        "decision=completed; evidence_pack=/tmp/evidence; artifacts=1; blockers=none",
      last_evidence_pack_ref: "/tmp/evidence",
      last_artifact_refs: ["/tmp/evidence/artifacts/result.md"],
    };
    const container = renderPanel({ objective });

    expect(container.textContent).toContain("进行中");
    expect(container.textContent).not.toContain("已完成");
    expect(container.textContent).toContain("验证结果");
    expect(container.textContent).toContain(
      "decision=completed; evidence_pack=/tmp/evidence",
    );
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="managed-objective-continue"]',
      )?.disabled,
    ).toBe(false);
  });

  it.each([
    ["needs_input", "需要补充", "等待用户补充信息"],
    ["blocked", "已阻塞", "外部依赖失败"],
    ["budget_limited", "预算受限", "自动续跑已达到最大轮数"],
  ] as const)("应展示高风险状态 %s 的后端阻塞原因", (status, label, blocker) => {
    const container = renderPanel({
      objective: {
        ...createObjective(status),
        blocker_reason: blocker,
      },
    });

    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain(`阻塞原因：${blocker}`);
    expect(
      container.querySelector('[data-testid="managed-objective-continue"]'),
    ).toBeNull();
  });

  it("应支持从 paused 恢复目标", async () => {
    const objective = createObjective("paused");
    updateAgentRuntimeObjectiveStatusMock.mockResolvedValue(
      createObjective("active"),
    );
    const container = renderPanel({ objective });
    const resumeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("恢复"),
    );

    await clickButton(resumeButton ?? null);

    expect(updateAgentRuntimeObjectiveStatusMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      status: "active",
    });
  });
});
