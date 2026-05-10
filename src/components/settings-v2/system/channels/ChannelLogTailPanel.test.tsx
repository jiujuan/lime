import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseTranslation } = vi.hoisted(() => ({
  mockUseTranslation: vi.fn((_namespace?: string) => ({
    i18n: { language: "zh-CN" },
    t: (key: string, options?: unknown) => {
      if (typeof options === "string") {
        return options;
      }

      if (options && typeof options === "object") {
        const values = options as Record<string, unknown>;
        const template =
          typeof values.defaultValue === "string" ? values.defaultValue : key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
          String(values[name] ?? ""),
        );
      }

      return key;
    },
  })),
}));

const { mockClearLogs, mockGetLogs, mockGetPersistedLogsTail } = vi.hoisted(
  () => ({
    mockClearLogs: vi.fn(),
    mockGetLogs: vi.fn(),
    mockGetPersistedLogsTail: vi.fn(),
  }),
);

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

vi.mock("@/lib/api/logs", () => ({
  clearLogs: mockClearLogs,
  getLogs: mockGetLogs,
  getPersistedLogsTail: mockGetPersistedLogsTail,
}));

import { ChannelLogTailPanel } from "./ChannelLogTailPanel";

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
    root.render(<ChannelLogTailPanel />);
  });

  mounted.push({ container, root });
  return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }

  return button as HTMLButtonElement;
}

function findSelect(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector("select");
  if (!select) {
    throw new Error("未找到过滤模式选择器");
  }
  return select;
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (!nativeSetter) {
    throw new Error("未找到 select value setter");
  }

  nativeSetter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!nativeSetter) {
    throw new Error("未找到 input value setter");
  }

  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  vi.spyOn(window, "setInterval").mockReturnValue(
    undefined as unknown as ReturnType<typeof window.setInterval>,
  );

  mockGetLogs.mockReturnValue(new Promise(() => undefined));
  mockGetPersistedLogsTail.mockReturnValue(new Promise(() => undefined));
  mockClearLogs.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
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
  vi.restoreAllMocks();
});

describe("ChannelLogTailPanel", () => {
  it("应通过 settings namespace 渲染日志 Tail 文案", () => {
    const container = renderComponent();
    const text = container.textContent ?? "";

    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(text).toContain("渠道日志 Tail");
    expect(text).toContain("过滤模式");
    expect(text).toContain("复制视图");
    expect(text).toContain("加载中...");
  });

  it("当前视图为空时应渲染可翻译的复制提示", () => {
    const container = renderComponent();

    act(() => {
      findButton(container, "复制视图").click();
    });

    expect(container.textContent).toContain("当前无可复制日志");
  });

  it("清空日志时应使用 settings namespace 的确认文案", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderComponent();

    act(() => {
      findButton(container, "清空日志").click();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      "确认清空日志吗？\n这会清空当前内存日志、当前日志文件以及历史渠道诊断日志，且无法恢复。",
    );
    expect(mockClearLogs).toHaveBeenCalledTimes(1);
  });

  it("自定义正则非法时应渲染可翻译的错误提示", () => {
    const container = renderComponent();

    act(() => {
      setSelectValue(findSelect(container), "custom");
    });

    const input = Array.from(container.querySelectorAll("input")).find(
      (item) => item.type === "text",
    );
    expect(input).toBeInstanceOf(HTMLInputElement);

    act(() => {
      setInputValue(input as HTMLInputElement, "[invalid");
    });

    expect(container.textContent).toContain("正则表达式无效，已回退为不过滤");
  });
});
