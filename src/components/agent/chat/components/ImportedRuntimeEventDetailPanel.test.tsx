import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportedRuntimeEventDetailPanel } from "./ImportedRuntimeEventDetailPanel";

const {
  mockReadConversationImportRuntimeEvents,
} = vi.hoisted(() => ({
  mockReadConversationImportRuntimeEvents: vi.fn(),
}));

vi.mock("@/lib/api/conversationImport", () => ({
  readConversationImportRuntimeEvents: mockReadConversationImportRuntimeEvents,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: interpolateTranslate,
  }),
}));

function interpolateTranslate(key: string, options?: Record<string, unknown>) {
  const template =
    typeof options?.defaultValue === "string" ? options.defaultValue : key;
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
    String(options?.[name.trim()] ?? ""),
  );
}

function createTranslateStub() {
  return interpolateTranslate;
}

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockReadConversationImportRuntimeEvents.mockReset();
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

function renderPanel(
  props: Partial<React.ComponentProps<typeof ImportedRuntimeEventDetailPanel>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ImportedRuntimeEventDetailPanel
        enabled={props.enabled ?? true}
        sessionId={props.sessionId ?? "session-imported"}
        t={props.t}
        pageSize={props.pageSize}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("ImportedRuntimeEventDetailPanel", () => {
  it("应在展开后读取并展示导入运行记录", async () => {
    mockReadConversationImportRuntimeEvents.mockResolvedValue({
      sessionId: "session-imported",
      offset: 0,
      limit: 50,
      totalEvents: 2,
      nextOffset: undefined,
      sourceRuntimeEvents: 120,
      materializedRuntimeEvents: 80,
      sidecarRuntimeEvents: 40,
      projection: {},
      events: [
        {
          sourceEventIndex: 80,
          turnIndex: 1,
          eventIndex: 2,
          eventType: "context_compaction.completed",
          payload: {
            sourceEventType: "context_compacted",
            stage: "completed",
            detail: "Context compacted before continuing.",
            sourcePath: "/Users/example/.codex/sessions/thread.jsonl",
          },
        },
        {
          sourceEventIndex: 81,
          turnIndex: 1,
          eventIndex: 3,
          eventType: "subagent.activity",
          payload: {
            sourceEventType: "sub_agent_activity",
            status: "completed",
            title: "agents/reviewer.md",
            summary: "Subagent finished imported review.",
            sessionId: "subagent-thread-1",
          },
        },
      ],
    });

    const container = renderPanel({
      enabled: true,
      sessionId: "session-imported",
      t: createTranslateStub(),
    });
    const toggle = container.querySelector(
      '[data-testid="imported-runtime-detail-toggle"]',
    ) as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(mockReadConversationImportRuntimeEvents).toHaveBeenCalledWith({
        sessionId: "session-imported",
        offset: 0,
        limit: 50,
      });
    });

    expect(
      container.querySelector('[data-testid="imported-runtime-detail-body"]'),
    ).toBeTruthy();
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="imported-runtime-detail-event"]'),
      ).not.toBeNull();
    });
    expect(container.textContent).toContain("已默认展示 80 / 120 条");
    expect(container.textContent).toContain("上下文压缩");
    expect(container.textContent).toContain("子任务活动");
    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("阶段");
    expect(container.textContent).toContain("agents/reviewer.md");
    expect(container.textContent).toContain("context compaction completed");
    expect(container.textContent).toContain("subagent activity");
    expect(container.textContent).toContain("Context compacted before continuing.");
    expect(container.textContent).toContain("Subagent finished imported review.");
    expect(container.textContent).not.toContain(".codex");
    expect(container.textContent).not.toContain("subagent-thread-1");
  });

  it("接口返回乱序时仍按来源事件序展示完整记录", async () => {
    mockReadConversationImportRuntimeEvents.mockResolvedValue({
      sessionId: "session-imported",
      offset: 0,
      limit: 50,
      totalEvents: 3,
      nextOffset: undefined,
      sourceRuntimeEvents: 3,
      materializedRuntimeEvents: 3,
      sidecarRuntimeEvents: 0,
      projection: {},
      events: [
        {
          sourceEventIndex: 12,
          turnIndex: 0,
          eventIndex: 3,
          eventType: "message.delta",
          payload: {
            sourceEventType: "exited_review_mode",
            text: "最后一句。",
          },
        },
        {
          sourceEventIndex: 10,
          turnIndex: 0,
          eventIndex: 1,
          eventType: "reasoning.completed",
          payload: {
            sourceEventType: "reasoning",
            text: "最先一句。",
          },
        },
        {
          sourceEventIndex: 11,
          turnIndex: 0,
          eventIndex: 2,
          eventType: "command.started",
          payload: {
            sourceEventType: "function_call",
            command: "npm test",
          },
        },
      ],
    });

    const container = renderPanel({
      enabled: true,
      sessionId: "session-imported",
      t: createTranslateStub(),
    });
    const toggle = container.querySelector(
      '[data-testid="imported-runtime-detail-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="imported-runtime-detail-event"]'),
      ).toHaveLength(3);
    });

    const cards = Array.from(
      container.querySelectorAll('[data-testid="imported-runtime-detail-event"]'),
    ).map((card) => card.textContent || "");
    expect(cards[0]).toContain("最先一句。");
    expect(cards[1]).toContain("npm test");
    expect(cards[2]).toContain("最后一句。");
  });
});
