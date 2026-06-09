import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockGetConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
}));
const { mockOpenExternalUrlWithSystemBrowser } = vi.hoisted(() => ({
  mockOpenExternalUrlWithSystemBrowser: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));
vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: mockOpenExternalUrlWithSystemBrowser,
}));

import { WebSearchSettings } from ".";

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
    root.render(<WebSearchSettings />);
  });
  mounted.push({ container, root });
  return container;
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

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text),
  );
  if (!target) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return target as HTMLButtonElement;
}

async function switchTab(container: HTMLElement, text: string) {
  await act(async () => {
    findButton(container, text).click();
    await flushEffects();
  });
}

function findSelect(container: HTMLElement, id: string): HTMLSelectElement {
  const node = container.querySelector<HTMLSelectElement>(`#${id}`);
  if (!node) {
    throw new Error(`未找到下拉框: ${id}`);
  }
  return node;
}

function findInput(container: HTMLElement, id: string): HTMLInputElement {
  const node = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!node) {
    throw new Error(`未找到输入框: ${id}`);
  }
  return node;
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!nativeSetter) {
    throw new Error("未找到 input value setter");
  }

  await act(async () => {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushEffects();
  });
}

async function setSelectValue(select: HTMLSelectElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (!nativeSetter) {
    throw new Error("未找到 select value setter");
  }

  await act(async () => {
    nativeSetter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushEffects();
  });
}

