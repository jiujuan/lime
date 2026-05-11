import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { ImportExportDialog } from "./ImportExportDialog";

interface MountedRoot {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedRoot[] = [];

function renderDialog(
  props?: Partial<React.ComponentProps<typeof ImportExportDialog>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onExport = vi.fn().mockResolvedValue('{"providers":[]}');
  const onImport = vi.fn().mockResolvedValue({
    success: true,
    imported_providers: 2,
    imported_api_keys: 0,
    skipped_providers: 1,
    errors: [],
  });
  const onClose = vi.fn();
  const effectiveOnExport = props?.onExport ?? onExport;
  const effectiveOnImport = props?.onImport ?? onImport;
  const effectiveOnClose = props?.onClose ?? onClose;

  act(() => {
    root.render(
      <ImportExportDialog
        isOpen
        onClose={effectiveOnClose}
        onExport={effectiveOnExport}
        onImport={effectiveOnImport}
        {...props}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return {
    onExport: effectiveOnExport,
    onImport: effectiveOnImport,
    onClose: effectiveOnClose,
  };
}

function findByTestId<T extends HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`未找到 data-testid=${testId} 的节点`);
  }
  return element as T;
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(textarea, "value")?.set;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(textarea),
    "value",
  )?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

async function flushEffects(times = 2) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.style.overflow = "";
  await changeLimeLocale("zh-CN");
  vi.clearAllMocks();
});

describe("ImportExportDialog", () => {
  it("导出页展示 key-based 文案并生成导出配置", async () => {
    const { onExport } = renderDialog();

    expect(document.body.textContent ?? "").toContain(
      "导入/导出 Provider 配置",
    );
    expect(document.body.textContent ?? "").toContain(
      "包含 API Key 元数据（别名、启用状态，不包含实际 Key 值）",
    );
    expect(document.body.textContent ?? "").toContain("生成导出配置");

    await act(async () => {
      findByTestId<HTMLButtonElement>("export-button").click();
      await Promise.resolve();
    });

    expect(onExport).toHaveBeenCalledWith(false);
    expect(
      findByTestId<HTMLTextAreaElement>("export-config-textarea").value,
    ).toBe('{"providers":[]}');
    expect(document.body.textContent ?? "").toContain("复制");
    expect(document.body.textContent ?? "").toContain("下载文件");
  });

  it("导入页展示结果摘要并使用插值文案", async () => {
    const { onImport } = renderDialog({
      onImport: vi.fn().mockResolvedValue({
        success: false,
        imported_providers: 1,
        imported_api_keys: 0,
        skipped_providers: 2,
        errors: ["OpenAI 已存在"],
      }),
    });

    await act(async () => {
      findByTestId<HTMLButtonElement>("import-tab").click();
      await Promise.resolve();
    });

    expect(document.body.textContent ?? "").toContain("选择文件");
    expect(document.body.textContent ?? "").toContain("或粘贴配置 JSON");

    await act(async () => {
      setTextareaValue(
        findByTestId<HTMLTextAreaElement>("import-config-textarea"),
        '{"version":"1.0","providers":[]}',
      );
      await flushEffects(4);
    });

    await act(async () => {
      findByTestId<HTMLButtonElement>("import-button").click();
      await flushEffects(4);
    });

    expect(onImport).toHaveBeenCalledWith('{"version":"1.0","providers":[]}');
    expect(document.body.textContent ?? "").toContain("导入部分完成");
    expect(document.body.textContent ?? "").toContain("导入 Provider: 1 个");
    expect(document.body.textContent ?? "").toContain("跳过（已存在）: 2 个");
    expect(document.body.textContent ?? "").toContain("错误: OpenAI 已存在");
  });
});
