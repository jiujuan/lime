import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getKnowledgePack,
  importKnowledgeSource,
  listKnowledgePacks,
  updateKnowledgePackStatus,
  type KnowledgePackDetail,
  type KnowledgePackStatus,
} from "@/lib/api/knowledge";
import { changeLimeLocale } from "@/i18n/createI18n";
import { getDefaultProject, getProject } from "@/lib/api/project";
import type { KnowledgePageParams } from "@/types/page";
import { KnowledgePage } from "./KnowledgePage";

const {
  mockListKnowledgePacks,
  mockGetKnowledgePack,
  mockImportKnowledgeSource,
  mockCompileKnowledgePack,
  mockSetDefaultKnowledgePack,
  mockUpdateKnowledgePackStatus,
  mockResolveKnowledgeContext,
  mockGetDefaultProject,
  mockGetProject,
  mockGetProjectByRootPath,
} = vi.hoisted(() => ({
  mockListKnowledgePacks: vi.fn(),
  mockGetKnowledgePack: vi.fn(),
  mockImportKnowledgeSource: vi.fn(),
  mockCompileKnowledgePack: vi.fn(),
  mockSetDefaultKnowledgePack: vi.fn(),
  mockUpdateKnowledgePackStatus: vi.fn(),
  mockResolveKnowledgeContext: vi.fn(),
  mockGetDefaultProject: vi.fn(),
  mockGetProject: vi.fn(),
  mockGetProjectByRootPath: vi.fn(),
}));

vi.mock("@/lib/api/knowledge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/knowledge")>(
    "@/lib/api/knowledge",
  );

  return {
    ...actual,
    listKnowledgePacks: mockListKnowledgePacks,
    getKnowledgePack: mockGetKnowledgePack,
    importKnowledgeSource: mockImportKnowledgeSource,
    compileKnowledgePack: mockCompileKnowledgePack,
    setDefaultKnowledgePack: mockSetDefaultKnowledgePack,
    updateKnowledgePackStatus: mockUpdateKnowledgePackStatus,
    resolveKnowledgeContext: mockResolveKnowledgeContext,
  };
});

vi.mock("@/components/projects/ProjectSelector", () => ({
  ProjectSelector: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (projectId: string) => void;
    placeholder?: string;
  }) => (
    <button type="button" onClick={() => onChange("project-alpha")}>
      {value ? "切换项目" : placeholder || "选择项目"}
    </button>
  ),
}));

vi.mock("@/lib/api/project", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/project")>(
      "@/lib/api/project",
    );

  return {
    ...actual,
    getDefaultProject: mockGetDefaultProject,
    getProject: mockGetProject,
    getProjectByRootPath: mockGetProjectByRootPath,
  };
});

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildPackDetail(
  name = "founder-personal-ip",
  overrides?: {
    description?: string;
    type?: string;
    status?: KnowledgePackStatus;
    defaultForWorkspace?: boolean;
    trust?: string;
  },
): KnowledgePackDetail {
  const now = 1_712_345_678_900;
  const rootPath = `/tmp/project/.lime/knowledge/packs/${name}`;
  const isFounder = name === "founder-personal-ip";
  const description =
    overrides?.description ??
    (isFounder ? "创始人个人 IP 项目资料" : "金花黑茶品牌产品资料");
  const packType =
    overrides?.type ?? (isFounder ? "personal-ip" : "brand-product");
  const status = overrides?.status ?? "ready";

  return {
    metadata: {
      name,
      description,
      type: packType,
      status,
      version: "1.0.0",
      language: "zh-CN",
      license: null,
      maintainers: ["content-team"],
      scope: "workspace",
      trust:
        overrides?.trust ??
        (status === "ready" ? "user-confirmed" : "unreviewed"),
      grounding: "recommended",
    },
    rootPath,
    knowledgePath: `${rootPath}/KNOWLEDGE.md`,
    defaultForWorkspace: overrides?.defaultForWorkspace ?? status === "ready",
    updatedAt: now,
    sourceCount: 1,
    wikiCount: 1,
    compiledCount: 1,
    runCount: 1,
    preview: isFounder
      ? "用于个人介绍、短视频脚本、沙龙开场和商务话术。"
      : "发现 4 个待补充事实，2 条功效表达风险。",
    guide: isFounder
      ? "用于个人介绍、视频号脚本、商务开场、社群话术。知识正文只作为数据使用。"
      : "用于品牌产品介绍、渠道脚本和客服话术。功效表达必须待确认。",
    sources: [
      {
        relativePath: "sources/source.md",
        absolutePath: `${rootPath}/sources/source.md`,
        bytes: 128,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: isFounder
          ? "创始人访谈：深耕自媒体营销领域。"
          : "产品面向内容团队，禁止编造功效。",
      },
    ],
    wiki: [
      {
        relativePath: isFounder ? "wiki/profile.md" : "wiki/product.md",
        absolutePath: `${rootPath}/wiki/profile.md`,
        bytes: 256,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: "定位、故事、语气和边界。",
      },
    ],
    compiled: [
      {
        relativePath: `compiled/splits/${name}/应用指南.md`,
        absolutePath: `${rootPath}/compiled/splits/${name}/应用指南.md`,
        bytes: 512,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: "应用指南：事实、语气、故事素材和边界。",
      },
    ],
    runs: [
      {
        relativePath: "runs/compile-mock.json",
        absolutePath: `${rootPath}/runs/compile-mock.json`,
        bytes: 96,
        updatedAt: now,
        preview: '{"status":"completed"}',
      },
    ],
  };
}

