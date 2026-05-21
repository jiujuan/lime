import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const {
  mockGetConfig,
  mockSaveConfig,
  mockGetMemoryEffectiveSources,
  mockGetMemoryExtractionStatus,
  mockGetMemoryAutoIndex,
  mockGetWorkingMemory,
  mockCleanupContextMemdir,
  mockEnsureWorkspaceLocalAgentsGitignore,
  mockScaffoldContextMemdir,
  mockScaffoldRuntimeAgentsTemplate,
  mockToggleMemoryAuto,
  mockUpdateMemoryAutoNote,
  mockGetUnifiedMemoryStats,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockGetMemoryEffectiveSources: vi.fn(),
  mockGetMemoryExtractionStatus: vi.fn(),
  mockGetMemoryAutoIndex: vi.fn(),
  mockGetWorkingMemory: vi.fn(),
  mockCleanupContextMemdir: vi.fn(),
  mockEnsureWorkspaceLocalAgentsGitignore: vi.fn(),
  mockScaffoldContextMemdir: vi.fn(),
  mockScaffoldRuntimeAgentsTemplate: vi.fn(),
  mockToggleMemoryAuto: vi.fn(),
  mockUpdateMemoryAutoNote: vi.fn(),
  mockGetUnifiedMemoryStats: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/lib/api/memoryRuntime", () => ({
  getContextMemoryEffectiveSources: mockGetMemoryEffectiveSources,
  getContextMemoryExtractionStatus: mockGetMemoryExtractionStatus,
  getContextMemoryAutoIndex: mockGetMemoryAutoIndex,
  getContextWorkingMemory: mockGetWorkingMemory,
  cleanupContextMemdir: mockCleanupContextMemdir,
  ensureWorkspaceLocalAgentsGitignore: mockEnsureWorkspaceLocalAgentsGitignore,
  scaffoldContextMemdir: mockScaffoldContextMemdir,
  scaffoldRuntimeAgentsTemplate: mockScaffoldRuntimeAgentsTemplate,
  toggleContextMemoryAuto: mockToggleMemoryAuto,
  updateContextMemoryAutoNote: mockUpdateMemoryAutoNote,
}));

vi.mock("@/lib/api/unifiedMemory", () => ({
  getUnifiedMemoryStats: mockGetUnifiedMemoryStats,
}));

vi.mock("@/components/memory/memoryLayerMetrics", () => ({
  buildLayerMetrics: vi.fn(() => ({
    cards: [
      {
        key: "rules",
        title: "来源链",
        value: 1,
        unit: "源",
        available: true,
        description: "ok",
      },
      {
        key: "working",
        title: "会话记忆",
        value: 0,
        unit: "条",
        available: false,
        description: "wait",
      },
      {
        key: "durable",
        title: "持久记忆",
        value: 0,
        unit: "条",
        available: false,
        description: "wait",
      },
      {
        key: "team",
        title: "团队记忆",
        value: 0,
        unit: "份",
        available: false,
        description: "wait",
      },
      {
        key: "compaction",
        title: "会话压缩",
        value: 0,
        unit: "次",
        available: false,
        description: "wait",
      },
    ],
    readyLayers: 1,
    totalLayers: 5,
  })),
}));

import { MemorySettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MemorySettings />);
  });
  mounted.push({ container, root });
  return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const matched = buttons.find((button) => button.textContent?.includes(text));
  if (!matched) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return matched as HTMLButtonElement;
}

