import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENED_PROJECT_IDS_KEY,
  saveOpenedProjectIds,
} from "./agentProjectStorage";
import {
  type OpenedProjectSummary,
  useOpenedProjectSummaries,
} from "./useOpenedProjectSummaries";

const mockGetProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/project", () => ({
  getProject: mockGetProject,
}));

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderHookProbe(
  onValue: (value: OpenedProjectSummary[]) => void,
  currentProject?: OpenedProjectSummary | null,
  options?: Parameters<typeof useOpenedProjectSummaries>[1],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const value = useOpenedProjectSummaries(currentProject, options);
    useEffect(() => {
      onValue(value);
    }, [value]);
    return null;
  }

  mounted.push({ container, root });
  act(() => {
    root.render(<Probe />);
  });
}

async function flushEffects(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useOpenedProjectSummaries", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    while (mounted.length > 0) {
      const target = mounted.pop();
      if (!target) {
        break;
      }
      act(() => {
        target.root.unmount();
      });
      target.container.remove();
    }
    window.localStorage.clear();
  });

  it("禁用时不应解析历史打开项目", async () => {
    let latest: OpenedProjectSummary[] = [];
    saveOpenedProjectIds(["project-old"]);

    renderHookProbe(
      (value) => {
        latest = value;
      },
      {
        id: "project-current",
        name: "当前项目",
        rootPath: "/workspace/current",
      },
      { enabled: false },
    );
    await flushEffects();

    expect(mockGetProject).not.toHaveBeenCalled();
    expect(latest).toEqual([
      {
        id: "project-current",
        name: "当前项目",
        rootPath: "/workspace/current",
        isFavorite: false,
      },
    ]);
    expect(window.localStorage.getItem(OPENED_PROJECT_IDS_KEY)).toBe(
      JSON.stringify(["project-old"]),
    );
  });

  it("启用时应解析历史打开项目", async () => {
    let latest: OpenedProjectSummary[] = [];
    saveOpenedProjectIds(["project-old"]);
    mockGetProject.mockResolvedValue({
      id: "project-old",
      name: "历史项目",
      rootPath: "/workspace/old",
      isFavorite: true,
    });

    renderHookProbe(
      (value) => {
        latest = value;
      },
      {
        id: "project-current",
        name: "当前项目",
        rootPath: "/workspace/current",
      },
    );
    await flushEffects();

    expect(mockGetProject).toHaveBeenCalledWith("project-old");
    expect(latest).toContainEqual({
      id: "project-old",
      name: "历史项目",
      rootPath: "/workspace/old",
      isFavorite: true,
    });
  });
});
