import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanvasSessionOverviewPanel } from "./CanvasSessionOverviewPanel";
import type { CanvasSessionOverviewActivity } from "./CanvasSessionOverviewPanel";
import { changeLimeLocale } from "@/i18n/createI18n";
import { formatDate } from "@/i18n/format";
import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import type { ActionRequired, AgentThreadTurn } from "../types";

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderPanel(props: {
  turns: AgentThreadTurn[];
  activityItems?: CanvasSessionOverviewActivity[];
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
      activityItems: [
        {
          id: "activity-command",
          title: "Preparing the result",
          summary: "Checking or preparing the result.",
          status: "in_progress",
          updatedAt: "2026-05-11T01:45:00.000Z",
          icon: "listChecks",
        },
      ],
      turns: [buildTurn()],
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Task progress");
    expect(text).toContain("Running");
    expect(text).toContain("Working on Preparing the result");
    expect(text).toContain("In progress 1");
    expect(text).toContain("Needs input 1");
    expect(text).toContain("Last updated");
    expect(text).toContain(expectedTime);
    expect(text).toContain("Recent progress");
    expect(text).toContain("Checking or preparing the result.");
    expect(text).toContain("Next step");
    expect(text).toContain("Waiting for confirmation");
    expect(text).toContain("Approve shell command?");
    expect(text).not.toContain("Session Process Index");
    expect(text).not.toContain("Current turn");
    expect(text).not.toContain("Execution timeline");
    expect(text).not.toContain("Queued messages");
    expect(text).not.toContain("exec_command");
    expect(text).not.toContain("turn-1");
    expect(text).not.toContain("request-1");
    expect(text).not.toContain("queue-1");
    expect(text).not.toContain("会话过程索引");
    expect(text).not.toContain("执行时间线");
    expect(text).not.toContain("排队消息");
  });

  it("summarizes Provider 402 errors with user-facing copy", () => {
    const container = renderPanel({
      activityItems: [
        {
          id: "activity-provider-error",
          title: "Provider blocked",
          summary:
            "The current model channel returned a billing or quota error",
          status: "failed",
          updatedAt: "2026-05-11T01:45:00.000Z",
          icon: "alertTriangle",
        },
      ],
      currentTurnId: "turn-1",
      turns: [
        buildTurn({
          status: "failed",
        }),
      ],
    });

    const text = container.textContent ?? "";

    expect(text).toContain(
      "The current model channel returned a billing or quota error",
    );
    expect(text).not.toContain("Agent provider execution failed");
    expect(text).not.toContain("Payment Required");
    expect(text).not.toContain("Insufficient Balance");
  });

  it("renders projected activity items without legacy thread items", () => {
    const container = renderPanel({
      activityItems: [
        {
          id: "coding-command-command-test",
          title: "npm test",
          summary: "running tests",
          status: "in_progress",
          icon: "listChecks",
        },
      ],
      currentTurnId: "turn-1",
      turns: [buildTurn()],
    });

    const text = container.textContent ?? "";

    expect(text).toContain("Task progress");
    expect(text).toContain("In progress 1");
    expect(text).toContain("npm test");
    expect(text).toContain("running tests");
  });
});
