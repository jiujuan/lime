import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import type { Message } from "../types";
import {
  MediaReferencePreviewPaginationActions,
} from "./mediaReferencePreviewToolbarActions";
import {
  resolveMediaReferencePreviewPageOpenRequest,
  resolveMediaReferencePreviewPageRequest,
} from "./mediaReferencePreviewToolbarState";

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
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

function createArtifact(
  meta: Partial<Artifact["meta"]> = {},
): Artifact {
  return {
    id: "media-preview-page",
    type: "document",
    title: "image.png",
    content: "",
    status: "complete",
    meta: {
      previewArtifact: true,
      mediaPreviewRequiresPagination: true,
      mediaPreviewCanReadPreviousPage: true,
      mediaPreviewCanReadNextPage: true,
      mediaPreviewPreviousOffset: 0,
      mediaPreviewNextOffset: 8,
      mediaPreviewChunkBytes: 4,
      mediaPreviewPageLength: 4,
      mediaPreviewPageIndex: 2,
      messageId: "assistant-media",
      contentPartIndex: 0,
      mediaKind: "image",
      mediaUri: "sidecar://media/image.png",
      mediaMimeType: "image/png",
      mediaSha256: "sha256-media",
      mediaByteSize: 12,
      sidecarRef: {
        ref: "sidecar://media/image.png",
      },
      ...meta,
    },
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function createMessage(): Message {
  return {
    id: "assistant-media",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-07-07T00:00:00.000Z"),
  };
}

function renderActions(artifact: Artifact, onOpenPage = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ container, root });

  act(() => {
    root.render(
      <MediaReferencePreviewPaginationActions
        artifact={artifact}
        onOpenPage={onOpenPage}
      />,
    );
  });

  return { container, onOpenPage };
}

describe("mediaReferencePreviewToolbarActions", () => {
  it("从 artifact metadata 还原 media reference page request", () => {
    const artifact = createArtifact();
    const request = resolveMediaReferencePreviewPageRequest(artifact, [
      createMessage(),
    ]);

    expect(request?.message.id).toBe("assistant-media");
    expect(request?.target).toMatchObject({
      kind: "media_reference",
      index: 0,
      reference: {
        kind: "image",
        uri: "sidecar://media/image.png",
        mimeType: "image/png",
        sha256: "sha256-media",
        byteSize: 12,
      },
    });
  });

  it("根据 previous / next facts 生成 page open request", () => {
    const artifact = createArtifact();

    expect(
      resolveMediaReferencePreviewPageOpenRequest(artifact, "previous"),
    ).toEqual({
      offset: 0,
      length: 4,
    });
    expect(
      resolveMediaReferencePreviewPageOpenRequest(artifact, "next"),
    ).toEqual({
      offset: 8,
      length: 4,
    });
  });

  it("渲染图标分页按钮并触发下一段读取", () => {
    const artifact = createArtifact({
      mediaPreviewCanReadPreviousPage: false,
      mediaPreviewPreviousOffset: undefined,
    });
    const { container, onOpenPage } = renderActions(artifact);

    const previousButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="读取上一段媒体"]',
    );
    const nextButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="读取下一段媒体"]',
    );
    expect(previousButton?.disabled).toBe(true);
    expect(nextButton?.disabled).toBe(false);

    act(() => {
      nextButton?.click();
    });

    expect(onOpenPage).toHaveBeenCalledWith({
      offset: 8,
      length: 4,
    });
  });

  it("非分页 media artifact 不渲染 toolbar actions", () => {
    const { container } = renderActions(
      createArtifact({ mediaPreviewRequiresPagination: false }),
    );

    expect(
      container.querySelector(
        '[data-testid="media-reference-preview-pagination-actions"]',
      ),
    ).toBeNull();
  });
});
