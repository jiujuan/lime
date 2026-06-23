import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFilesSurface } from "./WorkspaceFilesSurface";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const copy: Record<string, string> = {
        "agentChat.canvasWorkbench.tabs.files": "文件",
        "agentChat.fileChangesSummary.openFile": "打开文件",
      };
      return copy[key] ?? key;
    },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }
  >(({ children, variant: _variant, size: _size, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  )),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

function renderSurface(
  props?: Partial<React.ComponentProps<typeof WorkspaceFilesSurface>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkspaceFilesSurface
        target={{
          relativePath: "outputs/result.md",
          title: "result.md",
        }}
        onOpenResultFile={vi.fn()}
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

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

describe("WorkspaceFilesSurface", () => {
  it("应展示目标文件并通过打开按钮回调相对路径", () => {
    const onOpenResultFile = vi.fn();
    const container = renderSurface({ onOpenResultFile });

    expect(
      container.querySelector('[data-testid="workspace-files-surface"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="workspace-files-surface-path"]')
        ?.textContent,
    ).toBe("outputs/result.md");
    expect(container.textContent).toContain("result.md");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="workspace-files-surface-open"]',
        )
        ?.click();
    });

    expect(onOpenResultFile).toHaveBeenCalledWith("outputs/result.md");
  });

  it("缺少目标文件时应禁用打开按钮", () => {
    const container = renderSurface({
      target: null,
      onOpenResultFile: vi.fn(),
    });

    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="workspace-files-surface-open"]',
      )?.disabled,
    ).toBe(true);
  });
});
