import { act } from "react";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillExecutionDialog } from "./SkillExecutionDialog";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { SkillDetailInfo } from "@/lib/api/skill-execution";

const mockGetSkillDetail = vi.fn();
const mockUseSkillExecution = vi.fn();

vi.mock("@/lib/api/skill-execution", () => ({
  skillExecutionApi: {
    getSkillDetail: (...args: unknown[]) => mockGetSkillDetail(...args),
  },
}));

vi.mock("@/hooks/useSkillExecution", () => ({
  useSkillExecution: (...args: unknown[]) => mockUseSkillExecution(...args),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open?: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <footer>{children}</footer>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => (
    <label>{children}</label>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock("./WorkflowProgress", () => ({
  WorkflowProgress: () => <div data-testid="workflow-progress" />,
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderDialog() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SkillExecutionDialog
        skillName="demo-skill"
        open
        onOpenChange={() => undefined}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("SkillExecutionDialog", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("en-US");

    mockGetSkillDetail.mockReset();
    mockUseSkillExecution.mockReset();
    mockUseSkillExecution.mockReturnValue({
      currentStep: null,
      currentStepIndex: 0,
      error: null,
      execute: vi.fn(),
      isExecuting: false,
      progress: 0,
      totalSteps: 0,
    });
  });

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => mounted.root.unmount());
      mounted.container.remove();
    }
    await changeLimeLocale("zh-CN");
  });

  it("执行对话框 chrome 文案应走 agent namespace 英文资源", async () => {
    const detail: SkillDetailInfo = {
      argument_hint: "输入主题和目标",
      description: "",
      display_name: "演示 Skill",
      execution_mode: "workflow",
      has_workflow: true,
      markdown_content: "# Demo",
      name: "demo-skill",
      when_to_use: "需要复用这套流程时使用。",
      workflow_steps: [{ dependencies: [], id: "step-1", name: "第一步" }],
    };
    mockGetSkillDetail.mockResolvedValue(detail);

    const container = renderDialog();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("演示 Skill");
    expect(container.textContent).toContain("Workflow mode");
    expect(container.textContent).toContain("Includes workflow");
    expect(container.textContent).toContain("Hint: 输入主题和目标");
    expect(container.textContent).toContain("Input");
    expect(container.querySelector("textarea")?.placeholder).toBe(
      "Enter the content to process...",
    );
    expect(container.textContent).toContain("Provider");
    expect(container.textContent).toContain(
      "Leave blank to auto select based on Skill config and available credentials.",
    );
    expect(container.textContent).toContain("Progress");
    expect(container.textContent).toContain("Cancel");
    expect(container.textContent).toContain("Run");
    expect(container.textContent).not.toContain("工作流模式");
    expect(container.textContent).not.toContain("Provider 选择");
  });

  it("加载失败时应展示真实英文资源与运行时错误", async () => {
    mockGetSkillDetail.mockRejectedValue(new Error("network down"));

    const container = renderDialog();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Failed to load");
    expect(container.textContent).toContain("network down");
    expect(container.textContent).toContain("Close");
    expect(container.textContent).not.toContain("加载失败");
  });
});
