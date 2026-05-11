import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  ShortcutSettings,
  type ShortcutSettingsProps,
} from "./ShortcutSettings";

interface MountedShortcutSettings {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedShortcutSettings[] = [];

function renderShortcutSettings(
  props: Partial<ShortcutSettingsProps> = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ShortcutSettings
        currentShortcut=""
        onShortcutChange={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`未找到按钮：${text}`);
  }
  return button;
}

describe("ShortcutSettings", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => mounted.root.unmount());
      mounted.container.remove();
    }
    document.body.replaceChildren();
    await changeLimeLocale("zh-CN");
  });

  it("快捷键设置 chrome 文案应走 common namespace 英文资源", () => {
    const container = renderShortcutSettings({
      allowClear: true,
      currentShortcut: "CommandOrControl+K",
    });

    expect(container.textContent).toContain("Shortcut");
    expect(container.textContent).toContain("Clear");
    expect(container.textContent).toContain("Edit");
    expect(container.textContent).not.toContain("快捷键");
    expect(container.textContent).not.toContain("修改");

    act(() => findButtonByText(container, "Edit").click());

    expect(container.textContent).toContain("Press a shortcut combination...");
    expect(container.textContent).toContain(
      "Press the shortcut combination you want to use. Press ESC to cancel.",
    );
    expect(container.querySelector('button[title="Save"]')).toBeTruthy();
    expect(container.querySelector('button[title="Cancel"]')).toBeTruthy();
  });

  it("快捷键校验失败时应展示英文资源错误", async () => {
    const onShortcutChange = vi.fn().mockResolvedValue(undefined);
    const onValidate = vi.fn().mockResolvedValue(false);
    const container = renderShortcutSettings({
      onShortcutChange,
      onValidate,
    });

    act(() => findButtonByText(container, "Edit").click());
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: "k",
        }),
      );
    });

    const saveButton = container.querySelector('button[title="Save"]');
    if (!(saveButton instanceof HTMLButtonElement)) {
      throw new Error("未找到保存按钮");
    }

    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });

    expect(onValidate).toHaveBeenCalledWith("CommandOrControl+K");
    expect(onShortcutChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Invalid shortcut format");
    expect(container.textContent).not.toContain("快捷键格式无效");
  });
});