async function openSectionTab(container: HTMLElement, text: string) {
  await act(async () => {
    findButton(container, text).click();
  });
  await flushEffects();
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function getBodyText() {
  return document.body.textContent ?? "";
}

async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
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

  mockGetConfig.mockResolvedValue({
    memory: {
      enabled: true,
      max_entries: 1000,
      retention_days: 30,
      auto_cleanup: true,
      profile: {
        strengths: [],
        explanation_style: [],
        challenge_preference: [],
      },
      auto: {
        enabled: true,
        entrypoint: "MEMORY.md",
        max_loaded_lines: 200,
      },
      resolve: {
        additional_dirs: [],
        follow_imports: true,
        import_max_depth: 5,
        load_additional_dirs_memory: false,
      },
      sources: {
        project_memory_paths: ["AGENTS.md"],
        project_rule_dirs: [".agents/rules"],
        user_memory_path: undefined,
      },
    },
  });

  mockGetUnifiedMemoryStats.mockResolvedValue({ total_entries: 1 });
  mockGetMemoryEffectiveSources.mockResolvedValue({
    working_dir: "/tmp",
    total_sources: 2,
    loaded_sources: 1,
    follow_imports: true,
    import_max_depth: 5,
    sources: [
      {
        kind: "auto_memory",
        source_bucket: "auto",
        provider: "memdir",
        updated_at: 1_712_345_678_900,
        path: "/tmp/memory/MEMORY.md",
        exists: true,
        loaded: true,
        line_count: 4,
        import_count: 1,
        warnings: [],
        preview: "# Lime memdir",
      },
    ],
  });
  mockGetMemoryExtractionStatus.mockResolvedValue({
    enabled: true,
    status: "ready",
    status_summary: "工作记忆和上下文压缩快照都已就绪。",
    working_session_count: 1,
    working_entry_count: 2,
    latest_working_memory_at: 1_712_345_678_900,
    latest_compaction: null,
    recent_compactions: [],
  });
  mockGetWorkingMemory.mockResolvedValue({
    memory_dir: "/tmp/runtime/memory",
    total_sessions: 1,
    total_entries: 2,
    sessions: [],
  });
  mockGetMemoryAutoIndex.mockResolvedValue({
    enabled: true,
    root_dir: "/tmp/memory",
    entrypoint: "MEMORY.md",
    max_loaded_lines: 200,
    entry_exists: true,
    total_lines: 4,
    preview_lines: ["# Lime memdir", "- [项目记忆](project/README.md)"],
    items: [
      {
        title: "项目记忆",
        memory_type: "project",
        provider: "memdir",
        updated_at: 1_712_345_678_900,
        relative_path: "project/README.md",
        exists: true,
        summary: "记录项目背景、时间点、约束、动机与团队分工。",
      },
    ],
  });
  mockToggleMemoryAuto.mockResolvedValue({ enabled: false });
  mockScaffoldRuntimeAgentsTemplate.mockResolvedValue({
    target: "workspace",
    path: "/tmp/.lime/AGENTS.md",
    status: "created",
    createdParentDir: true,
  });
  mockScaffoldContextMemdir.mockResolvedValue({
    root_dir: "/tmp/memory",
    entrypoint: "MEMORY.md",
    created_parent_dir: true,
    files: [],
  });
  mockCleanupContextMemdir.mockResolvedValue({
    root_dir: "/tmp/memory",
    entrypoint: "MEMORY.md",
    scanned_files: 4,
    updated_files: 2,
    removed_duplicate_links: 1,
    dropped_missing_links: 0,
    removed_duplicate_notes: 1,
    trimmed_notes: 1,
    curated_topic_files: 1,
  });
  mockEnsureWorkspaceLocalAgentsGitignore.mockResolvedValue({
    path: "/tmp/.gitignore",
    entry: ".lime/AGENTS.local.md",
    status: "added",
  });
  mockUpdateMemoryAutoNote.mockResolvedValue({
    enabled: true,
    root_dir: "/tmp/memory",
    entrypoint: "MEMORY.md",
    max_loaded_lines: 200,
    entry_exists: true,
    total_lines: 1,
    preview_lines: ["- test"],
    items: [
      {
        title: "项目记忆",
        memory_type: "project",
        provider: "memdir",
        updated_at: 1_712_345_678_900,
        relative_path: "project/README.md",
        exists: true,
        summary: "记录项目背景、时间点、约束、动机与团队分工。",
      },
    ],
  });
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
  vi.clearAllTimers();
  await changeLimeLocale("zh-CN");
});

