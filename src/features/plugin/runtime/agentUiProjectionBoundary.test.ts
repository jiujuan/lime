import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const RUNTIME_DIR = "src/features/plugin/runtime";
const FILES = {
  bridge: `${RUNTIME_DIR}/agentUiProjectionBridge.ts`,
  builders: `${RUNTIME_DIR}/agentUiProjectionBuilders.ts`,
  mapping: `${RUNTIME_DIR}/agentUiProjectionMapping.ts`,
  fieldReaders: `${RUNTIME_DIR}/agentUiProjectionFieldReaders.ts`,
  runtimeAdapter: `${RUNTIME_DIR}/agentUiRuntimeEventAdapter.ts`,
} as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function lineCount(source: string): number {
  return source.split(/\r?\n/).length;
}

describe("Plugin projection 边界", () => {
  it("bridge 只保留 task event normalization 和 facade，不重新承接 projection builders", () => {
    const source = readSource(FILES.bridge);

    expect(lineCount(source)).toBeLessThanOrEqual(160);
    expect(source).toContain("buildProjectionEvent");
    expect(source).toContain("agentUiProjectionEventToRuntimeEvent");
    expect(source).not.toContain("function buildBaseProjection");
    expect(source).not.toContain("function buildToolProjection");
    expect(source).not.toContain("function buildActionProjection");
    expect(source).not.toContain("function ownerForProjection");
    expect(source).not.toContain("function runtimeStatusForTaskStatus");
    expect(source).not.toContain("TEXT_PREVIEW_LIMIT");
  });

  it("projection builders / mapping / readers / adapter 都低于治理预警线", () => {
    const guardedFiles = [
      FILES.bridge,
      FILES.builders,
      FILES.mapping,
      FILES.fieldReaders,
      FILES.runtimeAdapter,
    ];

    const oversizedFiles = guardedFiles
      .map((file) => ({ file, lines: lineCount(readSource(file)) }))
      .filter(({ lines }) => lines >= 800);

    expect(oversizedFiles).toEqual([]);
  });

  it("mapping helper 不反向依赖 bridge 或 builders，避免形成新的事实源环", () => {
    const source = readSource(FILES.mapping);

    expect(source).not.toContain("./agentUiProjectionBridge");
    expect(source).not.toContain("./agentUiProjectionBuilders");
  });
});
