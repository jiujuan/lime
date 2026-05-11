import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockGetConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/components/input-kit", () => ({
  ModelSelector: ({
    providerType,
    model,
    placeholderLabel,
  }: {
    providerType: string;
    model: string;
    placeholderLabel?: string;
  }) => (
    <div data-testid="settings-model-selector">
      {providerType || placeholderLabel || "Auto"} /{" "}
      {model || placeholderLabel || "Auto"}
    </div>
  ),
}));

vi.mock("../image-gen", () => ({
  ImageGenSettings: () => <div>Image service model section</div>,
}));

vi.mock("../video-gen", () => ({
  VideoGenSettings: () => <div>Video service model section</div>,
}));

vi.mock("../voice", () => ({
  VoiceSettings: () => <div>Voice service model section</div>,
}));

import { MediaServicesSettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<MediaServicesSettings />);
  });

  mounted.push({ container, root });
  return container;
}

async function flushEffects(times = 6) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
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
    await flushEffects(2);
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await flushEffects(2);
  });
}

function findSection(container: HTMLElement, title: string): HTMLElement {
  const heading = Array.from(container.querySelectorAll("h3")).find((node) =>
    node.textContent?.includes(title),
  );
  if (!heading) {
    throw new Error(`未找到区块标题: ${title}`);
  }

  const section = heading.closest("section");
  if (!section) {
    throw new Error(`未找到区块容器: ${title}`);
  }

  return section as HTMLElement;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  vi.clearAllMocks();
  await changeLimeLocale("en-US");

  mockGetConfig.mockResolvedValue({
    workspace_preferences: {
      schema_version: 2,
      service_models: {
        responsive_chat: {
          preferredProviderId: "openai",
          preferredModelId: "gpt-4o-mini",
        },
        topic: {
          preferredProviderId: "openai",
          preferredModelId: "gpt-5.4-mini",
        },
        input_completion: {
          preferredProviderId: "openai",
          preferredModelId: "gpt-5.4-mini",
          enabled: true,
        },
      },
    },
    image_gen: {
      default_count: 2,
    },
  });
  mockSaveConfig.mockResolvedValue(undefined);
});

afterEach(async () => {
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

  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("MediaServicesSettings", () => {
  it("应渲染完整服务模型总页而非仅媒体页签", async () => {
    const container = renderComponent();
    await flushEffects();

    const text = container.textContent ?? "";
    expect(text).toContain("Service Models");
    expect(text).toContain("Fast Response Chat Assistant");
    expect(text).toContain("Topic Auto-Naming Assistant");
    expect(text).toContain("AI Image Topic Naming Assistant");
    expect(text).toContain("Message Translation Assistant");
    expect(text).toContain("Conversation History Compression Assistant");
    expect(text).toContain("Assistant Info Generation Assistant");
    expect(text).toContain("Input Autocomplete Assistant");
    expect(text).toContain("Prompt Rewrite Assistant");
    expect(text).toContain("Project Resource Prompt Rewrite Assistant");
    expect(text).toContain(
      "The current input completion chain only uses the enable switch",
    );
    expect(text).toContain("AI Image Settings");
    expect(text).toContain("Image service model section");
    expect(text).toContain("Video service model section");
    expect(text).toContain("Voice service model section");
    expect(text).not.toContain("settings.mediaServices");
    expect(text).not.toContain("媒体服务");

    const section = findSection(container, "Topic Auto-Naming Assistant");
    expect(section.className).toContain("overflow-visible");
    expect(section.className).not.toContain("overflow-hidden");
  });

  it("应把首屏说明收进 tips", async () => {
    renderComponent();
    await flushEffects();

    expect(getBodyText()).not.toContain(
      "Manage the default models already wired into the main chain",
    );

    const heroTip = await hoverTip("Service models overview");
    expect(getBodyText()).toContain(
      "Manage the default models already wired into the main chain",
    );
    await leaveTip(heroTip);
  });

  it("应展示快速响应对话助理服务模型入口", async () => {
    const container = renderComponent();
    await flushEffects();

    const section = findSection(container, "Fast Response Chat Assistant");
    expect(section.textContent).toContain("streaming");
  });

  it("切换输入自动补全开关时应写入 service_models 配置", async () => {
    const container = renderComponent();
    await flushEffects();

    const section = findSection(container, "Input Autocomplete Assistant");
    const switchButton = section.querySelector("button[role='switch']");
    expect(switchButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      switchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushEffects(2);
    });

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockSaveConfig.mock.calls[0][0];
    expect(
      savedConfig.workspace_preferences.service_models.input_completion,
    ).toEqual(
      expect.objectContaining({
        preferredProviderId: "openai",
        preferredModelId: "gpt-5.4-mini",
        enabled: false,
      }),
    );
  });

  it("输入默认图片数量后应写入 image_gen 配置", async () => {
    const container = renderComponent();
    await flushEffects();

    const section = findSection(container, "AI Image Settings");
    const numberInput = section.querySelector("input[type='number']");
    expect(numberInput).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(numberInput, "5");
      numberInput?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      numberInput?.dispatchEvent(new Event("input", { bubbles: true }));
      numberInput?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await flushEffects(2);
    });

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockSaveConfig.mock.calls[0][0];
    expect(savedConfig.image_gen).toEqual(
      expect.objectContaining({
        default_count: 5,
      }),
    );
  });

  it("添加项目资料自定义提示词后应写入 service_models 配置", async () => {
    const container = renderComponent();
    await flushEffects();

    const section = findSection(
      container,
      "Project Resource Prompt Rewrite Assistant",
    );
    const addButton = Array.from(section.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add custom prompt"),
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushEffects(2);
    });

    const textarea = section.querySelector("textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "请优先使用项目资料上下文重写提问");
      textarea?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      textarea?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await flushEffects(2);
    });

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockSaveConfig.mock.calls[0][0];
    expect(
      savedConfig.workspace_preferences.service_models.resource_prompt_rewrite,
    ).toEqual(
      expect.objectContaining({
        customPrompt: "请优先使用项目资料上下文重写提问",
      }),
    );
  });
});
