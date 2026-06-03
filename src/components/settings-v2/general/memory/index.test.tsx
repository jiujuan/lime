import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockGetConfig, mockSaveConfig, mockGetUnifiedMemoryStats } = vi.hoisted(
  () => ({
    mockGetConfig: vi.fn(),
    mockGetUnifiedMemoryStats: vi.fn(),
    mockSaveConfig: vi.fn(),
  }),
);

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

async function clickButtonByText(container: HTMLElement, text: string) {
  await act(async () => {
    findButton(container, text).click();
    await Promise.resolve();
  });
}

function changeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function changeTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function findTextareaByPlaceholder(
  container: HTMLElement,
  placeholder: string,
): HTMLTextAreaElement {
  const textarea = Array.from(container.querySelectorAll("textarea")).find(
    (element) => element.getAttribute("placeholder") === placeholder,
  );
  if (!textarea) {
    throw new Error(`未找到文本框: ${placeholder}`);
  }
  return textarea as HTMLTextAreaElement;
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
      soul: {
        enabled: false,
        tone: [],
        communication_style: [],
        avoid: [],
        imported_from: "manual",
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
      "Everyday settings and advanced tools are separated.",
    );
    expect(bodyText).toContain("Everyday memory");
    expect(bodyText).toContain("AI personality");
    expect(bodyText).toContain("Advanced");
    expect(bodyText).toContain("Everyday memory status");
    expect(bodyText).not.toContain("Writing voice");
    expect(bodyText).not.toContain("Import SOUL.md");
    expect(bodyText).not.toContain("SOUL.md file content");
    expect(bodyText).not.toContain(
      "Auto (local ONNX -> Ollama -> full-text only)",
    );
    expect(bodyText).not.toContain("Local ONNX (all-MiniLM-L6-v2)");
    expect(bodyText).not.toContain("OpenAI API");
    expect(bodyText).not.toContain("For example: Pragmatic research partner");
    expect(bodyText).not.toContain("Creator voice ID");
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
    await clickButtonByText(container, "Advanced");

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
    await clickButtonByText(container, "Advanced");

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

  it("选择 AI 个性模板后应写入 memory.soul 且不暴露手填字段", async () => {
    const container = renderComponent();
    await flushEffects();
    await clickButtonByText(container, "AI personality");

    expect(document.body.textContent).toContain("Initial templates");
    expect(document.body.textContent).toContain("Direct reviewer");
    expect(document.body.textContent).not.toContain(
      "For example: Pragmatic research partner",
    );
    expect(document.body.textContent).not.toContain("Creator voice ID");
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();

    await act(async () => {
      findButton(container, "Use template").click();
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
          embedding: expect.objectContaining({
            provider: "auto",
            model: "all-MiniLM-L6-v2",
          }),
          soul: expect.objectContaining({
            enabled: true,
            name: "Balanced partner",
            summary: expect.stringContaining("Lead with the answer"),
            communication_style: expect.arrayContaining([
              "Answer the core question first",
              "Give a clear next step",
            ]),
            avoid: expect.arrayContaining(["Do not use vague encouragement"]),
            imported_from: "manual",
            updated_at: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("SOUL.md 导入必须先预览，再应用到草稿并保存", async () => {
    const container = renderComponent();
    await flushEffects();
    await clickButtonByText(container, "Advanced");

    await act(async () => {
      changeTextareaValue(
        findTextareaByPlaceholder(container, "Paste SOUL.md content..."),
        `# Engineering Soul

- Style: direct and pragmatic
- Avoid vague encouragement
- npm run verify:local`,
      );
      await Promise.resolve();
    });

    await act(async () => {
      findButton(container, "Preview import").click();
      await Promise.resolve();
    });
    await flushEffects();

    expect(document.body.textContent).toContain("Import preview");
    expect(document.body.textContent).toContain(
      "Project rules or commands were detected",
    );
    expect(mockSaveConfig).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "Apply to draft").click();
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
          soul: expect.objectContaining({
            enabled: true,
            imported_from: "soul_md",
            name: "Engineering Soul",
            summary: expect.stringContaining("Style: direct and pragmatic"),
            communication_style: expect.arrayContaining([
              "Style: direct and pragmatic",
            ]),
          }),
        }),
      }),
    );
  });

  it("高级页应显示当前 SOUL.md 文件内容", async () => {
    mockGetConfig.mockResolvedValueOnce({
      memory: {
        enabled: true,
        max_entries: 1000,
        retention_days: 30,
        auto_cleanup: true,
        soul: {
          enabled: true,
          name: "Direct partner",
          summary: "Lead with the answer",
          communication_style: ["Call out weak assumptions"],
          avoid: ["No vague encouragement"],
          imported_from: "manual",
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

    renderComponent();
    await flushEffects();
    await clickButtonByText(document.body, "Advanced");

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("SOUL.md file content");
    expect(bodyText).toContain("# SOUL.md");
    expect(bodyText).toContain("Lead with the answer");
    expect(bodyText).toContain("Copy SOUL.md");
    expect(bodyText).not.toContain("Export SOUL.md");
  });

  it("重置个性后保存应关闭 Soul 且不清空嵌入配置", async () => {
    mockGetConfig.mockResolvedValueOnce({
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
        soul: {
          enabled: true,
          summary: "Lead with the answer",
          communication_style: ["Call out weak assumptions"],
          avoid: ["No vague encouragement"],
          imported_from: "manual",
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

    const container = renderComponent();
    await flushEffects();
    await clickButtonByText(container, "AI personality");

    expect(document.body.textContent).toContain("Lead with the answer");

    await act(async () => {
      findButton(container, "Reset personality").click();
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
          embedding: expect.objectContaining({
            provider: "auto",
            model: "all-MiniLM-L6-v2",
          }),
          soul: expect.objectContaining({
            enabled: false,
            imported_from: "manual",
          }),
        }),
      }),
    );
  });
});
