import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockGetConfig, mockSaveConfig, mockGetUnifiedMemoryStats } =
  vi.hoisted(() => ({
    mockGetConfig: vi.fn(),
    mockGetUnifiedMemoryStats: vi.fn(),
    mockSaveConfig: vi.fn(),
  }));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
}));

vi.mock("@/lib/api/unifiedMemory", () => ({
  getUnifiedMemoryStats: mockGetUnifiedMemoryStats,
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

async function flushEffects(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

function changeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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
      embedding: {
        provider: "auto",
        model: "all-MiniLM-L6-v2",
      },
    },
  });
  mockGetUnifiedMemoryStats.mockResolvedValue({
    total_entries: 12,
    storage_used: 2048,
    memory_count: 12,
    categories: [],
  });
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
  vi.clearAllTimers();
  await changeLimeLocale("zh-CN");
});

describe("MemorySettings", () => {
  it("应渲染简洁嵌入模型设置页并隐藏高级设置", async () => {
    renderComponent();
    await flushEffects();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Memory");
    expect(bodyText).toContain(
      "Configure how memory entries are vectorized and retrieved.",
    );
    expect(bodyText).toContain("Embedding model");
    expect(bodyText).toContain("Auto (local ONNX -> Ollama -> full-text only)");
    expect(bodyText).toContain("Local ONNX (all-MiniLM-L6-v2)");
    expect(bodyText).toContain("Ollama");
    expect(bodyText).toContain("OpenAI API");
    expect(bodyText).toContain("None (full-text only)");
    expect(bodyText).not.toContain("Source policy");
    expect(bodyText).not.toContain("Memory directory");
    expect(bodyText).not.toContain("Hit details");
    expect(bodyText).not.toContain("Provider ID");
    expect(bodyText).not.toContain("@import");
    expect(bodyText).not.toContain("memdir");
  });

  it("切换到本地 ONNX 后应保存嵌入配置且保留旧记忆字段", async () => {
    const container = renderComponent();
    await flushEffects();

    const select = container.querySelector(
      "#memory-embedding-provider",
    ) as HTMLSelectElement | null;
    expect(select).toBeInstanceOf(HTMLSelectElement);

    await act(async () => {
      changeSelectValue(select as HTMLSelectElement, "local_onnx");
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, "Save").click();
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          enabled: true,
          auto: expect.objectContaining({
            entrypoint: "MEMORY.md",
          }),
          resolve: expect.objectContaining({
            follow_imports: true,
          }),
          sources: expect.objectContaining({
            project_memory_paths: ["AGENTS.md"],
          }),
          embedding: {
            model: "all-MiniLM-L6-v2",
            provider: "local_onnx",
            provider_id: undefined,
          },
        }),
      }),
    );
  });

  it("Ollama 选项应通过 provider 与 provider_id 写入底层配置", async () => {
    const container = renderComponent();
    await flushEffects();

    const select = container.querySelector(
      "#memory-embedding-provider",
    ) as HTMLSelectElement | null;
    expect(select).toBeInstanceOf(HTMLSelectElement);

    await act(async () => {
      changeSelectValue(select as HTMLSelectElement, "ollama");
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, "Save").click();
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          embedding: {
            model: "nomic-embed-text",
            provider: "provider",
            provider_id: "ollama",
          },
        }),
      }),
    );
  });
});
