import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { MessageImage } from "../types";
import { MessageImageAttachments } from "./MessageImageAttachments";

vi.mock("@/lib/api/fileSystem", () => ({
  resolveLocalFilePreviewUrl: (path: string) => `asset://${path}`,
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

function renderAttachments(images: MessageImage[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<MessageImageAttachments images={images} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("MessageImageAttachments", () => {
  it("图片加载失败时应隐藏浏览器 alt 文本，只展示一处受控占位", () => {
    const container = renderAttachments([
      {
        data: "",
        mediaType: "image/png",
        sourceUri: "asset://missing-image.png",
      },
    ]);
    const image = container.querySelector(
      '[data-testid="message-image-attachment-0"]',
    );

    expect(image).not.toBeNull();

    act(() => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(
      container.querySelector(
        '[data-testid="message-image-attachment-unavailable-0"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("图片暂时无法显示");
    expect(container.textContent).not.toContain("图片附件");
  });
});
