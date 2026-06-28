import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkspaceConversationCodingViews } from "./workspaceConversationCodingViews";

vi.mock("@/lib/api/executionProcess", () => ({
  drainExecutionProcessOutput: vi.fn(async () => ({ deltas: [] })),
  interruptExecutionProcess: vi.fn(async () => ({ snapshot: {} })),
  readExecutionProcessStatus: vi.fn(async () => ({ snapshot: {} })),
  terminateExecutionProcess: vi.fn(async () => ({ snapshot: {} })),
  writeExecutionProcessStdin: vi.fn(async () => ({})),
}));

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

function t(key: string, options?: Record<string, unknown>): string {
  return key.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
    String(options?.[name.trim()] ?? ""),
  );
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

describe("buildWorkspaceConversationCodingViews", () => {
  it("进程控制成功后应刷新 session read model", async () => {
    const onRefreshSessionReadModel = vi.fn(async () => true);
    const views = buildWorkspaceConversationCodingViews({
      t: t as never,
      locale: "zh-CN",
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "运行测试",
          status: "running",
          started_at: "2026-06-24T10:00:00.000Z",
          created_at: "2026-06-24T10:00:00.000Z",
          updated_at: "2026-06-24T10:00:00.000Z",
        },
      ],
      currentTurnId: "turn-1",
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        commands: [
          {
            command_id: "command-1",
            status: "running",
            command: "npm test",
            process_id: "process-1",
            execution_process_status: "running",
            execution_process_control_status: "registered",
            stdin_writable: true,
          },
        ],
      },
      pendingActions: [],
      submittedActionsInFlight: [],
      queuedTurns: [],
      onRefreshSessionReadModel,
    });
    const panel = views.outputView?.renderPanel();
    if (!panel) throw new Error("output view should render");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });

    await act(async () => {
      root.render(panel);
    });

    const refresh = container.querySelector(
      'button[aria-label="刷新进程 process-1 状态"]',
    ) as HTMLButtonElement | null;
    expect(refresh).not.toBeNull();

    await act(async () => {
      refresh?.click();
    });

    const { readExecutionProcessStatus } =
      await import("@/lib/api/executionProcess");
    expect(readExecutionProcessStatus).toHaveBeenCalledWith("process-1");
    expect(onRefreshSessionReadModel).toHaveBeenCalledTimes(1);
  });

  it("stdin 写入成功后应刷新 session read model", async () => {
    const onRefreshSessionReadModel = vi.fn(async () => true);
    const views = buildWorkspaceConversationCodingViews({
      t: t as never,
      locale: "zh-CN",
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "打开 shell",
          status: "running",
          started_at: "2026-06-24T10:00:00.000Z",
          created_at: "2026-06-24T10:00:00.000Z",
          updated_at: "2026-06-24T10:00:00.000Z",
        },
      ],
      currentTurnId: "turn-1",
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        commands: [
          {
            command_id: "command-1",
            status: "running",
            command: "python manage.py shell",
            process_id: "process-1",
            execution_process_status: "running",
            execution_process_control_status: "registered",
            stdin_writable: true,
          },
        ],
      },
      pendingActions: [],
      submittedActionsInFlight: [],
      queuedTurns: [],
      onRefreshSessionReadModel,
    });
    const panel = views.outputView?.renderPanel();
    if (!panel) throw new Error("output view should render");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });

    await act(async () => {
      root.render(panel);
    });

    const input = container.querySelector(
      'input[aria-label="向进程 process-1 写入 stdin"]',
    ) as HTMLInputElement | null;
    const submit = container.querySelector(
      'button[aria-label="发送 stdin 到进程 process-1"]',
    ) as HTMLButtonElement | null;
    expect(input).not.toBeNull();
    expect(submit).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "exit()");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      submit?.click();
    });

    const { writeExecutionProcessStdin } =
      await import("@/lib/api/executionProcess");
    expect(writeExecutionProcessStdin).toHaveBeenCalledWith({
      processId: "process-1",
      data: "exit()\n",
    });
    expect(onRefreshSessionReadModel).toHaveBeenCalledTimes(1);
  });
});