function toSummary(pack: KnowledgePackDetail) {
  return {
    metadata: pack.metadata,
    rootPath: pack.rootPath,
    knowledgePath: pack.knowledgePath,
    defaultForWorkspace: pack.defaultForWorkspace,
    updatedAt: pack.updatedAt,
    sourceCount: pack.sourceCount,
    wikiCount: pack.wikiCount,
    compiledCount: pack.compiledCount,
    runCount: pack.runCount,
    preview: pack.preview,
  };
}

function buildListResponse(packs: KnowledgePackDetail[]) {
  return {
    workingDir: "/tmp/project",
    rootPath: "/tmp/project/.lime/knowledge/packs",
    packs: packs.map(toSummary),
  };
}

function renderPage(options?: {
  workingDir?: string;
  selectedPackName?: string;
  initialView?: "overview" | "import" | "detail" | "save" | "states";
  saveDraft?: KnowledgePageParams["saveDraft"];
  onNavigate?: (page: string, params?: unknown) => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <KnowledgePage
        onNavigate={options?.onNavigate}
        pageParams={{
          workingDir: options?.workingDir,
          selectedPackName: options?.selectedPackName,
          initialView: options?.initialView,
          saveDraft: options?.saveDraft,
        }}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

async function flushEffects(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function updateFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
) {
  expect(element).toBeTruthy();
  if (!element) {
    return;
  }

  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function clickButton(container: HTMLElement, label: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = (buttons.find((item) => item.textContent?.trim() === label) ??
    buttons.find((item) => item.textContent?.includes(label))) as
    | HTMLButtonElement
    | undefined;
  expect(button).toBeTruthy();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
  await flushEffects();
}

describe("KnowledgePage", () => {
  let readyPack: KnowledgePackDetail;
  let pendingPack: KnowledgePackDetail;

  beforeEach(async () => {
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
    vi.clearAllMocks();
    window.localStorage.clear();

    readyPack = buildPackDetail("founder-personal-ip", {
      status: "ready",
      defaultForWorkspace: true,
    });
    pendingPack = buildPackDetail("jinhua-dark-tea", {
      status: "needs-review",
      defaultForWorkspace: false,
    });

    mockListKnowledgePacks.mockResolvedValue(
      buildListResponse([readyPack, pendingPack]),
    );
    mockGetKnowledgePack.mockImplementation(
      (_workingDir: string, name: string) =>
        Promise.resolve(
          name === pendingPack.metadata.name ? pendingPack : readyPack,
        ),
    );
    mockImportKnowledgeSource.mockResolvedValue({
      pack: pendingPack,
      source: pendingPack.sources[0],
    });
    mockCompileKnowledgePack.mockResolvedValue({
      pack: pendingPack,
      selectedSourceCount: 1,
      compiledView: pendingPack.compiled[0],
      run: pendingPack.runs[0],
      warnings: [],
    });
    mockSetDefaultKnowledgePack.mockResolvedValue({
      defaultPackName: readyPack.metadata.name,
      defaultMarkerPath: "/tmp/project/.lime/knowledge/default-pack.txt",
    });
    mockUpdateKnowledgePackStatus.mockImplementation(() => {
      const confirmed = buildPackDetail("jinhua-dark-tea", {
        status: "ready",
        defaultForWorkspace: false,
      });
      return Promise.resolve({
        pack: confirmed,
        previousStatus: "needs-review",
        clearedDefault: false,
      });
    });
    mockResolveKnowledgeContext.mockResolvedValue({
      packName: readyPack.metadata.name,
      status: "ready",
      grounding: "recommended",
      selectedViews: [],
      selectedFiles: [],
      sourceAnchors: [],
      warnings: [],
      missing: [],
      tokenEstimate: 120,
      fencedContext: "",
    });
    mockGetProjectByRootPath.mockResolvedValue(null);
    mockGetDefaultProject.mockResolvedValue(null);
    mockGetProject.mockResolvedValue({
      id: "project-alpha",
      name: "金花黑茶项目",
      workspaceType: "general",
      rootPath: "/tmp/project-alpha",
      isDefault: true,
      createdAt: 1_712_345_678_900,
      updatedAt: 1_712_345_678_900,
      isFavorite: false,
      isArchived: false,
      tags: [],
    });
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) break;
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    window.electronAPI = undefined;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("应按 PRD v3 展示项目资料首页和普通用户词表", async () => {
    const container = renderPage({
      workingDir: "/tmp/project",
      selectedPackName: "founder-personal-ip",
    });
    await flushEffects();

    expect(listKnowledgePacks).toHaveBeenCalledWith({
      workingDir: "/tmp/project",
    });
    expect(getKnowledgePack).toHaveBeenCalledWith(
      "/tmp/project",
      "founder-personal-ip",
    );
    expect(container.textContent).toContain("让 Lime 记住这个项目");
    const rootSurface = container.querySelector("main");
    expect(rootSurface?.className).toContain("lime-workbench-theme-scope");
    expect(rootSurface?.className).toContain(
      "bg-[image:var(--lime-stage-surface)]",
    );
    expect(container.textContent).toContain("可用于创作");
    expect(container.textContent).toContain("待确认");
    expect(container.textContent).toContain("需要补充");
    expect(container.textContent).toContain("建议本轮使用");
    expect(container.textContent).toContain("项目资料清单");
    expect(container.textContent).toContain("接下来你可以");
    expect(container.textContent).toContain("整理新资料");
    expect(container.textContent).toContain("确认待审资料");
    expect(container.textContent).toContain("选择创作时使用的资料");
    expect(container.textContent).toContain("创始人个人 IP 项目资料");
    expect(container.textContent).toContain("金花黑茶品牌产品资料");
    expect(container.textContent).toContain("已可用");
    expect(container.textContent).toContain("去确认");
    const defaultText = container.textContent ?? "";
    for (const forbidden of [
      "Builder Skill",
      "Knowledge Pack",
      "Agent Knowledge",
      "Context Run",
      "Resolver",
      "runtime",
      "profile",
      "documents",
      "sources",
      "runs",
      "persona",
      "data",
      "wrapper",
      "selected sections",
      "compile",
      ".lime/knowledge",
      "/tmp/project",
    ]) {
      expect(defaultText).not.toContain(forbidden);
    }
  });

  it("空资料库应引导整理新资料而不暴露工程概念", async () => {
    mockListKnowledgePacks.mockResolvedValueOnce(buildListResponse([]));
    const container = renderPage({ workingDir: "/tmp/project" });
    await flushEffects();

    expect(container.textContent).toContain("这个项目还没有资料");
    expect(container.textContent).toContain("先上传访谈、介绍、规则或复盘");
    expect(container.textContent).toContain("整理新资料");
    expect(container.textContent).not.toContain("Knowledge Pack");
    expect(container.textContent).not.toContain("Builder Skill");
    expect(container.textContent).not.toContain(".lime/knowledge");
  });

  it("状态说明页应通过项目选择器切换资料库目录，而不是要求普通用户粘贴路径", async () => {
    const container = renderPage({ workingDir: "/tmp/project" });
    await flushEffects();

    await clickButton(container, "状态说明");
    await clickButton(container, "默认项目");

    expect(getProject).toHaveBeenCalledWith("project-alpha");
    expect(listKnowledgePacks).toHaveBeenCalledWith({
      workingDir: "/tmp/project-alpha",
    });
    expect(container.textContent).not.toContain("粘贴当前项目位置");
    expect(container.textContent).not.toContain("项目位置");
  });

  it("没有显式项目时应忽略临时 smoke 目录并恢复默认项目", async () => {
    window.localStorage.setItem(
      "lime.knowledge.working-dir",
      "/tmp/lime-knowledge-smoke-current",
    );
    mockGetDefaultProject.mockResolvedValueOnce({
      id: "project-default",
      name: "默认项目",
      workspaceType: "general",
      rootPath: "/Users/demo/Documents/lime-default",
      isDefault: true,
      createdAt: 1_712_345_678_900,
      updatedAt: 1_712_345_678_900,
      isFavorite: false,
      isArchived: false,
      tags: [],
    });

    renderPage();
    await flushEffects(6);

    expect(getDefaultProject).toHaveBeenCalled();
    expect(listKnowledgePacks).toHaveBeenCalledWith({
      workingDir: "/Users/demo/Documents/lime-default",
    });
    expect(listKnowledgePacks).not.toHaveBeenCalledWith({
      workingDir: "/tmp/lime-knowledge-smoke-current",
    });
  });

  it("安装版不依赖旧资料详情命令时仍应通过 current API 读取详情", async () => {
    window.electronAPI = {
      invoke: vi.fn(),
      supportsCommand: () => false,
      listen: vi.fn(),
      emit: vi.fn(),
    };

    renderPage({
      workingDir: "/tmp/project",
      selectedPackName: "founder-personal-ip",
    });
    await flushEffects();

    expect(listKnowledgePacks).toHaveBeenCalledWith({
      workingDir: "/tmp/project",
    });
    expect(getKnowledgePack).toHaveBeenCalledWith(
      "/tmp/project",
      "founder-personal-ip",
    );
  });

  it("整理新资料应覆盖用途、原始资料和确认前不生效提示", async () => {
    const onNavigate = vi.fn();
    const container = renderPage({ workingDir: "/tmp/project", onNavigate });
    await flushEffects();

    await clickButton(container, "整理新资料");

    expect(container.textContent).toContain("选择资料用途");
    expect(container.textContent).toContain("添加原始资料");
    expect(container.textContent).toContain("带到对话里整理");
    expect(container.textContent).toContain("当前先支持粘贴正文");
    expect(container.textContent).toContain("这里不再设置“默认使用”");
    expect(container.textContent).toContain("没有确认的资料不会自动用于创作");
    expect(container.textContent).toContain("个人 IP");
    expect(container.textContent).toContain("品牌产品");
    expect(container.textContent).toContain("内容运营");
    expect(container.textContent).not.toContain("创作时是否默认使用");
    expect(container.textContent).not.toContain("先保存原始资料");
    expect(container.textContent).not.toContain("Builder Skill");
    expect(container.textContent).not.toContain("compile");

    const sourceTextarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    act(() => {
      updateFieldValue(sourceTextarea, "金花黑茶资料，功效表达必须待确认。");
    });

    await clickButton(container, "去对话里整理");

    expect(importKnowledgeSource).not.toHaveBeenCalled();
    expect(mockCompileKnowledgePack).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "claw",
        initialUserPrompt: expect.stringContaining(
          "金花黑茶资料，功效表达必须待确认。",
        ),
        initialRequestMetadata: {
          knowledge_builder: expect.objectContaining({
            working_dir: "/tmp/project",
            pack_name: "founder-personal-ip",
            source: "knowledge-page",
            pack_type: "personal-ip",
          }),
        },
        autoRunInitialPromptOnMount: false,
      }),
    );
  }, 10_000);

  it("确认资料页应展示完整文档、确认清单和确认可用动作", async () => {
    mockGetKnowledgePack.mockResolvedValue(pendingPack);
    const container = renderPage({
      workingDir: "/tmp/project",
      selectedPackName: "jinhua-dark-tea",
    });
    await flushEffects();

    await clickButton(container, "去确认");

    expect(container.textContent).toContain("完整资料文档");
    expect(container.textContent).toContain("需要你确认的内容");
    expect(container.textContent).toContain("确认后会发生什么");
    expect(container.textContent).toContain("高级信息");
    expect(container.textContent).toContain("查看高级信息");
    expect(container.textContent).not.toContain("本轮使用记录");
    expect(container.textContent).toContain("确认可用");
    expect(container.textContent).toContain("不会覆盖原始资料");
    expect(container.textContent).toContain("参考资料");
    expect(container.textContent).not.toContain("导出");
    expect(container.textContent).not.toContain("常用金句");
    expect(container.textContent).not.toContain("KNOWLEDGE.md");
    expect(container.textContent).not.toContain("frontmatter");
    expect(container.textContent).not.toContain("user-confirmed");

    await clickButton(container, "查看高级信息");

    expect(container.textContent).toContain("原始资料");
    expect(container.textContent).toContain("整理记录");
    expect(container.textContent).toContain("本轮使用记录");
    expect(container.textContent).not.toContain("sources/");
    expect(container.textContent).not.toContain("runs/");

    await clickButton(container, "确认可用");

    expect(updateKnowledgePackStatus).toHaveBeenCalledWith({
      workingDir: "/tmp/project",
      name: "jinhua-dark-tea",
      status: "ready",
    });
    expect(container.textContent).toContain("资料已确认可用");
  });

  it("选择创作资料应支持写作口吻单选、参考资料多选和待确认禁用", async () => {
    const onNavigate = vi.fn();
    const operationsPack = buildPackDetail("content-calendar", {
      description: "内容运营资料",
      type: "content-operations",
      status: "ready",
      defaultForWorkspace: false,
    });
    const campaignPack = buildPackDetail("campaign-plan", {
      description: "618 活动资料",
      type: "campaign-operations",
      status: "ready",
      defaultForWorkspace: false,
    });
    mockListKnowledgePacks.mockResolvedValue(
      buildListResponse([readyPack, operationsPack, campaignPack, pendingPack]),
    );
    mockGetKnowledgePack.mockImplementation(
      (_workingDir: string, name: string) =>
        Promise.resolve(
          name === operationsPack.metadata.name
            ? operationsPack
            : name === campaignPack.metadata.name
              ? campaignPack
              : name === pendingPack.metadata.name
                ? pendingPack
                : readyPack,
        ),
    );

    const container = renderPage({
      workingDir: "/tmp/project",
      selectedPackName: "founder-personal-ip",
      onNavigate,
    });
    await flushEffects();

    await clickButton(container, "用于创作");

    expect(container.textContent).toContain("选择这次创作用哪些资料");
    expect(container.textContent).toContain("写作口吻（只能选 1 个）");
    expect(container.textContent).toContain("要参考的资料（可多选）");
    expect(container.textContent).toContain("这次会怎么用");
    expect(container.textContent).toContain("待确认，不能用于创作");
    expect(container.textContent).not.toContain("Resolver");
    expect(container.textContent).not.toContain("persona");
    expect(container.textContent).not.toContain("data");

    const campaignButton = container.querySelector(
      '[data-testid="knowledge-composer-data-campaign-plan"]',
    ) as HTMLButtonElement | null;
    expect(campaignButton).toBeTruthy();

    await act(async () => {
      campaignButton?.click();
      await Promise.resolve();
    });
    await flushEffects();
    expect(container.textContent).toContain("已选 2 份资料");

    await clickButton(container, "确认使用");

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        initialUserPrompt: "请基于当前项目资料创作内容",
        initialRequestMetadata: {
          knowledge_pack: expect.objectContaining({
            pack_name: "campaign-plan",
            working_dir: "/tmp/project",
            packs: [
              {
                name: "founder-personal-ip",
                activation: "explicit",
              },
            ],
          }),
        },
        initialKnowledgePackSelection: expect.objectContaining({
          packName: "campaign-plan",
          companionPacks: [
            {
              name: "founder-personal-ip",
              activation: "explicit",
            },
          ],
        }),
      }),
    );
  });

  it("保存到项目资料页应说明保存结果和确认后才生效", async () => {
    const container = renderPage({
      workingDir: "/tmp/project",
      selectedPackName: "founder-personal-ip",
      initialView: "save",
    });
    await flushEffects();

    expect(container.textContent).toContain("存到哪里？");
    expect(container.textContent).toContain("补充已有资料");
    expect(container.textContent).toContain("新建一份资料");
    expect(container.textContent).toContain("保存后需要确认");
    expect(container.textContent).toContain("保存不会自动改变本轮创作资料");
    expect(container.textContent).toContain(
      "保存后不会立刻用于创作，确认后才会生效",
    );
    expect(container.textContent).not.toContain("新增 2 个内容点");

    const sourceTextarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    act(() => {
      updateFieldValue(
        sourceTextarea,
        "对话中总结出的创始人口吻和两个新内容点。",
      );
    });

    await clickButton(container, "创始人个人 IP 项目资料");
    await clickButton(container, "保存到项目资料");

    expect(importKnowledgeSource).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDir: "/tmp/project",
        packName: "founder-personal-ip",
        sourceText: "对话中总结出的创始人口吻和两个新内容点。",
      }),
    );
    expect(container.textContent).toContain("内容已进入项目资料");
    expect(container.textContent).toContain("下一步需要确认后才会用于创作");
  });

  it("从对话保存进入项目资料时应预填待保存内容", async () => {
    const container = renderPage({
      workingDir: "/tmp/project",
      initialView: "save",
      saveDraft: {
        sourceText: "AI 总结出的创始人口吻、产品事实和内容规则。",
        sourceName: "agent-output-message-1.md",
        description: "对话沉淀资料",
        packType: "custom",
        requestKey: 2026050901,
      },
    });
    await flushEffects();

    const sourceTextarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    expect(sourceTextarea?.value).toBe(
      "AI 总结出的创始人口吻、产品事实和内容规则。",
    );
    expect(container.textContent).toContain("保存到项目资料");
    expect(container.textContent).toContain("新建一份资料");

    await clickButton(container, "保存到项目资料");

    expect(importKnowledgeSource).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDir: "/tmp/project",
        packName: "agent-output-message-1",
        description: "对话沉淀资料",
        packType: "custom",
        sourceFileName: "agent-output-message-1.md",
        sourceText: "AI 总结出的创始人口吻、产品事实和内容规则。",
      }),
    );
  });

  it("状态说明页应统一展示 5 类普通用户状态", async () => {
    const container = renderPage({ workingDir: "/tmp/project" });
    await flushEffects();

    await clickButton(container, "状态说明");

    expect(container.textContent).toContain("项目资料状态说明");
    expect(container.textContent).toContain("回到项目资料");
    for (const label of [
      "没有资料",
      "已可用",
      "待确认",
      "需要补充",
      "整理失败",
    ]) {
      expect(container.textContent).toContain(label);
    }
    expect(container.textContent).toContain(
      "项目资料不是文件夹，它会帮 Lime 在创作时记住口吻、事实和规则。",
    );

    await clickButton(container, "回到项目资料");

    expect(container.textContent).toContain("让 Lime 记住这个项目");
    expect(container.textContent).toContain("项目资料清单");
  });

  it("回到创作应打开输入框项目资料入口", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(2026050501);
    const onNavigate = vi.fn();
    const container = renderPage({
      workingDir: "/tmp/project",
      onNavigate,
    });
    await flushEffects();

    await clickButton(container, "回到创作");

    expect(onNavigate).toHaveBeenCalledWith("agent", {
      agentEntry: "claw",
      projectId: undefined,
      initialInputCapability: {
        capabilityRoute: {
          kind: "builtin_command",
          commandKey: "knowledge_pack",
          commandPrefix: "@资料",
        },
        requestKey: 2026050501,
      },
    });

    dateNowSpy.mockRestore();
  });
});
