import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SUBAGENT_CONTROL_SYMBOLS = [
  "closeAgentRuntimeSubagent",
  "resumeAgentRuntimeSubagent",
  "sendAgentRuntimeSubagentInput",
  "spawnAgentRuntimeSubagent",
  "waitAgentRuntimeSubagents",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function expectRetiredSubagentTopLevelExportsAbsent(source: string): void {
  expect(source).not.toContain("export const {");
  expect(source).not.toContain("export declare const");
  for (const symbol of SUBAGENT_CONTROL_SYMBOLS) {
    expect(source).not.toContain(`export const ${symbol}`);
    expect(source).not.toContain(`export declare const ${symbol}`);
    expect(source).not.toContain(`export function ${symbol}`);
    expect(source).not.toContain(`export declare function ${symbol}`);
  }
}

describe("agentRuntime subagentClient current boundary", () => {
  it("public subagent facade 只保留 fail-closed 工厂，不再暴露顶层 helper", () => {
    const source = readRepoFile("src/lib/api/agentRuntime/subagentClient.ts");
    const declarations = readRepoFile(
      "src/lib/api/agentRuntime/subagentClient.d.ts",
    );

    expect(source).toContain("createSubagentClient");
    expect(source).toContain("public subagent control must use App Server");
    expect(source).not.toContain("invokeCommand(");
    expect(source).not.toContain("safeInvoke(");
    expectRetiredSubagentTopLevelExportsAbsent(source);
    expectRetiredSubagentTopLevelExportsAbsent(declarations);
  });

  it("agentRuntime 聚合入口不再暴露 retired public subagent surface", () => {
    const source = readRepoFile("src/lib/api/agentRuntime/index.ts");
    const declarations = readRepoFile("src/lib/api/agentRuntime/index.d.ts");

    expect(source).not.toContain("./subagentClient");
    expect(declarations).not.toContain("./subagentClient");
    expect(source).not.toContain("createSubagentClient");
    expect(declarations).not.toContain("createSubagentClient");
    for (const symbol of SUBAGENT_CONTROL_SYMBOLS) {
      expect(source).not.toContain(symbol);
      expect(declarations).not.toContain(symbol);
    }
  });

  it("createAgentRuntimeClient 不再混入 retired public subagent 方法", () => {
    const source = readRepoFile("src/lib/api/agentRuntime/clientFactory.ts");
    const declarations = readRepoFile(
      "src/lib/api/agentRuntime/clientFactory.d.ts",
    );

    expect(source).not.toContain("createSubagentClient");
    expect(source).not.toContain("./subagentClient");
    for (const symbol of SUBAGENT_CONTROL_SYMBOLS) {
      expect(source).not.toContain(symbol);
      expect(declarations).not.toContain(symbol);
    }
  });
});
