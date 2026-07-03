import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const UI_DIR = "src/features/plugin/ui";
const FILES = {
  drawer: `${UI_DIR}/AgentRunHostDrawer.tsx`,
  fallback: `${UI_DIR}/AgentRunHostDrawerFallback.tsx`,
  projectionInput: `${UI_DIR}/AgentRunHostDrawerProjectionInput.ts`,
} as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function lineCount(source: string): number {
  return source.split(/\r?\n/).length;
}

describe("AgentRunHostDrawer 边界", () => {
  it("主抽屉只承接宿主壳和标准 projection 接线，不直接渲染本地 process 组件", () => {
    const source = readSource(FILES.drawer);

    expect(lineCount(source)).toBeLessThanOrEqual(500);
    expect(source).toContain("AgentRunProjectionPanel");
    expect(source).toContain("buildSharedProjectionInput");
    expect(source).not.toContain("InlineToolProcessStep");
    expect(source).not.toContain("MarkdownRenderer");
    expect(source).not.toContain("ThinkingBlock");
  });

  it("主抽屉不再调用本地 process fallback，空态也交给标准 projection", () => {
    const source = readSource(FILES.drawer);

    expect(source).not.toContain("AgentRunLocalProcessFallback");
    expect(source).not.toContain("AgentRunFactRail");
    expect(source).not.toContain("AgentRunHostDrawerFallback");
    expect(source).not.toContain("shouldRenderLocalProcessFallback");
    expect(source).not.toContain("shouldRenderProjection ? (");
  });

  it("退场中的 fallback 和 projection input enrichment 保持为独立小模块", () => {
    const fallbackSource = readSource(FILES.fallback);
    const projectionInputSource = readSource(FILES.projectionInput);

    expect(lineCount(fallbackSource)).toBeLessThan(800);
    expect(lineCount(projectionInputSource)).toBeLessThan(800);
    expect(fallbackSource).toContain("InlineToolProcessStep");
    expect(fallbackSource).toContain("MarkdownRenderer");
    expect(projectionInputSource).toContain("buildSharedProjectionInput");
  });
});
