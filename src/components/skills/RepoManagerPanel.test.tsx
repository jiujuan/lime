import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { SkillRepo } from "@/lib/api/skills";
import { RepoManagerPanel } from "./RepoManagerPanel";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderPanel(
  repos: SkillRepo[] = [],
  overrides: Partial<{
    onClose: () => void;
    onAddRepo: (repo: SkillRepo) => Promise<void>;
    onRemoveRepo: (owner: string, name: string) => Promise<void>;
    onRefresh: () => void;
  }> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const props = {
    repos,
    onClose: vi.fn(),
    onAddRepo: vi.fn().mockResolvedValue(undefined),
    onRemoveRepo: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn(),
    ...overrides,
  };

  act(() => {
    root.render(<RepoManagerPanel {...props} />);
  });

  mounted.push({ container, root });
  return { container, props };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(async () => {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) break;
    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }
  vi.restoreAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("RepoManagerPanel", () => {
  it("应通过 agent namespace 渲染英文仓库管理文案", () => {
    const { container } = renderPanel();

    const text = container.textContent ?? "";
    expect(text).toContain("Repository Manager");
    expect(text).toContain("Manage Skill repository sources");
    expect(text).toContain("Add a new repository");
    expect(text).toContain("Owner");
    expect(text).toContain("Repository name");
    expect(text).toContain("Branch (optional)");
    expect(text).toContain("Added repositories");
    expect(text).toContain("No repositories yet");
    expect(text).not.toContain("仓库管理");
    expect(text).not.toContain("添加新仓库");
  });

  it("应本地化仓库行、标题属性和表单校验反馈", async () => {
    const { container } = renderPanel([
      {
        owner: "lime",
        name: "skills",
        branch: "main",
        enabled: true,
      },
    ]);

    expect(container.textContent).toContain("lime/skills");
    expect(container.textContent).toContain("Branch: main");
    expect(
      container.querySelector("button[title='View on GitHub']"),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector("button[title='Remove']")).toBeInstanceOf(
      HTMLButtonElement,
    );

    await act(async () => {
      findButton(container, "Add repository").click();
    });

    expect(window.alert).toHaveBeenCalledWith(
      "Enter the repository owner and name",
    );
  });

  it("应提交裁剪后的仓库配置并本地化失败提示", async () => {
    const onAddRepo = vi.fn().mockRejectedValue(new Error("network down"));
    const { container } = renderPanel([], { onAddRepo });

    const [ownerInput, nameInput, branchInput] = Array.from(
      container.querySelectorAll("input"),
    ) as HTMLInputElement[];
    changeInput(ownerInput, " lime ");
    changeInput(nameInput, " skills ");
    changeInput(branchInput, " stable ");

    await act(async () => {
      findButton(container, "Add repository").click();
    });

    expect(onAddRepo).toHaveBeenCalledWith({
      owner: "lime",
      name: "skills",
      branch: "stable",
      enabled: true,
    });
    expect(window.alert).toHaveBeenCalledWith("Add failed: network down");
  });
});
