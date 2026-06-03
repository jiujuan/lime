import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { TeamWorkbenchSummaryPanel } from "./TeamWorkbenchSummaryPanel";
import { clearAgentUiProjectionEvents } from "../projection/conversationProjectionStore";

const teamWorkbenchSummaryPanelMocks = vi.hoisted(() => ({
    mockExecutionRunList: vi.fn(),
    mockGetAgentRuntimeSession: vi.fn(),
}));

export const { mockExecutionRunList, mockGetAgentRuntimeSession } =
  teamWorkbenchSummaryPanelMocks;

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    getAgentRuntimeSession:
      teamWorkbenchSummaryPanelMocks.mockGetAgentRuntimeSession,
  };
});

vi.mock("@/lib/api/executionRun", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/executionRun")>(
    "@/lib/api/executionRun",
  );
  return {
    ...actual,
    executionRunList: teamWorkbenchSummaryPanelMocks.mockExecutionRunList,
  };
});

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  mockExecutionRunList.mockResolvedValue([]);
});

afterEach(() => {
  mockExecutionRunList.mockReset();
  mockGetAgentRuntimeSession.mockReset();
  act(() => {
    clearAgentUiProjectionEvents();
  });
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
});

export function renderPanel(
  props: Partial<Parameters<typeof TeamWorkbenchSummaryPanel>[0]> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TeamWorkbenchSummaryPanel
        currentSessionQueuedTurnCount={0}
        childSubagentSessions={[]}
        selectedTeamRoles={[]}
        liveRuntimeBySessionId={{}}
        liveActivityBySessionId={{}}
        {...props}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

export function openTechnicalDetails(container: HTMLElement) {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-testid="team-workbench-technical-details-toggle"]',
  );
  expect(toggle).not.toBeNull();
  act(() => {
    toggle?.click();
  });
}
