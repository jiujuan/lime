import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockClearLogs, mockGetLogs, mockGetPersistedLogsTail } = vi.hoisted(
  () => ({
    mockClearLogs: vi.fn(),
    mockGetLogs: vi.fn(),
    mockGetPersistedLogsTail: vi.fn(),
  }),
);

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

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  await changeLimeLocale("en-US");
  vi.spyOn(window, "setInterval").mockReturnValue(
    undefined as unknown as ReturnType<typeof window.setInterval>,
  );

  mockGetLogs.mockReturnValue(new Promise(() => undefined));
  mockGetPersistedLogsTail.mockReturnValue(new Promise(() => undefined));
  mockClearLogs.mockReturnValue(new Promise(() => undefined));
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
  vi.restoreAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("ChannelLogTailPanel", () => {
  it("应通过 settings namespace 渲染英文日志 Tail 文案", () => {
    const container = renderComponent();
    const text = container.textContent ?? "";

    expect(text).toContain("Channel Log Tail");
    expect(text).toContain("Filter Mode");
    expect(text).toContain("Copy View");
    expect(text).toContain("Loading...");
    expect(text).not.toContain("渠道日志 Tail");
    expect(text).not.toContain("settings.channels.logTail");
  });

  it("当前视图为空时应渲染可翻译的复制提示", () => {
    const container = renderComponent();

    act(() => {
      findButton(container, "Copy View").click();
    });

    expect(container.textContent).toContain(
      "No logs to copy in the current view",
    );
  });

  it("清空日志时应使用 settings namespace 的确认文案", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderComponent();

    act(() => {
      findButton(container, "Clear Logs").click();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      "Clear logs?\nThis will clear current in-memory logs, the current log file, and historical channel diagnostic logs. This cannot be undone.",
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

    expect(container.textContent).toContain(
      "Invalid regex. Falling back to no filter.",
    );
  });
});
