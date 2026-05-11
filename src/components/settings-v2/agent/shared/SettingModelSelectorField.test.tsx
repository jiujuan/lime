import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { SettingModelSelectorField } from "./SettingModelSelectorField";

vi.mock("@/components/input-kit", () => ({
  ModelSelector: ({ placeholderLabel }: { placeholderLabel?: string }) => (
    <div data-testid="model-selector">{placeholderLabel}</div>
  ),
}));

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
    root.render(
      <SettingModelSelectorField
        label="Default model"
        description="Use a configured model."
        providerType=""
        setProviderType={vi.fn()}
        model=""
        setModel={vi.fn()}
      />,
    );
  });

  mounted.push({ container, root });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("en-US");
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

describe("SettingModelSelectorField", () => {
  it("默认占位文案应来自 settings namespace", () => {
    const container = renderComponent();

    expect(container.textContent).toContain("Auto select");
    expect(container.textContent).not.toContain("自动选择");
    expect(container.textContent).not.toContain("settings.mediaGeneration");
  });
});