describe("MemorySettings", () => {
  it("应把首屏说明和问卷副标题收进 tips", async () => {
    renderComponent();
    await flushEffects();
    await flushEffects();

    expect(getBodyText()).not.toContain(
      "Manage your user profile, source-chain policy, and memory directory entry so agents can continue rules",
    );
    expect(getBodyText()).not.toContain(
      "Single choice. Helps the agent judge knowledge density",
    );

    const heroTip = await hoverTip("Memory settings info");
    expect(getBodyText()).toContain(
      "Manage your user profile, source-chain policy, and memory directory entry so agents can continue rules",
    );
    await leaveTip(heroTip);

    const questionTip = await hoverTip("Current status info");
    expect(getBodyText()).toContain(
      "Single choice. Helps the agent judge knowledge density",
    );
    await leaveTip(questionTip);
  });

  it("应渲染新的记忆概览与主要分区", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    const tabs = container.querySelector(
      '[data-testid="memory-settings-section-tabs"]',
    );
    expect(tabs).toBeInstanceOf(HTMLElement);

    let text = container.textContent ?? "";
    expect(text).toContain("Memory");
    expect(text).toContain(
      "Manage your user profile, source-chain policy, and memory directory entry.",
    );
    expect(text).toContain("Memory Master Switch");
    expect(text).toContain("Overview");
    expect(text).toContain("Source policy");
    expect(text).toContain("Memory directory");
    expect(text).toContain("Hit details");
    expect(text).toContain("Preference Profile");
    expect(text).toContain("Memory Hit Layer Availability");
    expect(text).toContain("Source Chain Status Overview");
    expect(text).not.toContain("Source Chain Policy");
    expect(text).not.toContain("Memory Directory (memdir)");
    expect(text).not.toContain("Source Chain Hit Details");

    await openSectionTab(container, "Source policy");
    text = container.textContent ?? "";
    expect(text).toContain("Source Chain Policy");

    await openSectionTab(container, "Memory directory");
    text = container.textContent ?? "";
    expect(text).toContain("Memory Directory (memdir)");

    await openSectionTab(container, "Hit details");
    text = container.textContent ?? "";
    expect(text).toContain("Source Chain Hit Details");
    expect(text).not.toContain("settings.memory");
  });

  it("初始化时应加载来源与自动记忆索引", async () => {
    renderComponent();
    await flushEffects();
    await flushEffects();

    expect(mockGetMemoryEffectiveSources).toHaveBeenCalledTimes(2);
    expect(mockGetMemoryAutoIndex).toHaveBeenCalledTimes(1);
  });

  it("点击立即关闭应调用 toggleContextMemoryAuto", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    await act(async () => {
      findButton(container, "Disable now").click();
    });

    expect(mockToggleMemoryAuto).toHaveBeenCalledWith(false);
  });

  it("未填写内容时写入 memdir 应阻止调用", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    await act(async () => {
      findButton(container, "Write to memdir").click();
    });
    await flushEffects();

    expect(mockUpdateMemoryAutoNote).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Enter memdir content before saving",
    );
  });

  it("点击初始化 memdir 应调用脚手架 API", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    await act(async () => {
      findButton(container, "Initialize memdir").click();
    });

    expect(mockScaffoldContextMemdir).toHaveBeenCalledWith("/tmp", false);
  });

  it("点击整理 memdir 应调用清理 API", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    await act(async () => {
      findButton(container, "Organize memdir").click();
    });
    await flushEffects();

    expect(mockCleanupContextMemdir).toHaveBeenCalledWith("/tmp");
    expect(container.textContent).toContain("memdir organized");
  });

  it("写入 memdir 时应携带默认记忆类型", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    const textarea = container.querySelector("textarea[placeholder*='Why:']");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(
        textarea,
        "Why:\n- 当前冻结窗口会影响协议调整。\n\nHow to apply:\n- 2026-04-15 之后再做协议改动。",
      );
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      findButton(container, "Write to memdir").click();
    });

    expect(mockUpdateMemoryAutoNote).toHaveBeenCalledWith(
      "Why:\n- 当前冻结窗口会影响协议调整。\n\nHow to apply:\n- 2026-04-15 之后再做协议改动。",
      undefined,
      undefined,
      "project",
    );
  });

  it("feedback 记忆缺少结构段落时应在前端阻止写入", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    await act(async () => {
      findButton(container, "Feedback memory").click();
    });

    const textarea = container.querySelector(
      "textarea[placeholder*='How to apply:']",
    );
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "只要记住 pnpm only");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      findButton(container, "Write to memdir").click();
    });
    await flushEffects();

    expect(mockUpdateMemoryAutoNote).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Feedback / project memory must include a `Why:` section.",
    );
  });

  it("project 记忆包含相对日期时应提示改成绝对日期", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Memory directory");

    const textarea = container.querySelector("textarea[placeholder*='Why:']");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(
        textarea,
        "Why:\n- 这条背景会影响发版路径。\n\nHow to apply:\n- 明天开始不要再改协议。",
      );
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      findButton(container, "Write to memdir").click();
    });
    await flushEffects();

    expect(mockUpdateMemoryAutoNote).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Project memory cannot use the relative date",
    );
  });

  it("点击生成 Workspace 模板应调用模板生成 API", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Source policy");

    await act(async () => {
      findButton(container, "Generate Workspace template").click();
    });

    expect(mockScaffoldRuntimeAgentsTemplate).toHaveBeenCalledWith(
      "workspace",
      "/tmp",
      false,
    );
  });

  it("点击加入 .gitignore 应调用 gitignore API", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();
    await openSectionTab(container, "Source policy");

    await act(async () => {
      findButton(container, "Add local template to .gitignore").click();
    });

    expect(mockEnsureWorkspaceLocalAgentsGitignore).toHaveBeenCalledWith(
      "/tmp",
    );
  });
});
