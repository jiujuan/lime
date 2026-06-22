import { describe, expect, it } from "vitest";
import {
  buildWorkspaceRightSurfaceFilePreviewIntents,
  buildWorkspaceRightSurfaceHarnessPendingIntents,
  buildWorkspaceRightSurfaceMcpShellOutputIntents,
  buildWorkspaceRightSurfaceObjectCanvasCandidateIntents,
  buildWorkspaceRightSurfaceRuntimeOpenIntents,
} from "./rightSurfaceRuntimeAdapter";

describe("rightSurfaceRuntimeAdapter", () => {
  it("应把 runtime / skill / MCP 打开信号转换为统一 surface intent", () => {
    const intents = buildWorkspaceRightSurfaceRuntimeOpenIntents([
      {
        id: "skill:file-preview",
        kind: "files",
        origin: "skill",
        createdAt: 100,
        reason: "file_preview_ready",
      },
      {
        id: "mcp:shell-output",
        kind: "shell",
        origin: "mcpTool",
        priority: "foreground",
        createdAt: 110,
        ttlMs: 5_000,
      },
    ]);

    expect(intents).toHaveLength(2);
    expect(intents[0]).toMatchObject({
      id: "skill:file-preview",
      priority: "background",
      createdAt: 100,
      command: {
        action: "open",
        kind: "files",
        origin: "skill",
        reason: "file_preview_ready",
      },
    });
    expect(intents[1]).toMatchObject({
      id: "mcp:shell-output",
      priority: "foreground",
      ttlMs: 5_000,
      command: {
        action: "open",
        kind: "shell",
        origin: "mcpTool",
      },
    });
  });

  it("应把 Harness pending 数量投影为右侧 surface badge intent", () => {
    const intents = buildWorkspaceRightSurfaceHarnessPendingIntents({
      enabled: true,
      pendingCount: 2,
      createdAt: 120,
    });

    expect(intents.map((intent) => intent.id)).toEqual([
      "runtime:harness:pending:1",
      "runtime:harness:pending:2",
    ]);
    expect(intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priority: "background",
          ttlMs: 60_000,
          command: expect.objectContaining({
            action: "open",
            kind: "harness",
            origin: "runtime",
            reason: "harness_pending_approval",
          }),
        }),
      ]),
    );
  });

  it("禁用或无 pending 时不应生成 Harness badge intent", () => {
    expect(
      buildWorkspaceRightSurfaceHarnessPendingIntents({
        enabled: false,
        pendingCount: 2,
        createdAt: 120,
      }),
    ).toEqual([]);
    expect(
      buildWorkspaceRightSurfaceHarnessPendingIntents({
        enabled: true,
        pendingCount: 0,
        createdAt: 120,
      }),
    ).toEqual([]);
  });

  it("应把文件预览目标投影为 files surface pending intent", () => {
    const intents = buildWorkspaceRightSurfaceFilePreviewIntents({
      enabled: true,
      relativePath: " drafts\\result.md ",
      createdAt: 140,
    });

    expect(intents).toEqual([
      expect.objectContaining({
        id: "runtime:file-preview:drafts/result.md",
        priority: "background",
        ttlMs: 60_000,
        command: expect.objectContaining({
          action: "open",
          kind: "files",
          origin: "runtime",
          reason: "file_preview_ready",
        }),
      }),
    ]);
  });

  it("文件预览目标为空或禁用时不应生成 intent", () => {
    expect(
      buildWorkspaceRightSurfaceFilePreviewIntents({
        enabled: true,
        relativePath: " ",
        createdAt: 140,
      }),
    ).toEqual([]);
    expect(
      buildWorkspaceRightSurfaceFilePreviewIntents({
        enabled: false,
        relativePath: "drafts/result.md",
        createdAt: 140,
      }),
    ).toEqual([]);
  });

  it("应把 MCP shell 输出投影为 shell surface pending intent", () => {
    const intents = buildWorkspaceRightSurfaceMcpShellOutputIntents({
      enabled: true,
      outputId: " turn 42 ",
      createdAt: 160,
      priority: "foreground",
    });

    expect(intents).toEqual([
      expect.objectContaining({
        id: "mcp:shell-output:turn-42",
        priority: "foreground",
        ttlMs: 60_000,
        command: expect.objectContaining({
          action: "open",
          kind: "shell",
          origin: "mcpTool",
          reason: "mcp_shell_output_ready",
        }),
      }),
    ]);
  });

  it("应把 objectCanvas 候选投影为 objectCanvas surface pending intent", () => {
    const intents = buildWorkspaceRightSurfaceObjectCanvasCandidateIntents({
      enabled: true,
      candidateId: "diagram candidate",
      origin: "skill",
      createdAt: 180,
    });

    expect(intents).toEqual([
      expect.objectContaining({
        id: "skill:object-canvas:diagram-candidate",
        priority: "background",
        ttlMs: 60_000,
        command: expect.objectContaining({
          action: "open",
          kind: "objectCanvas",
          origin: "skill",
          reason: "object_canvas_candidate_ready",
        }),
      }),
    ]);
  });

  it("shell 输出或 objectCanvas 候选为空时不应生成 intent", () => {
    expect(
      buildWorkspaceRightSurfaceMcpShellOutputIntents({
        enabled: true,
        outputId: "",
        createdAt: 160,
      }),
    ).toEqual([]);
    expect(
      buildWorkspaceRightSurfaceObjectCanvasCandidateIntents({
        enabled: false,
        candidateId: "candidate",
        createdAt: 180,
      }),
    ).toEqual([]);
  });
});
