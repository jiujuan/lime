import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { ConfirmDialog } from "./ConfirmDialog";

interface MountedDialog {
  container: HTMLDivElement;
  root: Root;
}

const mountedDialogs: MountedDialog[] = [];

function renderConfirmDialog() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ConfirmDialog
        isOpen={true}
        message="This cannot be undone."
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
  });

  mountedDialogs.push({ container, root });
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
  while (mountedDialogs.length > 0) {
    const mounted = mountedDialogs.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.replaceChildren();
  await changeLimeLocale("zh-CN");
});

describe("ConfirmDialog", () => {
  it("未传入显式文案时使用 common namespace 默认 chrome", () => {
    renderConfirmDialog();

    expect(document.body.textContent).toContain("Confirm action");
    expect(document.body.textContent).toContain("Cancel");
    expect(document.body.textContent).toContain("Confirm");
    expect(document.body.textContent).toContain("This cannot be undone.");
    expect(document.body.textContent).not.toContain("确认操作");
    expect(document.body.textContent).not.toContain("确定");
  });
});
