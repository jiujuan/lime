import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import { CodingWorkbenchOutputPanel } from "./CodingWorkbenchOutputPanel";

vi.mock("react-i18next", async () => {
  const agentZhCN = (await import("@/i18n/resources/zh-CN/agent.json"))
    .default as Record<string, string>;

  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const template = agentZhCN[key] ?? key;
        return template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
          String(options?.[name.trim()] ?? ""),
        );
      },
    }),
  };
});

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

function createCodingView(
  overrides: Partial<CodingWorkbenchView> = {},
): CodingWorkbenchView {
  return {
    runtime: { status: "running" },
    mainObject: {
      id: "turn-1",
      title: "Coding Workbench",
      status: "running",
      activeCommandId: "command-1",
      activeTestRunId: "test-1",
    },
    files: [],
    changes: [],
    patches: [],
    commands: [
      {
        commandId: "command-1",
        status: "running",
        title: "npm test",
        command: "npm test",
        cwd: "app",
        outputRefs: ["output://command-1"],
        preview: "running tests",
        sourceEventIds: ["event-command-1"],
      },
    ],
    tests: [
      {
        testRunId: "test-1",
        status: "running",
        title: "unit",
        suite: "unit",
        commandId: "command-1",
        passed: 3,
        failed: 0,
        outputRefs: [],
        sourceEventIds: ["event-test-1"],
      },
    ],
    actions: [
      {
        id: "event-action-1",
        actionId: "action-1",
        source: {
          id: "event-action-1",
          kind: "action",
          status: "blocked",
          eventClass: "action.required",
          title: "确认执行命令",
          actionId: "action-1",
          createdAt: "2026-06-13T00:00:00.000Z",
        },
        surface: "human-action",
        title: "确认执行命令",
        status: "blocked",
        displayStatusKey: "agent.status.actionRequired",
        resolved: false,
        actionKind: "approval",
        targetModule: "coding-workbench",
      },
    ],
    artifacts: [],
    evidence: [],
    diagnostics: [
      {
        id: "diagnostic-1",
        sourceEventId: "event-command-1",
        title: "命令失败",
        detail: "exit=1",
        status: "failed",
      },
    ],
    ui: {
      preferredTab: "outputs",
      stale: false,
    },
    ...overrides,
  };
}

function renderPanel(codingView = createCodingView()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CodingWorkbenchOutputPanel codingView={codingView} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("CodingWorkbenchOutputPanel", () => {
  it("应从 CodingWorkbenchView 渲染命令、测试和待确认动作", () => {
    const container = renderPanel();

    expect(
      container.querySelector('[data-testid="coding-workbench-command"]')
        ?.textContent,
    ).toContain("npm test");
    expect(container.textContent).toContain("running tests");
    expect(
      container.querySelector('[data-testid="coding-workbench-test"]')
        ?.textContent,
    ).toContain("3 通过，0 失败");
    expect(
      container.querySelector('[data-testid="coding-workbench-action"]')
        ?.textContent,
    ).toContain("确认执行命令");
    expect(
      container.querySelector('[data-testid="coding-workbench-diagnostic"]')
        ?.textContent,
    ).toContain("命令失败");
  });

  it("没有 projection 输出时应渲染稳定空态", () => {
    const container = renderPanel(
      createCodingView({
        commands: [],
        tests: [],
        actions: [],
        diagnostics: [],
      }),
    );

    expect(
      container.querySelector('[data-testid="coding-workbench-output-projection"]')
        ?.textContent,
    ).toContain("本轮还没有可展示的输出。");
  });
});
