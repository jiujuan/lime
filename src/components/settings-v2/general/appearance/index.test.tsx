import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetConfig = vi.fn();
const mockSaveConfig = vi.fn();
const mockSetLanguage = vi.fn();

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: () => mockGetConfig(),
  saveConfig: (config: unknown) => mockSaveConfig(config),
}));

vi.mock("@/i18n/legacy-patch/I18nPatchProvider", () => ({
  useI18nPatch: () => ({
    setLanguage: mockSetLanguage,
  }),
}));

import { AppearanceSettings } from "./index";
import { changeLimeLocale } from "@/i18n/createI18n";
import { LIME_COLOR_SCHEME_STORAGE_KEY } from "@/lib/appearance/colorSchemes";
import { LIME_THEME_STORAGE_KEY } from "@/lib/appearance/themeMode";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mounted: RenderResult[] = [];

function createMockConfig() {
  return {
    language: "zh",
    workspace_preferences: {
      agent_response_language: "auto",
      media_defaults: {
        voice: {
          preferredProviderId: "openai",
        },
      },
    },
    navigation: {
      enabled_items: [],
    },
    chat_appearance: {
      append_selected_text_to_recommendation: true,
      showAvatar: false,
    },
  } as any;
}

async function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AppearanceSettings />);
  });

  await act(async () => {
    await Promise.resolve();
  });

  const rendered = { container, root };
  mounted.push(rendered);
  return rendered;
}

