import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import type { HarnessSessionState } from "../utils/harnessState";
import { GeneralWorkbenchDialogSection } from "./WorkspaceHarnessDialogs";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];
let originalScrollIntoView:
  | typeof HTMLElement.prototype.scrollIntoView
  | undefined;

function createHarnessState(
  overrides: Partial<HarnessSessionState> = {},
): HarnessSessionState {
  return {
    runtimeStatus: null,
    pendingApprovals: [],
    latestContextTrace: [],
    plan: {
      phase: "idle",
      items: [],
    },
    activity: {
      planning: 0,
      filesystem: 0,
      execution: 0,
      web: 0,
      skills: 0,
      delegation: 0,
    },
    delegatedTasks: [],
    outputSignals: [],
    activeFileWrites: [],
    recentFileEvents: [],
    hasSignals: false,
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<ComponentProps<typeof GeneralWorkbenchDialogSection>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <GeneralWorkbenchDialogSection
        enabled={true}
        open={true}
        onOpenChange={vi.fn()}
        activeTheme="general"
        toolPreferences={{
          webSearch: true,
          thinking: true,
          task: true,
          subagent: true,
        }}
        runtimeToolAvailability={null}
        isSending={false}
        executionRuntime={{
          session_id: "session-code",
          source: "session",
          execution_strategy: "code_orchestrated",
        }}
        isExecutionRuntimeActive={true}
        runtimeStatusTitle={null}
        selectedTeamRoleCount={0}
        harnessState={createHarnessState()}
        environment={{
          skillsCount: 0,
          skillNames: [],
          memorySignals: [],
          contextItemsCount: 0,
          activeContextCount: 0,
          contextItemNames: [],
          contextEnabled: true,
        }}
        diagnosticRuntimeContext={{
          sessionId: "session-code",
          workspaceId: "workspace-code",
          workingDir: "/tmp/workspace-code",
          providerType: "openai",
          model: "gpt-5.4",
          executionStrategy: "code_orchestrated",
          activeTheme: "default",
          selectedTeamLabel: null,
        }}
        threadRead={{
          thread_id: "session-code",
          file_checkpoint_summary: {
            count: 1,
            latest_checkpoint: {
              checkpoint_id: "checkpoint-code",
              turn_id: "turn-code",
              path: "src/components/ImageCard.test.tsx",
              source: "tool_result",
              updated_at: "2026-05-27T01:00:00.000Z",
              validation_issue_count: 0,
            },
          },
        }}
        {...overrides}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  await changeLimeLocale("zh-CN");
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
  if (originalScrollIntoView) {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
  vi.restoreAllMocks();
  await changeLimeLocale("en-US");
});

describe("WorkspaceHarnessDialogs", () => {
  it("code_orchestrated 工作台弹窗应展示编程导轨并可跳到权限区块", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderDialog({
      harnessState: createHarnessState({
        pendingApprovals: [
          {
            requestId: "approval-code-write",
            actionType: "tool_confirmation",
            toolName: "write_file",
            prompt: "确认写入",
            arguments: {
              filePath: "src/components/ImageCard.test.tsx",
            },
          },
        ],
        activeFileWrites: [
          {
            id: "write-code-test",
            path: "/tmp/workspace/src/components/ImageCard.test.tsx",
            displayName: "ImageCard.test.tsx",
            phase: "streaming",
            status: "streaming",
            source: "artifact_snapshot",
            updatedAt: new Date("2026-05-26T10:00:00.000Z"),
            preview: "it('keeps image cards after history switch', () => {})",
            latestChunk: "keeps image cards after history switch",
            content: "it('keeps image cards after history switch', () => {})",
          },
        ],
        outputSignals: [
          {
            id: "signal-code-test",
            toolCallId: "tool-code-test",
            toolName: "bash",
            title: "回归测试结果",
            summary: "vitest 已执行图片卡片历史切换回归测试。",
            preview: "1 test passed",
            content: "PASS ImageCard.test.tsx\n1 test passed",
            exitCode: 0,
          },
        ],
        recentFileEvents: [
          {
            id: "event-code-test",
            toolCallId: "tool-code-test",
            path: "/tmp/workspace/src/components/ImageCard.test.tsx",
            displayName: "ImageCard.test.tsx",
            kind: "code",
            action: "write",
            sourceToolName: "write_file",
            timestamp: new Date("2026-05-26T10:01:00.000Z"),
            preview: "新增图片卡片历史切换回归测试",
            clickable: true,
          },
        ],
      }),
    });

    const guide = document.body.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;
    const action = document.body.querySelector(
      '[data-testid="code-workbench-guide-primary-action"]',
    ) as HTMLButtonElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("approval");
    expect(guide?.textContent).toContain("编程工作台");
    expect(guide?.textContent).toContain("先处理权限确认");
    expect(guide?.textContent).toContain("确认 1");
    expect(guide?.textContent).toContain("写入 1");
    expect(guide?.textContent).toContain("输出 1");
    expect(guide?.textContent).toContain("变更 1/1");
    expect(document.body.textContent).toContain("代码审阅摘要");
    expect(document.body.textContent).toContain("文件变更 1");
    expect(document.body.textContent).toContain("测试输出 1");
    expect(document.body.textContent).toContain("快照 1");

    act(() => {
      action?.click();
    });

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("非 code_orchestrated 工作台弹窗不展示编程导轨", () => {
    renderDialog({
      executionRuntime: {
        session_id: "session-react",
        source: "session",
        execution_strategy: "react",
      },
      diagnosticRuntimeContext: {
        sessionId: "session-react",
        workspaceId: "workspace-react",
        workingDir: "/tmp/workspace-react",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    expect(
      document.body.querySelector('[data-testid="code-workbench-guide"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('[data-testid="code-review-summary-panel"]'),
    ).toBeNull();
  });

  it("英文界面下 code_orchestrated 弹窗应展示 agent namespace 编程导轨", async () => {
    await changeLimeLocale("en-US");

    renderDialog({
      harnessState: createHarnessState({
        recentFileEvents: [
          {
            id: "event-code-edit",
            toolCallId: "tool-code-edit",
            path: "/tmp/workspace/src/main.ts",
            displayName: "main.ts",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            timestamp: new Date("2026-05-26T10:01:00.000Z"),
            preview: "Update main entry",
            clickable: true,
          },
        ],
      }),
    });

    const guide = document.body.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("review");
    expect(guide?.textContent).toContain("Coding workbench");
    expect(guide?.textContent).toContain("File changes need review");
    expect(guide?.textContent).toContain("Review changes");
  });

  it("正在写入阶段的文件名不应被普通文件读取事件覆盖", () => {
    renderDialog({
      harnessState: createHarnessState({
        activeFileWrites: [
          {
            id: "write-code",
            path: "/tmp/workspace/src/real-change.ts",
            displayName: "real-change.ts",
            phase: "streaming",
            status: "streaming",
            source: "artifact_snapshot",
            updatedAt: new Date("2026-05-26T10:00:00.000Z"),
          },
        ],
        recentFileEvents: [
          {
            id: "event-read",
            toolCallId: "tool-read",
            path: "/tmp/workspace/README.md",
            displayName: "README.md",
            kind: "document",
            action: "read",
            sourceToolName: "read_file",
            timestamp: new Date("2026-05-26T10:01:00.000Z"),
            clickable: true,
          },
        ],
      }),
    });

    const guide = document.body.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("writing");
    expect(guide?.textContent).toContain("real-change.ts");
    expect(guide?.textContent).not.toContain("README.md");
  });

  it("没有真实文件快照时不应在导轨显示快照可回滚", async () => {
    await changeLimeLocale("zh-CN");

    renderDialog({
      threadRead: {
        thread_id: "session-code",
        file_checkpoint_summary: {
          count: 0,
          latest_checkpoint: null,
        },
      },
      harnessState: createHarnessState({
        recentFileEvents: [
          {
            id: "event-code-edit",
            toolCallId: "tool-code-edit",
            path: "/tmp/workspace/src/main.ts",
            displayName: "main.ts",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            timestamp: new Date("2026-05-26T10:01:00.000Z"),
            preview: "Update main entry",
            clickable: true,
          },
        ],
      }),
    });

    const guide = document.body.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("review");
    expect(guide?.textContent).toContain("文件变更待处理");
    expect(guide?.textContent).not.toContain("快照可回滚");
  });
});
