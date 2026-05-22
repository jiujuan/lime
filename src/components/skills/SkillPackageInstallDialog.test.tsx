import { act, type ReactNode } from "react";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { SkillPackageInstallDialog } from "./SkillPackageInstallDialog";

const mocks = vi.hoisted(() => ({
  inspectLocalSkillPackage: vi.fn(),
  installLocalSkillPackage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("@/lib/api/skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/skills")>();
  return {
    ...actual,
    skillsApi: {
      ...actual.skillsApi,
      inspectLocalSkillPackage: (...args: unknown[]) =>
        mocks.inspectLocalSkillPackage(...args),
      installLocalSkillPackage: (...args: unknown[]) =>
        mocks.installLocalSkillPackage(...args),
    },
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
    maxWidth?: string;
  }) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function createInspectionResult() {
  return {
    directory: "article-typesetting-master",
    inspection: {
      content:
        "---\nname: Article Typesetting\nversion: 2026.05\n---\n\n# Article Typesetting\n\nUse **strict layout rules** and keep `SKILL.md` readable.\n\n> Review before installing.\n\n1. Read the draft\n2. Format article drafts\n\n| Area | Output |\n| --- | --- |\n| Draft | Clean article |\n\n```ts\nconst enabled = true;\n```",
      metadata: {
        version: "2026.05",
      },
      allowedTools: [],
      resourceSummary: {
        hasScripts: false,
        hasReferences: true,
        hasAssets: false,
      },
      standardCompliance: {
        isStandard: true,
        validationErrors: [],
        deprecatedFields: [],
      },
    },
    files: [
      { path: "references", isDirectory: true, size: 0 },
      { path: "templates", isDirectory: true, size: 0 },
      { path: "SKILL.md", isDirectory: false, size: 128 },
      {
        path: "references/guide.md",
        isDirectory: false,
        size: 64,
        content: "# Guide\n\n- Follow the reference",
      },
    ],
  };
}

async function renderDialog(props?: {
  onOpenChange?: (open: boolean) => void;
  onInstalled?: (directory: string) => void | Promise<void>;
  sourcePath?: string;
  sourceName?: string;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenChange = props?.onOpenChange ?? vi.fn();
  const onInstalled = props?.onInstalled ?? vi.fn();

  await act(async () => {
    root.render(
      <SkillPackageInstallDialog
        open
        sourcePath={
          props?.sourcePath ??
          "/Users/demo/article-typesetting-master.skill"
        }
        sourceName={
          props?.sourceName ?? "article-typesetting-master.skill"
        }
        onOpenChange={onOpenChange}
        onInstalled={onInstalled}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedRoots.push({ container, root });
  return { container, onOpenChange, onInstalled };
}

function findButton(label: string) {
  return Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;
}

describe("SkillPackageInstallDialog", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("en-US");
    mocks.inspectLocalSkillPackage.mockReset();
    mocks.inspectLocalSkillPackage.mockResolvedValue(createInspectionResult());
    mocks.installLocalSkillPackage.mockReset();
    mocks.installLocalSkillPackage.mockResolvedValue({
      directory: "article-typesetting-master",
      inspection: createInspectionResult().inspection,
    });
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => mounted.root.unmount());
      mounted.container.remove();
    }
    await changeLimeLocale("zh-CN");
    vi.clearAllMocks();
  });

  it("打开后应检查本地 .skill 包并展示文件树与 SKILL.md 预览", async () => {
    const { container } = await renderDialog();

    expect(mocks.inspectLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skill",
      "lime",
    );
    expect(document.body.textContent).toContain(
      "Add “article-typesetting-master” to your library?",
    );
    expect(document.body.textContent).toContain("Package Files");
    expect(document.body.textContent).toContain("SKILL.md");
    expect(document.body.textContent).toContain("references");
    expect(document.body.textContent).toContain("templates");
    expect(document.body.textContent).toContain("Article Typesetting");
    expect(document.body.textContent).toContain("Add to library");
    expect(document.body.textContent).toContain("Close");
    expect(container.querySelector('[data-testid="skills-markdown-preview"]'))
      .toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe(
      "strict layout rules",
    );
    expect(container.querySelector("code")?.textContent).toContain("SKILL.md");
    expect(container.querySelector("blockquote")?.textContent).toContain(
      "Review before installing.",
    );
    expect(container.querySelector("ol")?.textContent).toContain(
      "Read the draft",
    );
    expect(container.querySelector("table")?.textContent).toContain(
      "Clean article",
    );
    expect(container.querySelector("pre")?.textContent).toContain(
      "const enabled = true;",
    );
    expect(document.body.textContent).not.toContain("version: 2026.05");
  });

  it("点击文件树中的其他 Markdown 文件时应切换预览内容", async () => {
    const { container } = await renderDialog();

    await act(async () => {
      findButton("guide.md")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="skills-markdown-preview"]'))
      .toBeTruthy();
    expect(document.body.textContent).toContain("Guide");
    expect(document.body.textContent).not.toContain("Article Typesetting");
  });

  it("确认安装后应调用安装命令并回调刷新 Skills", async () => {
    const onOpenChange = vi.fn();
    const onInstalled = vi.fn();
    await renderDialog({ onOpenChange, onInstalled });

    await act(async () => {
      findButton("Add to library")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.installLocalSkillPackage).toHaveBeenCalledWith(
      "/Users/demo/article-typesetting-master.skill",
      "lime",
    );
    expect(onInstalled).toHaveBeenCalledWith("article-typesetting-master");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Installed Skill: article-typesetting-master",
    );
  });

  it("关闭按钮应直接关闭安装弹窗", async () => {
    const onOpenChange = vi.fn();
    await renderDialog({ onOpenChange });

    await act(async () => {
      findButton("Close")?.click();
      await Promise.resolve();
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.installLocalSkillPackage).not.toHaveBeenCalled();
  });

  it("也应兼容 .skills 安装包名称并去掉后缀", async () => {
    mocks.inspectLocalSkillPackage.mockResolvedValueOnce({
      ...createInspectionResult(),
      directory: "article-typesetting-addon",
    });
    await renderDialog({
      sourcePath: "/Users/demo/article-typesetting-addon.skills",
      sourceName: "article-typesetting-addon.skills",
    });

    expect(document.body.textContent).toContain(
      "Add “article-typesetting-addon” to your library?",
    );
  });
});
