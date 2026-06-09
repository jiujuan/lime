import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capabilityDraftsApi } from "@/lib/api/capabilityDrafts";
import { CapabilityDraftPanel } from "./CapabilityDraftPanel";

vi.mock("@/lib/api/capabilityDrafts", () => ({
  capabilityDraftsApi: {
    list: vi.fn(),
    verify: vi.fn(),
    register: vi.fn(),
  },
}));

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function renderPanel(props?: Parameters<typeof CapabilityDraftPanel>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CapabilityDraftPanel {...props} />);
  });
  mountedRoots.push({ container, root });
  return container;
}

describe("CapabilityDraftPanel retired compat surface", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(capabilityDraftsApi.list).mockReset();
    vi.mocked(capabilityDraftsApi.verify).mockReset();
    vi.mocked(capabilityDraftsApi.register).mockReset();
  });

  afterEach(() => {
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
    vi.clearAllMocks();
  });

  it("退役面板不再触发 Capability Draft compat 命令", async () => {
    const onRegisteredSkillsChanged = vi.fn();

    const container = renderPanel({
      workspaceRoot: "/tmp/work",
      projectPending: false,
      projectError: "ignored",
      highlightedDraftId: "capdraft-1",
      onRegisteredSkillsChanged,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toBe("");
    expect(capabilityDraftsApi.list).not.toHaveBeenCalled();
    expect(capabilityDraftsApi.verify).not.toHaveBeenCalled();
    expect(capabilityDraftsApi.register).not.toHaveBeenCalled();
    expect(onRegisteredSkillsChanged).not.toHaveBeenCalled();
  });
});
