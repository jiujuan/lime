import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanvasSessionOverviewPanel } from "./CanvasSessionOverviewPanel";
import { changeLimeLocale } from "@/i18n/createI18n";
import { formatDate } from "@/i18n/format";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import type {
  ActionRequired,
  AgentThreadItem,
  AgentThreadTurn,
} from "../types";

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderPanel(props: {
  turns: AgentThreadTurn[];
  threadItems: AgentThreadItem[];
  pendingActions?: ActionRequired[];
  queuedTurns?: QueuedTurnSnapshot[];
  currentTurnId?: string;
  focusedItemId?: string;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CanvasSessionOverviewPanel {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

function buildTurn(overrides?: Partial<AgentThreadTurn>): AgentThreadTurn {
  return {
    created_at: "2026-05-11T01:40:00.000Z",
    id: "turn-1",
    prompt_text: "Draft a global launch plan",
    started_at: "2026-05-11T01:40:00.000Z",
    status: "running",
    thread_id: "thread-1",
    updated_at: "2026-05-11T01:45:00.000Z",
    ...overrides,
  };
}

function buildCommandItem(
  overrides?: Partial<Extract<AgentThreadItem, { type: "command_execution" }>>,
): Extract<AgentThreadItem, { type: "command_execution" }> {
  return {
    command: "",
    cwd: "/tmp",
    id: "item-command",
    sequence: 1,
    started_at: "2026-05-11T01:41:00.000Z",
    status: "in_progress",
    thread_id: "thread-1",
    turn_id: "turn-1",
    type: "command_execution",
    updated_at: "2026-05-11T01:45:00.000Z",
    ...overrides,
  };
}

describe("CanvasSessionOverviewPanel", () => {
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
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    document.body.innerHTML = "";
    await changeLimeLocale("zh-CN");
  });

  it("uses agent namespace resources and locale-aware time/count formatting", () => {
    const expectedTime = formatDate("2026-05-11T01:45:00.000Z", {
      hour: "2-digit",
      locale: "en-US",
      minute: "2-digit",
    });
    const container = renderPanel({
      currentTurnId: "turn-1",
      focusedItemId: "item-command",
      pendingActions: [
        {
          actionType: "tool_confirmation",
          prompt: "Approve shell command?",
          requestId: "request-1",
        },
      ],
      queuedTurns: [
        {
          created_at: 1_762_000_000,
          image_count: 2,
          message_preview: "Generate another draft",
          message_text: "Generate another draft",
          position: 1,
          queued_turn_id: "queue-1",
        },
      ],
      threadItems: [buildCommandItem()],
      turns: [buildTurn()],
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Session Process Index");
    expect(text).toContain("Running");
    expect(text).toContain("Focused on exec_command");
    expect(text).toContain("Current turn: turn-1");
    expect(text).toContain("In progress 1");
    expect(text).toContain("Needs input 1");
    expect(text).toContain("Last updated");
    expect(text).toContain(expectedTime);
    expect(text).toContain("Execution timeline");
    expect(text).toContain("Command is running");
    expect(text).toContain("Pending interactions");
    expect(text).toContain("Waiting for confirmation");
    expect(text).toContain("Queued messages");
    expect(text).toContain("Queued 1");
    expect(text).toContain("2 image(s)");
    expect(text).not.toContain("会话过程索引");
    expect(text).not.toContain("执行时间线");
    expect(text).not.toContain("排队消息");
  });
});
