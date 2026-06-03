import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  flushEffects,
  renderIntoDom,
  setReactActEnvironment,
  type MountedRoot,
} from "@/components/image-gen/test-utils";
import { agentZhCNResource as agentZhCN } from "@/i18n/agentResources";
import settingsZhCN from "@/i18n/resources/zh-CN/settings.json";
import { MemoryPage } from "./MemoryPage";

const {
  mockGetConfig,
  mockSaveConfig,
  mockGetUnifiedMemoryStats,
  mockListUnifiedMemories,
  mockTranslate,
  mockUseTranslation,
} = vi.hoisted(() => {
  const mockTranslate = vi.fn((key: string, values?: Record<string, unknown>) =>
    key.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
      const value = values?.[name];
      return value == null ? match : String(value);
    }),
  );

  return {
    mockGetConfig: vi.fn(),
    mockSaveConfig: vi.fn(),
    mockGetUnifiedMemoryStats: vi.fn(),
    mockListUnifiedMemories: vi.fn(),
    mockTranslate,
    mockUseTranslation: vi.fn((_namespace?: string) => ({
      i18n: {
        language: "zh-CN",
        resolvedLanguage: "zh-CN",
      },
      t: mockTranslate,
    })),
  };
});

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/lib/api/unifiedMemory", () => ({
  getUnifiedMemoryStats: mockGetUnifiedMemoryStats,
  listUnifiedMemories: mockListUnifiedMemories,
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

const agentDictionary = agentZhCN as Record<string, string>;
const settingsDictionary = settingsZhCN as Record<string, string>;
const mountedRoots: MountedRoot[] = [];

