import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceServiceSkillExecutionCardRuntime } from "./useWorkspaceServiceSkillExecutionCardRuntime";

type HookProps = Parameters<
  typeof useWorkspaceServiceSkillExecutionCardRuntime
>[0];

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createDefaultProps(): HookProps {
  return {
    onOpenBrowserRuntime: vi.fn(),
    onOpenResultFile: vi.fn(),
    onOpenSavedSiteContent: vi.fn(),
    state: {
      phase: "blocked",
      adapterName: "github/search",
      skillTitle: "GitHub 仓库线索检索",
      message: "当前没有检测到已附着到真实浏览器的 github.com 页面。",
      reportHint: "请先去浏览器工作台连接真实浏览器。",
    },
  };
}

function renderHook(props?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const mergedProps = {
    ...createDefaultProps(),
    ...props,
  };

  function Probe(currentProps: HookProps) {
    const runtime = useWorkspaceServiceSkillExecutionCardRuntime(currentProps);
    return <>{runtime.card}</>;
  }

  act(() => {
    root.render(<Probe {...mergedProps} />);
  });
  mountedRoots.push({ root, container });

  return {
    container,
    props: mergedProps,
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("useWorkspaceServiceSkillExecutionCardRuntime", () => {
  it("没有执行状态时不渲染卡片", () => {
    const { container } = renderHook({
      state: null,
    });

    expect(
      container.querySelector("[data-testid='service-skill-execution-card']"),
    ).toBeNull();
  });

  it("阻断态卡片应保留浏览器工作台入口", () => {
    const { container, props } = renderHook();
    const button = container.querySelector(
      "[data-testid='service-skill-execution-open-browser-runtime']",
    ) as HTMLButtonElement | null;

    expect(button).toBeTruthy();
    act(() => {
      button?.click();
    });

    expect(props.onOpenBrowserRuntime).toHaveBeenCalledTimes(1);
  });

  it("成功态卡片只保留结果文件入口，不再注入浏览器准备动作", () => {
    const { container, props } = renderHook({
      preferredResultFileTarget: {
        relativePath: "exports/social-article/google-cloud/index.md",
        title: "index.md",
      },
      state: {
        phase: "success",
        adapterName: "x/article-export",
        skillTitle: "X 文章转存",
        message: "站点技能已完成，后续技能包已落盘",
        result: {
          ok: true,
          adapter: "x/article-export",
          domain: "x.com",
          profile_key: "attached-x",
          entry_url: "https://x.com/example/article/1",
          saved_content: {
            content_id: "content-article-1",
            project_id: "project-article-1",
            title: "文章导出",
            markdown_relative_path: "exports/x-article-export/index.md",
          },
        },
      },
    });
    const browserButton = container.querySelector(
      "[data-testid='service-skill-execution-open-browser-runtime']",
    );
    const resultButton = container.querySelector(
      "[data-testid='service-skill-execution-open-saved-content']",
    ) as HTMLButtonElement | null;

    expect(browserButton).toBeNull();
    expect(resultButton).toBeTruthy();
    act(() => {
      resultButton?.click();
    });

    expect(props.onOpenBrowserRuntime).not.toHaveBeenCalled();
    expect(props.onOpenResultFile).toHaveBeenCalledWith(
      "exports/social-article/google-cloud/index.md",
    );
  });
});