function getBodyText() {
  return document.body.textContent ?? "";
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
      matchMedia?: typeof window.matchMedia;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  globalThis.matchMedia =
    globalThis.matchMedia ||
    (((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia);

  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-lime-theme");
  document.documentElement.removeAttribute("data-lime-theme-effective");
  document.documentElement.removeAttribute("data-lime-color-scheme");
  document.documentElement.removeAttribute("style");
  await changeLimeLocale("zh-CN");
  mockGetConfig.mockResolvedValue(createMockConfig());
  mockSaveConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  mockGetConfig.mockReset();
  mockSaveConfig.mockReset();
  mockSetLanguage.mockReset();

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

  document.documentElement.removeAttribute("data-lime-color-scheme");
  document.documentElement.removeAttribute("data-lime-theme");
  document.documentElement.removeAttribute("data-lime-theme-effective");
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

describe("AppearanceSettings", () => {
  it("应在同一页面中渲染基础外观与推荐行为设置", async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    const buttonTexts = Array.from(container.querySelectorAll("button")).map(
      (button) => button.textContent?.trim() ?? "",
    );

    expect(text).toContain("外观");
    expect(text).toContain(
      "管理主题、界面语言、回复语言和推荐行为。",
    );
    expect(text).toContain("主题：跟随系统");
    expect(text).toContain("配色：墨绿");
    expect(text).toContain("界面：简体中文");
    expect(text).toContain("回复：自动判断");
    expect(text).not.toContain("提示音效");
    expect(text).toContain("基础外观");
    expect(text).toContain("主题模式");
    expect(text).toContain("色彩方案");
    expect(text).toContain("随机");
    expect(text).toContain("墨绿");
    expect(text).toContain("自然");
    expect(text).toContain("海洋");
    expect(text).toContain("复古");
    expect(text).toContain("霓虹");
    expect(text).toContain("青柠");
    expect(text).toContain("黄昏");
    expect(text).toContain("极简");
    expect(text).toContain("活力");
    expect(text).toContain("文艺");
    expect(text).toContain("奢华");
    expect(text).toContain("界面语言");
    expect(text).toContain("回复语言");
    expect(text).not.toContain("持续流程");
    expect(text).not.toContain("消息渠道");
    expect(text).not.toContain("桌宠");
    expect(text).toContain("推荐行为");
    expect(text).toContain("推荐自动附带选中内容");
    expect(text).not.toContain("重新运行引导");
    expect(text).not.toContain("初始化与恢复");
    expect(text).not.toContain("已合并旧入口");
    expect(buttonTexts).not.toContain("设置");
  });

  it("应通过 settings namespace 渲染英文外观 chrome", async () => {
    await changeLimeLocale("en-US");
    mockGetConfig.mockResolvedValue({
      ...createMockConfig(),
      language: "en-US",
    });

    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain("Appearance");
    expect(text).toContain("Theme: System");
    expect(text).toContain("Palette: Graphite Green");
    expect(text).toContain("UI: English");
    expect(text).toContain("Reply: Auto");
    expect(text).not.toContain("Sound cues");
    expect(text).toContain("Base Appearance");
    expect(text).toContain("Theme Mode");
    expect(text).toContain("Color Palette");
    expect(text).toContain("Reply Language");
    expect(text).toContain("Random");
    expect(text).not.toContain("Setup & Recovery");
    expect(text).not.toContain("Optional System Entries");
    expect(text).not.toContain("Plugin Center");
    expect(text).toContain("Recommendation Behavior");
    expect(text).not.toContain("管理主题、语言");
  });

  it("切换界面语言时应写入 BCP 47 locale 并同步兼容 Patch 语言", async () => {
    const { container } = await renderPage();
    const englishButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("English"),
    );

    expect(englishButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      englishButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSetLanguage).toHaveBeenCalledWith("en");
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en-US" }),
    );
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("切换回复语言时应写入 workspace_preferences 且不改 UI language", async () => {
    const { container } = await renderPage();
    const englishButtons = Array.from(
      container.querySelectorAll("button"),
    ).filter((button) => button.textContent?.includes("English"));
    const responseLanguageButton = englishButtons.at(-1);

    expect(responseLanguageButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      responseLanguageButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const savedConfig = mockSaveConfig.mock.calls.at(-1)?.[0] as any;

    expect(savedConfig.language).toBe("zh");
    expect(savedConfig.workspace_preferences.agent_response_language).toBe(
      "en-US",
    );
    expect(
      savedConfig.workspace_preferences.media_defaults.voice
        .preferredProviderId,
    ).toBe("openai");
    expect(mockSetLanguage).not.toHaveBeenCalled();
  });

  it("切换推荐行为时应保留 workspace_preferences 的其他配置", async () => {
    const { container } = await renderPage();
    const switchButton = container.querySelector(
      'button[aria-label="切换推荐自动附带选中内容"]',
    );

    await act(async () => {
      switchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const savedConfig = mockSaveConfig.mock.calls.at(-1)?.[0] as any;

    expect(
      savedConfig.chat_appearance.append_selected_text_to_recommendation,
    ).toBe(false);
    expect(
      savedConfig.workspace_preferences.media_defaults.voice
        .preferredProviderId,
    ).toBe("openai");
  });

  it("切换推荐行为时应写回完整的聊天外观配置", async () => {
    const { container } = await renderPage();
    const switchButton = container.querySelector(
      'button[aria-label="切换推荐自动附带选中内容"]',
    );

    await act(async () => {
      switchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const savedConfig = mockSaveConfig.mock.calls.at(-1)?.[0] as any;

    expect(savedConfig.chat_appearance).toEqual(
      expect.objectContaining({
        append_selected_text_to_recommendation: false,
        showAvatar: false,
      }),
    );
  });

  it("切换色彩方案时应持久化并立即应用到根节点", async () => {
    const { container } = await renderPage();
    const luxuryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("奢华"),
    );

    expect(luxuryButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      luxuryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "lime-luxury",
    );
    expect(document.documentElement.dataset.limeColorScheme).toBe(
      "lime-luxury",
    );
    expect(
      document.documentElement.style.getPropertyValue("--lime-chrome-rail"),
    ).toBe("#f4efe2");
    expect(container.textContent ?? "").toContain("配色：奢华");
  });

  it("点击随机配色时应落到真实预设并持久化", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const { container } = await renderPage();
      const randomButton = Array.from(
        container.querySelectorAll("button"),
      ).find((button) => button.textContent?.includes("随机"));

      expect(randomButton).toBeInstanceOf(HTMLButtonElement);

      await act(async () => {
        randomButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY)).toBe(
        "lime-forest",
      );
      expect(document.documentElement.dataset.limeColorScheme).toBe(
        "lime-forest",
      );
      expect(container.textContent ?? "").toContain("配色：自然");
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("切换主题模式时应持久化并立即应用到整个应用根节点", async () => {
    const { container } = await renderPage();
    const darkButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("深色"),
    );

    expect(darkButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      darkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(localStorage.getItem(LIME_THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.limeTheme).toBe("dark");
    expect(document.documentElement.dataset.limeThemeEffective).toBe("dark");
    expect(
      document.documentElement.style.getPropertyValue("--lime-app-bg"),
    ).toBe("#0b1120");
    expect(container.textContent ?? "").toContain("主题：深色");
  });

  it("不再把首屏和基础外观说明收进 tips", async () => {
    await renderPage();

    expect(getBodyText()).not.toContain(
      "管理主题、界面语言、回复语言，以及推荐问题的上下文带入方式。",
    );
    expect(getBodyText()).not.toContain(
      "先确定全局主题、界面语言和回复语言，再统一工作区里的视觉节奏。",
    );
    expect(
      document.body.querySelector("button[aria-label='外观设置总览说明']"),
    ).toBeNull();
    expect(
      document.body.querySelector("button[aria-label='基础外观说明']"),
    ).toBeNull();
    expect(
      document.body.querySelector("button[aria-label='界面语言说明']"),
    ).toBeNull();
    expect(
      document.body.querySelector("button[aria-label='回复语言说明']"),
    ).toBeNull();
  });
});