function translateTestResource(
  key: string,
  values?: Record<string, unknown>,
): string {
  const template = agentDictionary[key] ?? settingsDictionary[key] ?? key;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

function findButtonContaining(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到包含文本的按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

function renderPage(options?: {
  section?: "home" | "durable" | "identity" | "context";
  focusMemoryTitle?: string;
  focusMemoryCategory?: "identity" | "context";
}) {
  return renderIntoDom(
    <MemoryPage
      onNavigate={vi.fn()}
      pageParams={{
        section: options?.section || "home",
        focusMemoryTitle: options?.focusMemoryTitle,
        focusMemoryCategory: options?.focusMemoryCategory,
      }}
    />,
    mountedRoots,
  ).container;
}

async function flushPageEffects(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await flushEffects();
  }
}

function updateInputValue(element: HTMLInputElement | null, value: string) {
  expect(element).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element?.dispatchEvent(new Event("input", { bubbles: true }));
  element?.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("MemoryPage", () => {
  beforeEach(() => {
    setReactActEnvironment();
    vi.clearAllMocks();
    mockTranslate.mockImplementation(translateTestResource);
    mockGetConfig.mockResolvedValue({
      memory: {
        enabled: true,
        embedding: {
          provider: "local_onnx",
          model: "all-MiniLM-L6-v2",
        },
      },
    });
    mockGetUnifiedMemoryStats.mockResolvedValue({
      total_entries: 2,
      storage_used: 2048,
      memory_count: 2,
      categories: [
        { category: "identity", count: 1 },
        { category: "context", count: 1 },
      ],
    });
    mockListUnifiedMemories.mockResolvedValue([
      {
        id: "memory-1",
        session_id: "session-1",
        memory_type: "conversation",
        category: "identity",
        title: "夏日短视频语气",
        summary: "适合清爽、轻快、有镜头感的小红书口播开场。",
        content:
          "第一句先给画面感，再抛出反差点。\n整体节奏要短句、轻快、有停顿。",
        updated_at: 1_712_345_678_900,
        created_at: 1_712_300_000_000,
        tags: ["小红书", "口播", "夏日氛围"],
        metadata: {
          access_count: 1,
          confidence: 0.8,
          embedding: [0.1, 0.2],
          importance: 7,
          last_accessed_at: null,
          source: "auto_extracted",
        },
      },
      {
        id: "memory-2",
        session_id: "session-2",
        memory_type: "conversation",
        category: "context",
        title: "对标样片：海边穿搭 15 秒版本",
        summary: "节奏更快，前三秒先放成片，再补一句选题钩子。",
        content:
          "先上结果镜头，再回到场景准备。\n字幕尽量压到两行内。\n最后一镜保留海边风声。",
        updated_at: 1_712_345_779_000,
        created_at: 1_712_300_100_000,
        tags: ["海边", "穿搭", "15 秒"],
        metadata: {
          access_count: 2,
          confidence: 0.9,
          embedding: [0.3, 0.4],
          importance: 8,
          last_accessed_at: null,
          source: "manual",
        },
      },
    ]);
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  it("应渲染截图版记忆库布局，并隐藏底层工程入口", async () => {
    renderPage();
    await flushPageEffects();

    const bodyText = document.body.textContent ?? "";
    expect(
      document.body.querySelector(".lime-workbench-theme-scope"),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="memory-library-shell"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="memory-library-list"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="memory-library-detail"]'),
    ).toBeTruthy();
    expect(bodyText).toContain("记忆库");
    expect(bodyText).toContain("记忆");
    expect(bodyText).toContain("设置");
    expect(bodyText).toContain("用户洞察（2）");
    expect(bodyText).toContain("最近");
    expect(bodyText).toContain("文件总数");
    expect(bodyText).toContain("总大小");
    expect(bodyText).toContain("已索引片段");
    expect(bodyText).toContain("向量搜索");
    expect(bodyText).toContain("夏日短视频语气");
    expect(bodyText).not.toContain("Metadata");

    const firstEntry = document.body.querySelector(
      '[data-testid="memory-library-entry-memory-1"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      firstEntry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const detailText = document.body.textContent ?? "";
    expect(detailText).toContain("Metadata");
    expect(detailText).toContain("Memory Points");
    expect(detailText).toContain("Activity Session");
    expect(detailText).toContain("activity");
    expect(detailText).toContain("user_insight");
    expect(detailText).toContain("第一句先给画面感");
    expect(detailText).not.toContain("memdir");
    expect(detailText).not.toContain("Provider ID");
    expect(detailText).not.toContain("Runtime");
    expect(detailText).not.toContain("Agent");
  });

  it("应把记忆与设置作为同一弹窗的两个 tab，并在设置页隐藏左侧列表", async () => {
    renderPage();
    await flushPageEffects();

    expect(
      document.body.querySelector('[data-testid="memory-library-list"]'),
    ).toBeTruthy();

    await act(async () => {
      findButtonByText("设置").click();
      await Promise.resolve();
    });
    await flushPageEffects(5);

    const bodyText = document.body.textContent ?? "";
    expect(
      document.body.querySelector('[data-testid="memory-library-shell"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="memory-library-list"]'),
    ).toBeNull();
    expect(bodyText).toContain("日常记忆");
    expect(bodyText).toContain("查看 Lime 是否能检索已确认的项目资料和长期偏好");
    expect(bodyText).not.toContain("本地 ONNX（all-MiniLM-L6-v2）");

    await act(async () => {
      findButtonContaining("高级").click();
      await Promise.resolve();
    });
    await flushPageEffects(2);

    const advancedBodyText = document.body.textContent ?? "";
    expect(advancedBodyText).toContain("提供商");
    expect(advancedBodyText).toContain("本地 ONNX（all-MiniLM-L6-v2）");
    expect(
      document.body.querySelector("#memory-embedding-provider"),
    ).toBeInstanceOf(HTMLSelectElement);
    expect(advancedBodyText).not.toContain("memdir");
    expect(advancedBodyText).not.toContain("Runtime");
    expect(advancedBodyText).not.toContain("Provider ID");
  });

  it("应支持搜索过滤并同步右侧详情", async () => {
    renderPage();
    await flushPageEffects();

    const searchInput = document.body.querySelector(
      'input[aria-label="搜索记忆"]',
    ) as HTMLInputElement | null;

    await act(async () => {
      updateInputValue(searchInput, "海边");
      await Promise.resolve();
    });
    await flushPageEffects();

    const filteredEntry = document.body.querySelector(
      '[data-testid="memory-library-entry-memory-2"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      filteredEntry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("对标样片：海边穿搭 15 秒版本");
    expect(bodyText).toContain("最后一镜保留海边风声");
    expect(bodyText).not.toContain("夏日短视频语气");
  });

  it("应兼容旧分类深链并可显示仅全文搜索状态", async () => {
    mockGetConfig.mockResolvedValue({
      memory: {
        enabled: true,
        embedding: {
          provider: "disabled",
        },
      },
    });

    renderPage({
      section: "context",
      focusMemoryCategory: "context",
      focusMemoryTitle: "对标样片：海边穿搭 15 秒版本",
    });
    await flushPageEffects();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("对标样片：海边穿搭 15 秒版本");
    expect(bodyText).toContain("手动整理");
    expect(bodyText).toContain("context");
    expect(bodyText).not.toContain("夏日短视频语气");
  });
});
