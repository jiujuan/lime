import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import { messageContentPartsFromAgentThreadItem } from "./agentThreadMessageContentParts";

type AgentMessageItem = Extract<AgentThreadItem, { type: "agent_message" }>;

function agentMessageItem(
  overrides: Partial<AgentMessageItem> = {},
): AgentMessageItem {
  return {
    id: "agent-message-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    type: "agent_message",
    status: "completed",
    sequence: 7,
    text: "",
    phase: "final_answer",
    started_at: "2026-07-07T10:00:00.000Z",
    updated_at: "2026-07-07T10:00:01.000Z",
    completed_at: "2026-07-07T10:00:01.000Z",
    ...overrides,
  };
}

describe("messageContentPartsFromAgentThreadItem", () => {
  it("把 App Server media contentParts 转成 GUI media reference", () => {
    const parts = messageContentPartsFromAgentThreadItem(
      agentMessageItem({
        contentParts: [
          {
            type: "text",
            text: "图片已生成。",
          },
          {
            type: "media",
            kind: "image",
            caption: "结果图",
            reference: {
              uri: "sidecar://media/image-1",
              mime_type: "image/png",
              title: "image-1.png",
              source_uri: "sidecar://media/image-1",
              source_path: "/tmp/lime-media/image-1.png",
              preview_url: "asset:///tmp/lime-media/image-1.png",
              sha256: "sha256-image-1",
              byte_size: 2048,
            },
          },
        ],
      }),
    );

    expect(parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "图片已生成。",
        metadata: expect.objectContaining({
          source: "agent_text_delta",
          itemId: "agent-message-1",
          turnId: "turn-1",
          sequence: 7,
          contentPartIndex: 0,
        }),
      }),
      expect.objectContaining({
        type: "media_reference",
        reference: {
          kind: "image",
          uri: "sidecar://media/image-1",
          mimeType: "image/png",
          title: "image-1.png",
          caption: "结果图",
          sourceUri: "sidecar://media/image-1",
          sourcePath: "/tmp/lime-media/image-1.png",
          previewUrl: "asset:///tmp/lime-media/image-1.png",
          sha256: "sha256-image-1",
          byteSize: 2048,
        },
        metadata: expect.objectContaining({
          source: "agent_media_reference",
          itemId: "agent-message-1",
          threadItemId: "agent-message-1",
          turnId: "turn-1",
          sequence: 7,
          contentPartIndex: 1,
          referenceUri: "sidecar://media/image-1",
          mediaKind: "image",
          mimeType: "image/png",
          sourceUri: "sidecar://media/image-1",
          sourcePath: "/tmp/lime-media/image-1.png",
          previewUrl: "asset:///tmp/lime-media/image-1.png",
        }),
      }),
    ]);
  });

  it("丢弃 inline data source owner，避免 GUI 消费 provider payload", () => {
    const parts = messageContentPartsFromAgentThreadItem(
      agentMessageItem({
        contentParts: [
          {
            type: "media",
            kind: "image",
            caption: "结果图",
            reference: {
              uri: "sidecar://media/image-1",
              mime_type: "image/png",
              source_uri: "data:image/png;base64,AAAA",
              preview_url: "data:image/png;base64,BBBB",
            },
          },
        ],
      }),
    );

    expect(parts).toEqual([
      expect.objectContaining({
        type: "media_reference",
        reference: expect.not.objectContaining({
          sourceUri: expect.any(String),
          previewUrl: expect.any(String),
        }),
        metadata: expect.not.objectContaining({
          sourceUri: expect.any(String),
          previewUrl: expect.any(String),
        }),
      }),
    ]);
  });

  it("拒绝 inline data URI，避免 GUI 消费 provider wire payload", () => {
    const parts = messageContentPartsFromAgentThreadItem(
      agentMessageItem({
        contentParts: [
          {
            type: "media",
            kind: "image",
            caption: "不应展示",
            reference: {
              uri: "data:image/png;base64,AAAA",
              mime_type: "image/png",
            },
          },
        ],
      }),
    );

    expect(parts).toEqual([]);
  });
});
