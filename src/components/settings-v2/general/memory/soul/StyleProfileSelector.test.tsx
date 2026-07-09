import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { StyleProfileSelector } from "./StyleProfileSelector";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderSelector(
  value?: string | null,
  props: Partial<ComponentProps<typeof StyleProfileSelector>> = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <StyleProfileSelector
        value={value}
        onChange={vi.fn()}
        {...props}
      />,
    );
  });
  mounted.push({ container, root });
  return container;
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

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("StyleProfileSelector", () => {
  it("未安装的已保存 profile 不应静默选中默认 built-in profile", () => {
    const container = renderSelector("local_sassy_executor");

    expect(
      container.querySelector(
        '[data-testid="settings-memory-soul-style-profile-missing"]',
      )?.textContent,
    ).toContain("local_sassy_executor");
    expect(
      container
        .querySelector(
          '[data-testid="settings-memory-soul-style-profile-cheeky_sassy_executor"]',
        )
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("本地风格包管理按钮应调用 current API 回调", () => {
    const onSetPackStatus = vi.fn();
    const onUninstallPack = vi.fn();
    const container = renderSelector(null, {
      installedPacks: [
        {
          packId: "com.example.soul.local-sassy",
          source: "local_import",
          status: "disabled",
          profileIds: ["local_sassy_executor"],
          manifestSource: "{}",
          localeSources: {},
        },
      ],
      onSetPackStatus,
      onUninstallPack,
    });

    expect(document.body.textContent).toContain("Local style packs");
    expect(document.body.textContent).toContain("com.example.soul.local-sassy");

    act(() => {
      findButton(container, "Enable").click();
    });
    expect(onSetPackStatus).toHaveBeenCalledWith(
      "com.example.soul.local-sassy",
      "enabled",
    );

    act(() => {
      findButton(container, "Uninstall").click();
    });
    expect(onUninstallPack).toHaveBeenCalledWith(
      "com.example.soul.local-sassy",
    );
  });
});
