import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { LocalSkillInspection } from "@/lib/api/skills";

vi.mock("@/components/preview/MarkdownPreview", () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

import { SkillContentDialog } from "./SkillContentDialog";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function createInspection(
  overrides: Partial<LocalSkillInspection> = {},
): LocalSkillInspection {
  return {
    content: "# 标题\n正文内容",
    license: "MIT",
    metadata: {
      lime_category: "social",
      lime_workflow_ref: "references/workflow.json",
    },
    allowedTools: ["web.search"],
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
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<ComponentProps<typeof SkillContentDialog>> = {},
): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SkillContentDialog
        skillName="test-skill"
        inspection={createInspection()}
        open={true}
        onOpenChange={() => {}}
        loading={false}
        error={null}
        {...overrides}
      />,
    );
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
});

describe("SkillContentDialog", () => {
  it("加载中时应显示加载提示", () => {
    renderDialog({ loading: true });
    expect(document.body.textContent).toContain("Checking Skill package...");
    expect(document.body.textContent).not.toContain("正在检查 Skill 包");
  });

  it("出错时应显示错误信息", () => {
    renderDialog({ error: "读取失败: 文件不存在" });
    expect(document.body.textContent).toContain("读取失败: 文件不存在");
  });

  it("有检查结果时应渲染标准状态、元数据和 markdown 文本", () => {
    renderDialog();
    expect(document.body.textContent).toContain("Standard");
    expect(document.body.textContent).toContain("Validation errors");
    expect(document.body.textContent).toContain("Compat fields");
    expect(document.body.textContent).toContain("Allowed tools");
    expect(document.body.textContent).toContain("Metadata");
    expect(document.body.textContent).toContain("Original SKILL.md");
    expect(document.body.textContent).toContain("lime_category");
    expect(document.body.textContent).toContain("web.search");
    expect(document.body.textContent).toContain("标题");
    expect(document.body.textContent).toContain("正文内容");
    expect(document.body.textContent).not.toContain("元数据");
    expect(document.body.textContent).not.toContain("允许工具");

    const licenseTag = Array.from(document.body.querySelectorAll("span")).find(
      (element) => element.textContent?.includes("License:"),
    );
    expect(licenseTag).toBeTruthy();
    expect(licenseTag?.className).toContain("bg-slate-100");
    expect(licenseTag?.className).not.toContain("dark:bg-slate-800");
  });

  it("有校验错误时应显示待修复状态和错误明细", () => {
    renderDialog({
      inspection: createInspection({
        standardCompliance: {
          isStandard: false,
          validationErrors: ["workflow 引用不存在"],
          deprecatedFields: ["steps-json"],
        },
      }),
    });

    expect(document.body.textContent).toContain("Needs fix");
    expect(document.body.textContent).toContain("Compat fields");
    expect(document.body.textContent).toContain("workflow 引用不存在");
    expect(document.body.textContent).toContain("steps-json");
  });

  it("空检查结果应通过 agent namespace 渲染空态", () => {
    renderDialog({ inspection: null });
    expect(document.body.textContent).toContain(
      "No Skill inspection result yet",
    );
    expect(document.body.textContent).not.toContain("暂无 Skill 检查结果");
  });
});
