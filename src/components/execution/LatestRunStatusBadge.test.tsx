import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { AgentRun } from "@/lib/api/executionRun";

const { mockExecutionRunList } = vi.hoisted(() => ({
  mockExecutionRunList: vi.fn(),
}));

vi.mock("@/lib/api/executionRun", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/executionRun")>();
  return {
    ...actual,
    executionRunList: mockExecutionRunList,
  };
});

import { LatestRunStatusBadge } from "./LatestRunStatusBadge";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildRun(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: "run-1",
    source: "automation",
    source_ref: null,
    session_id: null,
    status: "success",
    started_at: "2026-05-11T08:09:10.000Z",
    finished_at: null,
    duration_ms: null,
    error_code: null,
    error_message: null,
    metadata: null,
    created_at: "2026-05-11T08:09:10.000Z",
    updated_at: "2026-05-11T08:09:10.000Z",
    ...overrides,
  };
}

function renderBadge() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<LatestRunStatusBadge source="automation" pollMs={60_000} />);
  });

  mountedRoots.push({ root, container });
  return container;
}

async function flushEffects(times = 4) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  await changeLimeLocale("en-US");
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

  await changeLimeLocale("zh-CN");
  vi.clearAllMocks();
});

describe("LatestRunStatusBadge", () => {
  it("应通过 common namespace 渲染英文执行状态与时间标签", async () => {
    mockExecutionRunList.mockResolvedValue([
      buildRun({ status: "success" }),
      buildRun({ id: "run-2", source: "chat", status: "running" }),
    ]);

    const container = renderBadge();
    await flushEffects();

    const text = container.textContent ?? "";
    expect(text).toContain("Latest run");
    expect(text).toContain("Success");
    expect(text).toContain("Time:");
    expect(text).not.toContain("最近执行");
    expect(text).not.toContain("成功");
    expect(text).not.toContain("时间");
  });

  it("无执行记录时应通过 common namespace 渲染英文空状态", async () => {
    mockExecutionRunList.mockResolvedValue([]);

    const container = renderBadge();
    await flushEffects();

    const text = container.textContent ?? "";
    expect(text).toContain("Latest run: No records yet");
    expect(text).not.toContain("暂无记录");
  });
});
