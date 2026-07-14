import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import type { ManagedObjective } from "@/lib/api/agentRuntime/sessionTypes";
import { InputbarObjectiveInlinePanel } from "./InputbarObjectiveInlinePanel";

const {
  clearAgentRuntimeObjectiveMock,
  continueAgentRuntimeObjectiveMock,
  getAgentRuntimeObjectiveMock,
  setAgentRuntimeObjectiveMock,
  toastMock,
  updateAgentRuntimeObjectiveStatusMock,
} = vi.hoisted(() => ({
  clearAgentRuntimeObjectiveMock: vi.fn(),
  continueAgentRuntimeObjectiveMock: vi.fn(),
  getAgentRuntimeObjectiveMock: vi.fn(),
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

vi.mock("@/lib/api/agentRuntime/objectiveClient", () => ({
  clearAgentRuntimeObjective: clearAgentRuntimeObjectiveMock,
  continueAgentRuntimeObjective: continueAgentRuntimeObjectiveMock,
  getAgentRuntimeObjective: getAgentRuntimeObjectiveMock,
  setAgentRuntimeObjective: setAgentRuntimeObjectiveMock,
  updateAgentRuntimeObjectiveStatus: updateAgentRuntimeObjectiveStatusMock,
}));

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
}

const mountedPanels: MountedPanel[] = [];

function createObjective(
  status: ManagedObjective["status"] = "blocked",
): ManagedObjective {
  return {
    objective_id: "objective-1",
    workspace_id: "workspace-1",
    owner_kind: "agent_session",
    owner_id: "session-1",
    objective_text: "整理今天的国际新闻",
    success_criteria: ["形成三条摘要"],
    status,
    budget_policy: null,
    risk_policy: null,
    approval_policy: null,
    continuation_policy: null,
    last_audit_summary: null,
    last_evidence_pack_ref: null,
    last_artifact_refs: [],
    blocker_reason: status === "blocked" ? "等待用户补充更新要求" : null,
    created_at: "2026-06-17T00:00:00Z",
    updated_at: new Date(Date.now() - 25_000).toISOString(),
  };
}

async function renderPanel(props: {
  objective?: ManagedObjective | null;
  onObjectiveLoaded?: (objective: ManagedObjective | null) => void;
} = {}) {
  getAgentRuntimeObjectiveMock.mockResolvedValue(props.objective ?? null);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <InputbarObjectiveInlinePanel
        sessionId="session-1"
        workspaceId="workspace-1"
        onObjectiveLoaded={props.onObjectiveLoaded}
      />,
    );
    await Promise.resolve();
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
  continueAgentRuntimeObjectiveMock.mockReset();
  getAgentRuntimeObjectiveMock.mockReset();
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
  document.body
    .querySelectorAll('[data-testid="modal-overlay"]')
    .forEach((node) => node.remove());
});

describe("InputbarObjectiveInlinePanel", () => {
  it("没有已保存目标时不应在输入区展开大表单", async () => {
    const onObjectiveLoaded = vi.fn();
    const container = await renderPanel({ onObjectiveLoaded });

    expect(getAgentRuntimeObjectiveMock).toHaveBeenCalledWith("session-1");
    expect(onObjectiveLoaded).toHaveBeenCalledWith(null);
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-panel']"),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("会话目标");
    expect(document.body.textContent).not.toContain("设为当前目标");
  });

  it("已有目标时应显示紧凑目标条并支持弹窗编辑", async () => {
    const nextObjective = {
      ...createObjective("active"),
      objective_text: "整理今天的国际新闻并更新摘要",
    };
    setAgentRuntimeObjectiveMock.mockResolvedValue(nextObjective);
    const container = await renderPanel({ objective: createObjective() });

    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-panel']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-status']")
        ?.textContent,
    ).toContain("目标受阻");
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-text']")
        ?.textContent,
    ).toContain("整理今天的国际新闻");

    await clickButton(
      container.querySelector("[data-testid='inputbar-objective-inline-edit']"),
    );

    const dialogInput = document.body.querySelector<HTMLTextAreaElement>(
      "[data-testid='inputbar-objective-dialog-objective-input']",
    );
    expect(dialogInput?.value).toBe("整理今天的国际新闻");
    expect(
      document.body.querySelector(
        "[data-testid='inputbar-objective-dialog-criteria-input']",
      ),
    ).toBeNull();
    setTextareaValue(dialogInput, "整理今天的国际新闻并更新摘要");
    await clickButton(
      document.body.querySelector("[data-testid='inputbar-objective-dialog-save']"),
    );

    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      objectiveText: "整理今天的国际新闻并更新摘要",
      successCriteria: ["形成三条摘要"],
    });
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-text']")
        ?.textContent,
    ).toContain("更新摘要");
  });

  it("应支持继续和清除目标", async () => {
    continueAgentRuntimeObjectiveMock.mockResolvedValue({
      submitted: true,
      queued_turn_id: "queued-objective-1",
      objective: createObjective("active"),
    });
    const container = await renderPanel({ objective: createObjective("active") });

    await clickButton(
      container.querySelector(
        "[data-testid='inputbar-objective-inline-continue']",
      ),
    );
    expect(continueAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });

    await clickButton(
      container.querySelector("[data-testid='inputbar-objective-inline-clear']"),
    );
    expect(clearAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-panel']"),
    ).toBeNull();
  });

  it("暂停目标应显示暂停目标状态并支持恢复", async () => {
    const resumedObjective = createObjective("active");
    updateAgentRuntimeObjectiveStatusMock.mockResolvedValue(resumedObjective);
    const container = await renderPanel({ objective: createObjective("paused") });

    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-status']")
        ?.textContent,
    ).toContain("暂停目标");
    expect(
      container.querySelector("[data-testid='inputbar-objective-inline-resume']"),
    ).toBeTruthy();

    await clickButton(
      container.querySelector("[data-testid='inputbar-objective-inline-resume']"),
    );

    expect(updateAgentRuntimeObjectiveStatusMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      status: "active",
    });
  });
});