beforeEach(async () => {
  await changeLimeLocale("en-US");
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();

  mockGetConfig.mockResolvedValue({
    web_search: {
      engine: "google",
      provider: "duckduckgo_instant",
      provider_priority: ["duckduckgo_instant", "bing_search_api"],
      tavily_api_key: "tavily-old-key",
      bing_search_api_key: "bing-old-key",
      google_search_api_key: "google-old-key",
      google_search_engine_id: "cx-old-id",
      multi_search: {
        priority: ["google", "bing"],
        engines: [
          {
            name: "google",
            url_template: "https://www.google.com/search?q={query}",
            enabled: true,
          },
        ],
        max_results_per_engine: 5,
        max_total_results: 20,
        timeout_ms: 4000,
      },
    },
    image_gen: {
      image_search_pexels_api_key: "old-key",
      image_search_pixabay_api_key: "old-pixabay-key",
    },
  });
  mockSaveConfig.mockResolvedValue(undefined);
  mockOpenExternalUrlWithSystemBrowser.mockResolvedValue(undefined);
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
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("WebSearchSettings", () => {
  it("应默认进入搜索链路 tab，并延迟挂载其他配置区", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    const text = container.textContent ?? "";
    expect(text).toContain("Web Search");
    expect(text).toContain(
      "Manage search engines, provider fallback, and image search keys.",
    );
    expect(text).toContain("Current provider: duckduckgo_instant");
    expect(text).toContain("Status: saved");
    expect(text).toContain("Online Search Configuration");
    expect(text).toContain("General search first");
    expect(text).toContain("Choose search engine");
    expect(text).toContain("Xiaohongshu");
    expect(text).toContain("Preferred search provider");
    expect(text).toContain("Provider fallback priority (comma-separated)");
    expect(text).toContain("Provider credential status");
    expect(text).toContain("Current fallback preview");
    expect(text).toContain("duckduckgo_instant -> bing_search_api");
    expect(text).toContain("Configuration advice");
    expect(text).toContain("Provider Credentials");
    expect(text).toContain("MSE Aggregation");
    expect(text).toContain("Image Search");
    expect(text).not.toContain("Online Image Search");
    expect(text).not.toContain("网络搜索");
    expect(container.querySelector("#web-search-tavily-key")).toBeNull();
    expect(container.querySelector("#web-search-mse-priority")).toBeNull();
    expect(container.querySelector("#web-search-pexels-key")).toBeNull();

    const select = findSelect(container, "web-search-engine");
    expect(select.value).toBe("google");
    const provider = findSelect(container, "web-search-provider");
    expect(provider.value).toBe("duckduckgo_instant");
    expect(
      findInput(container, "web-search-provider-priority").placeholder,
    ).toBe(
      "tavily, multi_search_engine, bing_search_api, google_custom_search, duckduckgo_instant",
    );

    const searchChainTip = await hoverTip(
      "Online search configuration details",
    );
    expect(getBodyText()).toContain(
      "Choose the search engine and preferred provider first, then fill in fallback order and required credentials.",
    );
    await leaveTip(searchChainTip);

    const engineTip = await hoverTip("Choose search engine details");
    expect(getBodyText()).toContain(
      "Google is for general search; Xiaohongshu is for Chinese lifestyle and shopping content.",
    );
    await leaveTip(engineTip);

    const priorityTip = await hoverTip("Provider fallback priority details");
    expect(getBodyText()).toContain(
      "Uses the default fallback chain when empty; unknown providers are ignored.",
    );
    await leaveTip(priorityTip);

    const previewTip = await hoverTip("Current fallback preview details");
    expect(getBodyText()).toContain(
      "Shows the search fallback chain in current provider order.",
    );
    await leaveTip(previewTip);

    const suggestionTip = await hoverTip("Online search configuration advice");
    expect(getBodyText()).toContain(
      "For more stable general web search, fill Tavily, Bing, or Google Custom Search first. MSE works better as aggregate fallback.",
    );
    await leaveTip(suggestionTip);
  });

  it("切到 Provider 凭证 tab 后应加载搜索服务 Key", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");

    expect(container.textContent).toContain("Provider Credentials");
    const tavilyInput = findInput(container, "web-search-tavily-key");
    expect(tavilyInput.value).toBe("tavily-old-key");

    const bingKeyInput = findInput(container, "web-search-bing-key");
    expect(bingKeyInput.value).toBe("bing-old-key");
    const googleKeyInput = findInput(container, "web-search-google-key");
    expect(googleKeyInput.value).toBe("google-old-key");
    const googleEngineInput = findInput(
      container,
      "web-search-google-engine-id",
    );
    expect(googleEngineInput.value).toBe("cx-old-id");
  });

  it("切到 MSE 聚合 tab 后应加载聚合配置", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "MSE Aggregation");

    const text = container.textContent ?? "";
    expect(text).toContain("Multi Search Engine");
    expect(text).toContain("Custom template not configured");
    expect(text).toContain("Multi Search Engine priority (comma-separated)");
    expect(text).toContain("View MSE design reference");
    expect(text).toContain("Per-engine result limit");
    expect(text).toContain("Total aggregation limit");
    expect(text).toContain("Per-engine timeout (ms)");
    expect(text).toContain("Custom engine name (optional)");
    expect(text).toContain("Custom engine URL template (must include {query})");
    expect(text).toContain("MSE usage advice");
    expect(text).toContain("Current template status");
    expect(text).toContain(
      "The custom engine is not ready yet. It needs a name and a template containing {query}.",
    );
    expect(findInput(container, "web-search-mse-priority").value).toBe(
      "google, bing",
    );
    expect(findInput(container, "web-search-mse-priority").placeholder).toBe(
      "google, bing, duckduckgo, brave",
    );
    expect(findInput(container, "web-search-mse-max-per-engine").value).toBe(
      "5",
    );
    expect(findInput(container, "web-search-mse-timeout").value).toBe("4000");
    expect(
      findInput(container, "web-search-mse-custom-engine-name").placeholder,
    ).toBe("For example: hn");
    expect(
      findInput(container, "web-search-mse-custom-engine-template").placeholder,
    ).toBe("https://example.com/search?q={query}");

    const mseTip = await hoverTip("Multi Search Engine details");
    expect(getBodyText()).toContain(
      "Maintain MSE aggregation order, limits, timeouts, and custom engine templates in one place.",
    );
    await leaveTip(mseTip);

    const suggestionTip = await hoverTip("MSE usage advice details");
    expect(getBodyText()).toContain(
      "Put frequently used engines first. Avoid high total limits that slow responses; around 4s is a balanced desktop timeout.",
    );
    await leaveTip(suggestionTip);
  });

  it("切到图片搜索 tab 后应加载图片 Key 和观测面板", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Image Search");

    const text = container.textContent ?? "";
    expect(text).toContain("Online Image Search");
    expect(text).toContain("Pexels filled");
    expect(text).toContain("Pixabay filled");
    expect(text).toContain("Pexels API Key");
    expect(text).toContain("Apply for Pexels Key");
    expect(text).toContain("View docs");
    expect(text).toContain("Pexels onboarding note is tucked away");
    expect(text).toContain("Pixabay API Key");
    expect(text).toContain("Apply for Pixabay Key");
    expect(text).toContain("Pixabay onboarding note is tucked away");
    expect(text).toContain("Observability Panel");
    expect(text).toContain("MSE custom template not configured");
    expect(text).toContain("Current provider fallback chain");
    expect(text).toContain("duckduckgo_instant -> bing_search_api");
    expect(text).toContain("Image search keys");
    expect(text).toContain(
      "Claw image material search has at least one online image source available.",
    );
    const input = findInput(container, "web-search-pexels-key");
    expect(input.value).toBe("old-key");
    expect(input.placeholder).toBe("Enter Pexels API Key");
    const pixabayInput = findInput(container, "web-search-pixabay-key");
    expect(pixabayInput.value).toBe("old-pixabay-key");
    expect(pixabayInput.placeholder).toBe("Enter Pixabay API Key");

    const imagesTip = await hoverTip("Online image search details");
    expect(getBodyText()).toContain(
      "Configure Pexels and Pixabay API keys used by Claw `@素材` online image search.",
    );
    await leaveTip(imagesTip);

    const observabilityTip = await hoverTip("Observability panel details");
    expect(getBodyText()).toContain(
      "Quickly check whether the current search chain is complete before saving.",
    );
    await leaveTip(observabilityTip);

    const pexelsKeyTip = await hoverTip("Pexels API Key details");
    expect(getBodyText()).toContain(
      "Falls back to the PEXELS_API_KEY environment variable when empty.",
    );
    await leaveTip(pexelsKeyTip);

    const pixabayKeyTip = await hoverTip("Pixabay API Key details");
    expect(getBodyText()).toContain(
      "Falls back to the PIXABAY_API_KEY environment variable when empty.",
    );
    await leaveTip(pixabayKeyTip);
  });

  it("应把联网搜索补充说明收进 tips", async () => {
    renderComponent();
    await flushEffects();
    await flushEffects();

    expect(getBodyText()).not.toContain(
      "Manage search engines, provider fallback chains, and image search keys. Service onboarding notes are tucked into their respective configuration sections.",
    );
    expect(getBodyText()).not.toContain(
      "Apply URL: https://www.pexels.com/api/new/",
    );
    expect(getBodyText()).not.toContain(
      "Apply URL: https://pixabay.com/accounts/register/",
    );

    const heroTip = await hoverTip("Online search settings overview");
    expect(getBodyText()).toContain(
      "Manage search engines, provider fallback chains, and image search keys. Service onboarding notes are tucked into their respective configuration sections.",
    );
    await leaveTip(heroTip);

    await switchTab(document.body, "Image Search");
    const pexelsTip = await hoverTip("Pexels onboarding note");
    expect(getBodyText()).toContain(
      "Apply URL: https://www.pexels.com/api/new/",
    );
    expect(getBodyText()).toContain(
      "Verification path: Claw → @素材 → Pexels image candidates.",
    );
    await leaveTip(pexelsTip);

    const pixabayTip = await hoverTip("Pixabay onboarding note");
    expect(getBodyText()).toContain(
      "Apply URL: https://pixabay.com/accounts/register/",
    );
    expect(getBodyText()).toContain(
      "Verification path: Claw → @素材 → Pixabay image candidates.",
    );
    await leaveTip(pixabayTip);
  });

  it("修改搜索提供商与图片 Key 后应统一保存", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await setSelectValue(
      findSelect(container, "web-search-engine"),
      "xiaohongshu",
    );
    await setSelectValue(
      findSelect(container, "web-search-provider"),
      "multi_search_engine",
    );
    await setInputValue(
      findInput(container, "web-search-provider-priority"),
      "multi_search_engine, tavily, bing_search_api",
    );

    await switchTab(container, "Provider Credentials");
    await setInputValue(
      findInput(container, "web-search-tavily-key"),
      "tavily-new-key",
    );
    await setInputValue(
      findInput(container, "web-search-bing-key"),
      "bing-new-key",
    );
    await setInputValue(
      findInput(container, "web-search-google-key"),
      "google-new-key",
    );
    await setInputValue(
      findInput(container, "web-search-google-engine-id"),
      "cx-new-id",
    );

    await switchTab(container, "MSE Aggregation");
    await setInputValue(
      findInput(container, "web-search-mse-custom-engine-name"),
      "hn",
    );
    await setInputValue(
      findInput(container, "web-search-mse-custom-engine-template"),
      "https://hn.algolia.com/?q={query}",
    );
    expect(container.textContent).toContain("Custom template ready");
    expect(container.textContent).toContain("Custom engine ready: hn");

    await switchTab(container, "Image Search");
    expect(container.textContent).toContain("MSE custom template ready");
    await setInputValue(
      findInput(container, "web-search-pexels-key"),
      "new-key",
    );
    await setInputValue(
      findInput(container, "web-search-pixabay-key"),
      "new-pixabay-key",
    );

    await act(async () => {
      findButton(container, "Save").click();
      await flushEffects();
    });

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        web_search: expect.objectContaining({
          engine: "xiaohongshu",
          provider: "multi_search_engine",
          provider_priority: [
            "multi_search_engine",
            "tavily",
            "bing_search_api",
          ],
          tavily_api_key: "tavily-new-key",
          bing_search_api_key: "bing-new-key",
          google_search_api_key: "google-new-key",
          google_search_engine_id: "cx-new-id",
          multi_search: expect.objectContaining({
            priority: ["google", "bing"],
            timeout_ms: 4000,
          }),
        }),
        image_gen: expect.objectContaining({
          image_search_pexels_api_key: "new-key",
          image_search_pixabay_api_key: "new-pixabay-key",
        }),
      }),
    );
    expect(container.textContent).toContain("Web search settings saved");
  });

  it("点击一键申请 Key 应打开官方申请页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Image Search");
    await act(async () => {
      findButton(container, "Apply for Pexels Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://www.pexels.com/api/new/",
    );
  });

  it("点击 Tavily 申请按钮应打开官方页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");
    await act(async () => {
      findButton(container, "Apply for Tavily Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://app.tavily.com/",
    );
  });

  it("外链打开失败时不回退 window.open 旁路", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    mockOpenExternalUrlWithSystemBrowser.mockRejectedValueOnce(
      new Error("host unavailable"),
    );
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");
    await act(async () => {
      findButton(container, "Apply for Tavily Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://app.tavily.com/",
    );
    expect(windowOpen).not.toHaveBeenCalled();

    consoleError.mockRestore();
    windowOpen.mockRestore();
  });

  it("点击 Pixabay 申请按钮应打开官方页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Image Search");
    await act(async () => {
      findButton(container, "Apply for Pixabay Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://pixabay.com/accounts/register/",
    );
  });

  it("点击 Bing 申请按钮应打开 Azure 页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");
    await act(async () => {
      findButton(container, "Apply for Bing Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://portal.azure.com/#create/Microsoft.CognitiveServicesBingSearch-v7",
    );
  });

  it("点击 Google 申请按钮应打开 Google Cloud API 页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");
    await act(async () => {
      findButton(container, "Apply for Google Key").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://console.cloud.google.com/apis/library/customsearch.googleapis.com",
    );
  });

  it("点击创建 CSE 按钮应打开可编程搜索引擎页面", async () => {
    const container = renderComponent();
    await flushEffects();
    await flushEffects();

    await switchTab(container, "Provider Credentials");
    await act(async () => {
      findButton(container, "Create CSE").click();
      await flushEffects();
    });

    expect(mockOpenExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://programmablesearchengine.google.com/",
    );
  });
});
