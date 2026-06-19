import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportedRuntimeEventDetailPanel } from "./ImportedRuntimeEventDetailPanel";

const {
  mockReadConversationImportRuntimeEvents,
  mockUseTranslationT,
} = vi.hoisted(() => ({
  mockReadConversationImportRuntimeEvents: vi.fn(),
  mockUseTranslationT: vi.fn(),
}));

vi.mock("@/lib/api/conversationImport", () => ({
  readConversationImportRuntimeEvents: mockReadConversationImportRuntimeEvents,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockUseTranslationT,
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
  mockUseTranslationT.mockReset();
  mockUseTranslationT.mockImplementation(interpolateTranslate);
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
      limit: 10,
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
        limit: 10,
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
      limit: 10,
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

  it("标量 payload 摘要应使用本地化类型名", async () => {
    mockReadConversationImportRuntimeEvents.mockResolvedValue({
      sessionId: "session-imported",
      offset: 0,
      limit: 10,
      totalEvents: 1,
      nextOffset: undefined,
      sourceRuntimeEvents: 1,
      materializedRuntimeEvents: 1,
      sidecarRuntimeEvents: 0,
      projection: {},
      events: [
        {
          sourceEventIndex: 0,
          turnIndex: 0,
          eventIndex: 0,
          eventType: "message.delta",
          payload: "plain text payload",
        },
      ],
    });

    const container = renderPanel({
      enabled: true,
      sessionId: "session-imported",
      t: (key, options) => {
        if (
          key ===
          "generalWorkbench.taskRail.importedRuntime.payload.type.string"
        ) {
          return "Text";
        }
        return interpolateTranslate(key, options);
      },
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
        container.querySelector('[data-testid="imported-runtime-detail-event"]'),
      ).not.toBeNull();
    });

    expect(container.textContent).toContain("Text · 18");
    expect(container.textContent).not.toContain("string · 18");
  });

  it("未传入上层 t 时应使用组件内 agent namespace 翻译", async () => {
    mockUseTranslationT.mockImplementation((key, options) => {
      const translations: Record<string, string> = {
        "generalWorkbench.taskRail.importedRuntime.open": "View full record",
        "generalWorkbench.taskRail.importedRuntime.title": "Full run record",
        "generalWorkbench.taskRail.importedRuntime.payload.type.string": "Text",
      };
      return translations[key] ?? interpolateTranslate(key, options);
    });
    mockReadConversationImportRuntimeEvents.mockResolvedValue({
      sessionId: "session-imported",
      offset: 0,
      limit: 10,
      totalEvents: 1,
      nextOffset: undefined,
      sourceRuntimeEvents: 1,
      materializedRuntimeEvents: 1,
      sidecarRuntimeEvents: 0,
      projection: {},
      events: [
        {
          sourceEventIndex: 0,
          turnIndex: 0,
          eventIndex: 0,
          eventType: "message.delta",
          payload: "plain text payload",
        },
      ],
    });

    const container = renderPanel({
      enabled: true,
      sessionId: "session-imported",
    });
    const toggle = container.querySelector(
      '[data-testid="imported-runtime-detail-toggle"]',
    ) as HTMLButtonElement | null;

    expect(toggle?.textContent).toContain("View full record");
    expect(toggle?.textContent).not.toContain("查看完整记录");

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="imported-runtime-detail-event"]'),
      ).not.toBeNull();
    });

    expect(container.textContent).toContain("Text · 18");
    expect(container.textContent).not.toContain("文本 · 18");
  });
});
