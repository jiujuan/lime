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
            stage: "completed",
            detail: "Context compacted before continuing.",
          },
        },
        {
          sourceEventIndex: 81,
          turnIndex: 1,
          eventIndex: 3,
          eventType: "subagent.activity",
          payload: {
            status: "completed",
            summary: "Subagent finished imported review.",
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
    expect(container.textContent).toContain("已默认展示 80 / 2 条");
    expect(container.textContent).toContain("context compaction completed");
    expect(container.textContent).toContain("subagent activity");
    expect(container.textContent).toContain("Context compacted before continuing.");
    expect(container.textContent).toContain("Subagent finished imported review.");
  });
});
