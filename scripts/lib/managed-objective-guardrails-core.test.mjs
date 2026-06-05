import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  managedObjectiveForbiddenSurfaceTokens,
  managedObjectiveToolSurfaceForbiddenCommands,
  scanManagedObjectiveForbiddenSurfaces,
  scanManagedObjectiveToolSurfaceCommands,
} from "./managed-objective-guardrails-core.mjs";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

function createTempRepo() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-managed-objective-guardrails-"),
  );
  tempDirs.push(tempDir);
  return tempDir;
}

function writeFile(repoRoot, relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("managed-objective-guardrails-core", () => {
  it("应在实现路径里阻断禁用的 parallel objective runtime 命名", () => {
    const repoRoot = createTempRepo();
    writeFile(
      repoRoot,
      "src/runtime/parallel.ts",
      "export const name = 'objective' + '_queue';\n",
    );
    writeFile(
      repoRoot,
      "src/runtime/direct.ts",
      "export const surface = 'objective_queue';\n",
    );
    writeFile(
      repoRoot,
      "internal/roadmap.md",
      "文档允许讨论 objective_queue 为什么禁止。\n",
    );

    expect(
      scanManagedObjectiveForbiddenSurfaces({ repoRoot }).map((item) => item),
    ).toEqual([
      {
        relativePath: "src/runtime/direct.ts",
        token: "objective_queue",
      },
    ]);
  });

  it("默认扫描当前仓库实现路径时不应出现禁用命名", () => {
    expect(scanManagedObjectiveForbiddenSurfaces()).toEqual([]);
  });

  it("禁用 surface 列表应覆盖路线图第 10 节约束", () => {
    expect(managedObjectiveForbiddenSurfaceTokens()).toEqual([
      "goal_runtime",
      "objective_scheduler",
      "objective_queue",
      "objective_evidence_pack",
    ]);
  });

  it("应阻断模型工具面暴露 objective mutation 命令", () => {
    const repoRoot = createTempRepo();
    writeFile(
      repoRoot,
      "lime-rs/src/agent_tools/catalog.rs",
      'const TOOL: &str = "agent_runtime_set_objective";\n',
    );
    writeFile(
      repoRoot,
      "src/lib/api/agentRuntime/objectiveClient.ts",
      'export const command = "agent_runtime_set_objective";\n',
    );

    expect(scanManagedObjectiveToolSurfaceCommands({ repoRoot })).toEqual([
      {
        relativePath: "lime-rs/src/agent_tools/catalog.rs",
        token: "agent_runtime_set_objective",
      },
    ]);
  });

  it("默认扫描当前仓库模型工具面时不应出现 objective 命令", () => {
    expect(scanManagedObjectiveToolSurfaceCommands()).toEqual([]);
  });

  it("模型工具面禁用命令列表应覆盖 GUI current objective 命令面", () => {
    expect(managedObjectiveToolSurfaceForbiddenCommands()).toEqual([
      "agent_runtime_get_objective",
      "agent_runtime_set_objective",
      "agent_runtime_update_objective_status",
      "agent_runtime_clear_objective",
      "agent_runtime_continue_objective",
      "agent_runtime_audit_objective",
    ]);
  });
});
