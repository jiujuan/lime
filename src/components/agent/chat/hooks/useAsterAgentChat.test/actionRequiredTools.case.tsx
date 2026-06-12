import { act } from "react";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  captureTurnStream,
  completedTurn,
  flushEffects,
  mountHook,
  seedSession,
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat action_required 渲染链路 - tools / artifacts", () => {
  it("收到 context_trace 事件后应写入当前 assistant 消息", async () => {
    const workspaceId = "ws-context-trace";
    seedSession(workspaceId, "session-context-trace");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("检查轨迹", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "context_trace",
          steps: [
            {
              stage: "memory_injection",
              detail: "query_len=8,injected=2",
            },
            {
              stage: "memory_injection",
              detail: "query_len=8,injected=2",
            },
          ],
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.contextTrace).toBeDefined();
      expect(assistantMessage?.contextTrace?.length).toBe(1);
      expect(assistantMessage?.contextTrace?.[0]?.stage).toBe(
        "memory_injection",
      );
    } finally {
      harness.unmount();
    }
  });

  it("收到带 Lime 元数据块的 tool_end 后应清洗输出并恢复失败态 metadata", async () => {
    const workspaceId = "ws-tool-metadata-block";
    seedSession(workspaceId, "session-tool-metadata-block");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("执行任务", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-meta-1",
          tool_name: "Agent",
          arguments: JSON.stringify({
            prompt: "检查 harness 缺口",
          }),
        });
      });

      act(() => {
        stream.emit({
          type: "tool_end",
          tool_id: "tool-meta-1",
          result: {
            success: true,
            output: [
              "子任务执行失败，需要人工接管",
              "",
              "[Lime 工具元数据开始]",
              JSON.stringify({
                reported_success: false,
                role: "planner",
                failed_count: 1,
              }),
              "[Lime 工具元数据结束]",
            ].join("\n"),
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");
      const toolCall = assistantMessage?.toolCalls?.find(
        (item) => item.id === "tool-meta-1",
      );

      expect(toolCall?.status).toBe("failed");
      expect(toolCall?.result?.output).toBe("子任务执行失败，需要人工接管");
      expect(toolCall?.result?.output).not.toContain("Lime 工具元数据");
      expect(toolCall?.result?.metadata).toMatchObject({
        reported_success: false,
        role: "planner",
        failed_count: 1,
      });
    } finally {
      harness.unmount();
    }
  });

  it("收到带 Lime 元数据块的 tool_end error 后应清洗错误文本并恢复失败态 metadata", async () => {
    const workspaceId = "ws-tool-metadata-error-block";
    seedSession(workspaceId, "session-tool-metadata-error-block");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("执行失败任务", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-meta-error-1",
          tool_name: "browser_navigate",
          arguments: JSON.stringify({
            url: "https://example.com",
          }),
        });
      });

      act(() => {
        stream.emit({
          type: "tool_end",
          tool_id: "tool-meta-error-1",
          result: {
            success: true,
            error: [
              "CDP 会话已断开，请重试",
              "",
              "[Lime 工具元数据开始]",
              JSON.stringify({
                reported_success: false,
                exit_code: 1,
                stderr_length: 128,
              }),
              "[Lime 工具元数据结束]",
            ].join("\n"),
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");
      const toolCall = assistantMessage?.toolCalls?.find(
        (item) => item.id === "tool-meta-error-1",
      );

      expect(toolCall?.status).toBe("failed");
      expect(toolCall?.result?.error).toBe("CDP 会话已断开，请重试");
      expect(toolCall?.result?.error).not.toContain("Lime 工具元数据");
      expect(toolCall?.result?.metadata).toMatchObject({
        reported_success: false,
        exit_code: 1,
        stderr_length: 128,
      });
    } finally {
      harness.unmount();
    }
  });

  it("write_file 工具启动时应为当前 assistant 消息挂载 streaming artifact", async () => {
    const workspaceId = "ws-artifact-tool-start";
    seedSession(workspaceId, "session-artifact-tool-start");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("生成文档", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-write-1",
          tool_name: "write_file",
          arguments: JSON.stringify({
            path: "notes/demo.md",
            content: "# Demo\n\nartifact body",
          }),
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        title: "demo.md",
        content: "# Demo\n\nartifact body",
        status: "streaming",
        meta: expect.objectContaining({
          filePath: "notes/demo.md",
          filename: "demo.md",
          source: "tool_start",
          sourceMessageId: assistantMessage?.id,
        }),
      });
    } finally {
      harness.unmount();
    }
  });

  it("write_file 工具启动时即使没有内容也应立即创建 preparing artifact 并触发 onWriteFile", async () => {
    const workspaceId = "ws-artifact-tool-start-preparing";
    seedSession(workspaceId, "session-artifact-tool-start-preparing");
    const onWriteFile = vi.fn();
    const harness = mountHook(workspaceId, { onWriteFile });
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("准备写入空文件", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-write-prepare-1",
          tool_name: "write_file",
          arguments: JSON.stringify({
            path: "notes/preparing.md",
          }),
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts).toHaveLength(1);
      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        title: "preparing.md",
        content: "",
        status: "streaming",
        meta: expect.objectContaining({
          filePath: "notes/preparing.md",
          writePhase: "preparing",
          source: "tool_start",
        }),
      });
      expect(onWriteFile).toHaveBeenCalledWith(
        "",
        "notes/preparing.md",
        expect.objectContaining({
          source: "tool_start",
          status: "streaming",
          metadata: expect.objectContaining({
            writePhase: "preparing",
            lastUpdateSource: "tool_start",
          }),
        }),
      );
    } finally {
      harness.unmount();
    }
  });

  it("write_file 工具启动时应递归识别嵌套参数中的协议路径", async () => {
    const workspaceId = "ws-artifact-tool-start-nested";
    seedSession(workspaceId, "session-artifact-tool-start-nested");
    const onWriteFile = vi.fn();
    const harness = mountHook(workspaceId, { onWriteFile });
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("生成嵌套文稿", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-write-nested-1",
          tool_name: "write_file",
          arguments: JSON.stringify({
            payload: {
              filePath: "notes/nested.md",
              content: "# Nested\n\nbody",
            },
          }),
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        title: "nested.md",
        content: "",
        status: "streaming",
        meta: expect.objectContaining({
          filePath: "notes/nested.md",
          writePhase: "preparing",
          source: "tool_start",
        }),
      });
      expect(onWriteFile).toHaveBeenCalledWith(
        "",
        "notes/nested.md",
        expect.objectContaining({
          source: "tool_start",
          status: "streaming",
        }),
      );
    } finally {
      harness.unmount();
    }
  });

  it("apply_patch 工具启动时应立即暴露目标文件，避免工作台空白等待", async () => {
    const workspaceId = "ws-artifact-apply-patch";
    seedSession(workspaceId, "session-artifact-apply-patch");
    const onWriteFile = vi.fn();
    const harness = mountHook(workspaceId, { onWriteFile });
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("补丁更新文档", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-apply-patch-1",
          tool_name: "apply_patch",
          arguments: JSON.stringify({
            patch: [
              "*** Begin Patch",
              "*** Update File: notes/patched.md",
              "@@",
              "-old",
              "+new",
              "*** End Patch",
            ].join("\n"),
          }),
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        title: "patched.md",
        content: "",
        status: "streaming",
        meta: expect.objectContaining({
          filePath: "notes/patched.md",
          writePhase: "preparing",
          source: "tool_start",
        }),
      });
      expect(onWriteFile).toHaveBeenCalledWith(
        "",
        "notes/patched.md",
        expect.objectContaining({
          source: "tool_start",
          status: "streaming",
        }),
      );
    } finally {
      harness.unmount();
    }
  });

  it("artifact_snapshot 完成后应在 turn_completed 时将 artifact 标记为 complete", async () => {
    const workspaceId = "ws-artifact-snapshot";
    seedSession(workspaceId, "session-artifact-snapshot");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("生成快照", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "artifact_snapshot",
          artifact: {
            artifactId: "artifact-snapshot-1",
            filePath: "notes/final.md",
            content: "# Final\n\nsnapshot body",
            metadata: {
              complete: false,
            },
          },
        });
      });

      let assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        id: "artifact-snapshot-1",
        title: "final.md",
        status: "streaming",
        content: "# Final\n\nsnapshot body",
        meta: expect.objectContaining({
          filePath: "notes/final.md",
          source: "artifact_snapshot",
        }),
      });

      act(() => {
        stream.emit({
          type: "turn_completed",
          turn: completedTurn(),
        });
      });

      assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts?.[0]?.status).toBe("complete");
    } finally {
      harness.unmount();
    }
  });

  it("artifact_snapshot 到来时应复用同路径 artifact 而不是重复新增", async () => {
    const workspaceId = "ws-artifact-snapshot-reuse";
    seedSession(workspaceId, "session-artifact-snapshot-reuse");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("生成复用快照", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-write-reuse-1",
          tool_name: "write_file",
          arguments: JSON.stringify({
            path: "notes/reuse.md",
          }),
        });
      });

      const initialAssistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");
      const initialArtifactId = initialAssistantMessage?.artifacts?.[0]?.id;

      act(() => {
        stream.emit({
          type: "artifact_snapshot",
          artifact: {
            artifactId: "server-artifact-id-1",
            filePath: "notes/reuse.md",
            content: "# Reused\n\nsnapshot body",
            metadata: {
              complete: false,
            },
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts).toHaveLength(1);
      expect(assistantMessage?.artifacts?.[0]?.id).toBe(initialArtifactId);
      expect(assistantMessage?.artifacts?.[0]).toMatchObject({
        content: "# Reused\n\nsnapshot body",
        meta: expect.objectContaining({
          writePhase: "streaming",
          source: "artifact_snapshot",
        }),
      });
    } finally {
      harness.unmount();
    }
  });

  it("空内容的图片 artifact_snapshot 不应进入通用 artifact 列表", async () => {
    const workspaceId = "ws-image-artifact-snapshot-skip";
    seedSession(workspaceId, "session-image-artifact-snapshot-skip");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("生成图片", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "artifact_snapshot",
          artifact: {
            artifactId: "artifact-image-output-1",
            filePath: "/tmp/lime/output_image.jpg",
            content: "",
            metadata: {
              complete: true,
            },
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.artifacts || []).toHaveLength(0);
    } finally {
      harness.unmount();
    }
  });

  it("搜索工具来源应在后续 artifact_snapshot 中沉淀到同一文档", async () => {
    const workspaceId = "ws-artifact-sources-before-snapshot";
    seedSession(workspaceId, "session-artifact-sources-before-snapshot");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("先搜索再生成报告", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-search-1",
          tool_name: "WebSearch",
          arguments: JSON.stringify({
            query: "Artifact First 来源面板",
          }),
        });
      });

      act(() => {
        stream.emit({
          type: "tool_end",
          tool_id: "tool-search-1",
          result: {
            success: true,
            output: JSON.stringify({
              results: [
                {
                  title: "Artifact 来源指南",
                  url: "https://example.com/artifact-sources",
                  snippet: "统一来源与版本展示。",
                },
              ],
            }),
          },
        });
      });

      act(() => {
        stream.emit({
          type: "artifact_snapshot",
          artifact: {
            artifactId: "artifact-doc-search-1",
            filePath: ".lime/artifacts/thread-1/source-report.artifact.json",
            content: JSON.stringify({
              schemaVersion: "artifact_document.v1",
              artifactId: "artifact-doc-search-1",
              kind: "analysis",
              title: "来源报告",
              status: "ready",
              language: "zh-CN",
              summary: "先搜索后成文。",
              blocks: [
                {
                  id: "body-1",
                  type: "rich_text",
                  contentFormat: "markdown",
                  content: "正文内容",
                  markdown: "正文内容",
                },
              ],
              sources: [],
              metadata: {},
            }),
            metadata: {
              complete: false,
            },
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");
      const artifactDocument = JSON.parse(
        assistantMessage?.artifacts?.[0]?.content || "{}",
      ) as {
        sources?: Array<{ locator?: { url?: string } }>;
      };

      expect(artifactDocument.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            locator: expect.objectContaining({
              url: "https://example.com/artifact-sources",
            }),
          }),
        ]),
      );
    } finally {
      harness.unmount();
    }
  });

  it("已有 artifact_snapshot 也应在后续 tool_end 时补齐来源", async () => {
    const workspaceId = "ws-artifact-sources-after-snapshot";
    seedSession(workspaceId, "session-artifact-sources-after-snapshot");
    const harness = mountHook(workspaceId);
    const stream = captureTurnStream();

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("先写报告再补来源", [], false, false, false, "react");
      });

      act(() => {
        stream.emit({
          type: "artifact_snapshot",
          artifact: {
            artifactId: "artifact-doc-search-2",
            filePath: ".lime/artifacts/thread-1/source-report-2.artifact.json",
            content: JSON.stringify({
              schemaVersion: "artifact_document.v1",
              artifactId: "artifact-doc-search-2",
              kind: "analysis",
              title: "来源报告 2",
              status: "ready",
              language: "zh-CN",
              summary: "先成文后补来源。",
              blocks: [
                {
                  id: "body-1",
                  type: "rich_text",
                  contentFormat: "markdown",
                  content: "正文内容",
                  markdown: "正文内容",
                },
              ],
              sources: [],
              metadata: {},
            }),
            metadata: {
              complete: false,
            },
          },
        });
      });

      act(() => {
        stream.emit({
          type: "tool_start",
          tool_id: "tool-search-2",
          tool_name: "WebSearch",
          arguments: JSON.stringify({
            query: "Artifact First 浏览器引用",
          }),
        });
      });

      act(() => {
        stream.emit({
          type: "tool_end",
          tool_id: "tool-search-2",
          result: {
            success: true,
            output: JSON.stringify({
              results: [
                {
                  title: "Browser Assist 文档",
                  url: "https://example.com/browser-assist",
                  snippet: "浏览器结果也应进入来源抽屉。",
                },
              ],
            }),
          },
        });
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");
      const artifactDocument = JSON.parse(
        assistantMessage?.artifacts?.[0]?.content || "{}",
      ) as {
        sources?: Array<{ locator?: { url?: string } }>;
      };

      expect(artifactDocument.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            locator: expect.objectContaining({
              url: "https://example.com/browser-assist",
            }),
          }),
        ]),
      );
    } finally {
      harness.unmount();
    }
  });
});
