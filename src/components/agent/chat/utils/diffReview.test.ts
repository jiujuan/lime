import { describe, expect, it } from "vitest";

import {
  buildDiffFileCanvasContent,
  buildDiffReviewFileTreeItems,
  buildDiffReviewScopeItems,
  buildDiffReviewSideBySideRows,
  parseApplyPatchReview,
  parseUnifiedDiffReview,
  resolveDiffReviewSummaryFromCandidates,
} from "./diffReview";

describe("diffReview", () => {
  it("应解析 apply_patch 补丁为文件级变更摘要", () => {
    const summary = parseApplyPatchReview(
      [
        "*** Begin Patch",
        "*** Update File: src/components/App.tsx",
        "@@",
        " const stable = true;",
        '-const title = "Old";',
        '+const title = "New";',
        '+const subtitle = "Ready";',
        "*** End Patch",
      ].join("\n"),
    );

    expect(summary).not.toBeNull();
    expect(summary?.files).toHaveLength(1);
    expect(summary?.files[0]?.path).toBe("src/components/App.tsx");
    expect(summary?.files[0]?.status).toBe("modified");
    expect(summary?.additions).toBe(2);
    expect(summary?.deletions).toBe(1);
    expect(summary?.hunks).toBe(1);
    expect(summary?.files[0]?.previewLines.map((line) => line.text)).toContain(
      'const subtitle = "Ready";',
    );
  });

  it("应解析 unified diff 并去掉 a/b 路径前缀", () => {
    const summary = parseUnifiedDiffReview(
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1,2 +1,3 @@",
        "-const count = 1;",
        "+const count = 2;",
        "+const enabled = true;",
        ' export const name = "lime";',
      ].join("\n"),
    );

    expect(summary).not.toBeNull();
    expect(summary?.files[0]?.path).toBe("src/app.ts");
    expect(summary?.files[0]?.status).toBe("modified");
    expect(summary?.additions).toBe(2);
    expect(summary?.deletions).toBe(1);
    expect(summary?.hunks).toBe(1);
    expect(summary?.files[0]?.lines.map((line) => line.text)).toContain(
      "const enabled = true;",
    );
    expect(summary?.files[0]?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "remove",
          oldLine: 1,
          text: "const count = 1;",
        }),
        expect.objectContaining({
          kind: "add",
          newLine: 1,
          text: "const count = 2;",
        }),
        expect.objectContaining({
          kind: "context",
          oldLine: 2,
          newLine: 3,
        }),
      ]),
    );
  });

  it("应把 runtime structured changes 转成可审阅摘要", () => {
    const summary = resolveDiffReviewSummaryFromCandidates(
      [
        null,
        {
          summary: "更新持久化快照入口",
          changes: ["新增查看快照详情按钮", "保留恢复前备份"],
        },
      ],
      { fallbackPath: "src/components/agent/chat/Panel.tsx" },
    );

    expect(summary).not.toBeNull();
    expect(summary?.files[0]?.path).toBe("src/components/agent/chat/Panel.tsx");
    expect(summary?.files[0]?.status).toBe("modified");
    expect(summary?.hunks).toBe(3);
    expect(summary?.files[0]?.previewLines.map((line) => line.text)).toContain(
      "保留恢复前备份",
    );
  });

  it("应把 artifact changedBlocks 转成变更行并保留计数", () => {
    const summary = resolveDiffReviewSummaryFromCandidates(
      [
        {
          changedBlocks: [
            {
              blockId: "intro",
              changeType: "updated",
              summary: "更新导语",
              beforeText: "旧导语",
              afterText: "新导语",
            },
            {
              blockId: "cta",
              changeType: "added",
              afterText: "新增下一步",
            },
          ],
          addedCount: 2,
          removedCount: 1,
          updatedCount: 1,
        },
      ],
      { fallbackPath: ".lime/artifacts/thread/demo.artifact.json" },
    );

    expect(summary).not.toBeNull();
    expect(summary?.files[0]?.path).toBe(
      ".lime/artifacts/thread/demo.artifact.json",
    );
    expect(summary?.additions).toBe(2);
    expect(summary?.deletions).toBe(1);
    expect(summary?.hunks).toBe(2);
    expect(summary?.files[0]?.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining(["更新导语", "旧导语", "新导语", "新增下一步"]),
    );
  });

  it("应按路径范围聚合变更范围并生成画布内容", () => {
    const summary = parseApplyPatchReview(
      [
        "*** Begin Patch",
        "*** Update File: src/components/App.tsx",
        "@@",
        '+const title = "New";',
        "*** Update File: src/components/Panel.tsx",
        "@@",
        "-const ready = false;",
        "+const ready = true;",
        "*** Update File: README.md",
        "@@",
        "+Lime supports diff review.",
        "*** End Patch",
      ].join("\n"),
    );

    expect(summary).not.toBeNull();
    const scopes = buildDiffReviewScopeItems(summary?.files ?? []);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "src/components",
          fileCount: 2,
          additions: 2,
          deletions: 1,
        }),
        expect.objectContaining({
          label: null,
          fileCount: 1,
          additions: 1,
          deletions: 0,
        }),
      ]),
    );

    const firstFile = summary?.files[0];
    expect(firstFile).toBeDefined();
    const canvas = buildDiffFileCanvasContent({
      file: firstFile!,
      title: "src/components/App.tsx 的变更审阅",
      statusLabel: "状态：修改",
      additionsLabel: "+1 行",
      deletionsLabel: "-0 行",
      hunksLabel: "1 处变更",
    });
    expect(canvas).toContain("# src/components/App.tsx 的变更审阅");
    expect(canvas).toContain("````diff");
    expect(canvas).toContain('+const title = "New";');
  });

  it("应按目录生成文件树汇总", () => {
    const summary = parseApplyPatchReview(
      [
        "*** Begin Patch",
        "*** Update File: src/components/App.tsx",
        "@@",
        '+const title = "New";',
        "*** Update File: src/components/chat/Panel.tsx",
        "@@",
        "-const oldPanel = true;",
        "+const newPanel = true;",
        "*** Update File: README.md",
        "@@",
        "+Lime supports file tree review.",
        "*** End Patch",
      ].join("\n"),
    );

    expect(summary).not.toBeNull();
    const treeItems = buildDiffReviewFileTreeItems(summary?.files ?? []);

    expect(treeItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "directory",
          path: "src",
          label: "src",
          depth: 0,
          fileCount: 2,
          additions: 2,
          deletions: 1,
        }),
        expect.objectContaining({
          kind: "directory",
          path: "src/components",
          label: "components",
          depth: 1,
          fileCount: 2,
          additions: 2,
          deletions: 1,
        }),
        expect.objectContaining({
          kind: "file",
          path: "README.md",
          label: "README.md",
          depth: 0,
          additions: 1,
          deletions: 0,
          status: "modified",
        }),
      ]),
    );
  });

  it("应生成 before/after 双栏行并合并相邻 remove/add 为修改行", () => {
    const summary = parseUnifiedDiffReview(
      [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1,3 +1,4 @@",
        ' export const name = "lime";',
        "-const count = 1;",
        "+const count = 2;",
        "+const enabled = true;",
        "-const stale = true;",
      ].join("\n"),
    );

    const file = summary?.files[0];
    expect(file).toBeDefined();
    const rows = buildDiffReviewSideBySideRows(file!);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "hunk",
          before: "@@ -1,3 +1,4 @@",
          after: "@@ -1,3 +1,4 @@",
        }),
        expect.objectContaining({
          kind: "context",
          before: 'export const name = "lime";',
          after: 'export const name = "lime";',
        }),
        expect.objectContaining({
          kind: "change",
          before: "const count = 1;",
          after: "const count = 2;",
        }),
        expect.objectContaining({
          kind: "add",
          before: null,
          after: "const enabled = true;",
        }),
        expect.objectContaining({
          kind: "remove",
          before: "const stale = true;",
          after: null,
        }),
      ]),
    );
  });
});
