import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AgentRuntimeStrip } from "./AgentRuntimeStrip";
import type { HarnessSessionState } from "../utils/harnessState";
import type { RuntimeToolAvailability } from "../utils/runtimeToolAvailability";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const DEFAULT_RUNTIME_TOOL_AVAILABILITY: RuntimeToolAvailability = {
  source: "runtime_tools",
  known: true,
  agentInitialized: true,
  availableToolCount: 4,
  webSearch: false,
  subagentCore: false,
  subagentTeamTools: false,
  subagentRuntime: false,
  taskRuntime: false,
  missingSubagentCoreTools: ["Agent", "SendMessage"],
  missingSubagentTeamTools: ["TeamCreate", "TeamDelete", "ListPeers"],
  missingTaskTools: [
    "TaskCreate",
    "TaskGet",
    "TaskList",
    "TaskUpdate",
    "TaskOutput",
    "TaskStop",
  ],
};

const CODE_RUNTIME_TOOL_AVAILABILITY: RuntimeToolAvailability = {
  source: "runtime_tools",
  known: true,
  agentInitialized: true,
  availableToolCount: 12,
  webSearch: true,
  subagentCore: true,
  subagentTeamTools: true,
  subagentRuntime: true,
  taskRuntime: true,
  missingSubagentCoreTools: [],
  missingSubagentTeamTools: [],
  missingTaskTools: [],
};

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

function renderStrip(
  props: Partial<ComponentProps<typeof AgentRuntimeStrip>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AgentRuntimeStrip
        activeTheme="general"
        toolPreferences={{
          webSearch: true,
          thinking: true,
          task: true,
          subagent: true,
        }}
        runtimeToolAvailability={DEFAULT_RUNTIME_TOOL_AVAILABILITY}
        harnessState={createHarnessState()}
        {...props}
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
  await changeLimeLocale("en-US");
});

describe("AgentRuntimeStrip", () => {
  it("runtime tool surface 缺口应显示在运行时条上", () => {
    const container = renderStrip();

    expect(
      container.querySelector('[data-testid="agent-runtime-strip"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-runtime_surface"]',
      )?.textContent,
    ).toContain("Runtime 工具面 4 项");
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-task_runtime_gap"]',
      )?.textContent,
    ).toContain("任务工具缺 6");
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-subagent_runtime_gap"]',
      )?.textContent,
    ).toContain("任务拆分缺 5 个 current tools");
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-web_search_gap"]',
      )?.textContent,
    ).toContain("Runtime 未接通 WebSearch");
  });

  it("code_orchestrated 应显示编程底座运行态，而不是依赖 @代码 专用命令", () => {
    const container = renderStrip({
      executionRuntime: {
        session_id: "session-code",
        source: "session",
        execution_strategy: "code_orchestrated",
      },
      runtimeToolAvailability: CODE_RUNTIME_TOOL_AVAILABILITY,
      toolPreferences: {
        webSearch: true,
        thinking: true,
        task: true,
        subagent: true,
      },
    });

    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip"][data-runtime-kind="code_orchestrated"][data-execution-strategy="code_orchestrated"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-capability-code_tools"][data-capability-key="code_tools"][data-enabled="true"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_runtime_active"][data-status-key="code_runtime_active"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_tool_ready"][data-status-key="code_tool_ready"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_approval_ready"][data-status-key="code_approval_ready"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_outputs_empty"][data-status-key="code_outputs_empty"]',
      ),
    ).toBeTruthy();
  });

  it("编程底座应露出待确认与产物出口状态", () => {
    const container = renderStrip({
      executionRuntime: {
        session_id: "session-code",
        source: "session",
        execution_strategy: "code_orchestrated",
      },
      runtimeToolAvailability: CODE_RUNTIME_TOOL_AVAILABILITY,
      harnessState: createHarnessState({
        pendingApprovals: [
          {
            requestId: "approval-1",
            actionType: "tool_confirmation",
            toolName: "Edit",
          },
        ],
        outputSignals: [
          {
            id: "output-1",
            toolCallId: "tool-1",
            toolName: "Edit",
            title: "已修改文件",
            summary: "src/main.ts",
          },
        ],
      }),
    });

    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_approval_pending"]',
      )?.textContent,
    ).toContain("等待确认 1");
    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_outputs"]',
      )?.textContent,
    ).toContain("代码产物 1");
  });

  it("编程底座有文件快照时应露出文件变更审阅入口", () => {
    const onOpenFileCheckpoints = vi.fn();
    const container = renderStrip({
      executionRuntime: {
        session_id: "session-code",
        source: "session",
        execution_strategy: "code_orchestrated",
      },
      runtimeToolAvailability: CODE_RUNTIME_TOOL_AVAILABILITY,
      fileCheckpointSummary: {
        count: 2,
        latest_checkpoint: {
          checkpoint_id: "checkpoint-2",
          turn_id: "turn-1",
          path: "src/main.ts",
          source: "runtime",
          updated_at: "2026-05-26T10:00:00Z",
          validation_issue_count: 0,
        },
      },
      onOpenFileCheckpoints,
    });

    expect(
      container.querySelector(
        '[data-testid="agent-runtime-strip-status-code_file_changes"]',
      )?.textContent,
    ).toContain("文件变更 2");

    const reviewButton = container.querySelector(
      '[data-testid="agent-runtime-strip-open-file-checkpoints"]',
    ) as HTMLButtonElement | null;

    expect(reviewButton?.textContent).toContain("查看变更");
    act(() => {
      reviewButton?.click();
    });
    expect(onOpenFileCheckpoints).toHaveBeenCalledTimes(1);
  });
});
