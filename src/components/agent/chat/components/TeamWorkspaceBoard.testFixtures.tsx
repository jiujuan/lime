import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import { TeamWorkspaceBoard } from "./TeamWorkspaceBoard";

const hoisted = vi.hoisted(() => ({
  mockGetAgentRuntimeSession: vi.fn(),
}));

export const mockGetAgentRuntimeSession = hoisted.mockGetAgentRuntimeSession;

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    getAgentRuntimeSession: hoisted.mockGetAgentRuntimeSession,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    onClick,
    type = "button",
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
    [key: string]: unknown;
  }) => (
    <button type={type} className={className} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  window.localStorage.clear();
  mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) =>
    createSessionDetail(sessionId),
  );
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  await changeLimeLocale("zh-CN");
  window.localStorage.clear();
  vi.clearAllMocks();
});

export function createSessionDetail(
  sessionId: string,
  overrides: Partial<AsterSessionDetail> = {},
): AsterSessionDetail {
  return {
    id: sessionId,
    created_at: 1_710_000_000,
    updated_at: 1_710_000_100,
    messages: [],
    items: [],
    ...overrides,
  };
}

export async function flushBoardEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

export async function renderBoard(
  props?: Partial<React.ComponentProps<typeof TeamWorkspaceBoard>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: React.ComponentProps<typeof TeamWorkspaceBoard> = {
    currentSessionId: "parent-1",
    currentSessionName: "主线程",
    childSubagentSessions: [],
  };

  await act(async () => {
    root.render(<TeamWorkspaceBoard {...defaultProps} {...props} />);
    await Promise.resolve();
  });
  await flushBoardEffects();

  mountedRoots.push({ root, container });
  return container;
}

export function getLaneMetrics(container: HTMLDivElement, laneId: string) {
  const lane = container.querySelector<HTMLElement>(
    `[data-testid="team-workspace-member-lane-${laneId}"]`,
  );
  expect(lane).toBeTruthy();

  return {
    lane,
    x: Number(lane?.getAttribute("data-lane-x") ?? "0"),
    y: Number(lane?.getAttribute("data-lane-y") ?? "0"),
    width: Number(lane?.getAttribute("data-lane-width") ?? "0"),
    height: Number(lane?.getAttribute("data-lane-height") ?? "0"),
  };
}

export function getViewportMetrics(container: HTMLDivElement) {
  const viewport = container.querySelector<HTMLElement>(
    '[data-testid="team-workspace-rail-list"]',
  );
  expect(viewport).toBeTruthy();

  return {
    viewport,
    x: Number(viewport?.getAttribute("data-viewport-x") ?? "0"),
    y: Number(viewport?.getAttribute("data-viewport-y") ?? "0"),
    zoom: Number(viewport?.getAttribute("data-viewport-zoom") ?? "0"),
  };
}

export async function dragMouse(
  target: Element,
  options: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  },
) {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: options.start.x,
        clientY: options.start.y,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: options.end.x,
        clientY: options.end.y,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        clientX: options.end.x,
        clientY: options.end.y,
      }),
    );
    await Promise.resolve();
  });
}

export async function pressKey(
  target: EventTarget,
  options: {
    key: string;
    code: string;
    type?: "keydown" | "keyup";
    shiftKey?: boolean;
  },
) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent(options.type ?? "keydown", {
        bubbles: true,
        key: options.key,
        code: options.code,
        shiftKey: options.shiftKey,
      }),
    );
    await Promise.resolve();
  });
}

export async function clickElement(target: Element | null) {
  expect(target).toBeTruthy();
  await act(async () => {
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

export async function expandLane(container: HTMLDivElement, laneId: string) {
  const lane = container.querySelector(
    `[data-testid="team-workspace-member-lane-${laneId}"]`,
  );
  await clickElement(lane);
  await flushBoardEffects();
  return lane as HTMLElement | null;
}

export async function unmountBoard(container: HTMLDivElement) {
  const mountedIndex = mountedRoots.findIndex(
    (mounted) => mounted.container === container,
  );
  if (mountedIndex < 0) {
    return;
  }

  const [mounted] = mountedRoots.splice(mountedIndex, 1);
  act(() => {
    mounted?.root.unmount();
  });
  mounted?.container.remove();
}
