import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const EXPORT_CLIENT_SOURCE = "src/lib/api/agentRuntime/exportClient.ts";
const PRODUCTION_SCAN_ROOTS = ["src", "packages"];
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const LEGACY_AGENT_RUNTIME_EXPORT_COMMAND =
  /\bagent_runtime_export_[a-z0-9_]+\b/u;

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function extensionOf(path: string): string {
  const match = path.match(/\.[^.]+$/u);
  return match?.[0] ?? "";
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "build" ||
        entry === "coverage"
      ) {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (stat.isFile() && SOURCE_EXTENSIONS.has(extensionOf(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isProductionSource(path: string): boolean {
  return (
    !path.includes("/__tests__/") &&
    !path.includes("/fixtures/") &&
    !path.includes("/src/lib/governance/") &&
    !path.endsWith(".test.ts") &&
    !path.endsWith(".test.tsx") &&
    !path.endsWith(".spec.ts") &&
    !path.endsWith(".spec.tsx")
  );
}

function extractFunctionBody(source: string, functionName: string): string {
  const sourceFile = ts.createSourceFile(
    EXPORT_CLIENT_SOURCE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let body = "";
  function visit(node: ts.Node): void {
    if (body) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      body = node.body?.getText(sourceFile) ?? "";
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return body;
}

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

function assertInOrder(source: string, snippets: string[]): void {
  let cursor = 0;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, cursor);
    expect(index, `缺少或乱序片段：${snippet}`).toBeGreaterThanOrEqual(0);
    cursor = index + snippet.length;
  }
}

describe("Agent runtime export boundary", () => {
  it("evidence export 应固定走 App Server evidence/export 并进入严格 projection", () => {
    const source = readRepoFile(EXPORT_CLIENT_SOURCE);
    const functionBody = extractFunctionBody(
      source,
      "exportAgentRuntimeEvidencePack",
    );

    expect(functionBody).not.toBe("");
    assertInOrder(functionBody, [
      "appServerClient.exportEvidence({",
      "sessionId: normalizedSessionId",
      "includeEvents: true",
      "includeArtifacts: true",
      "includeEvidencePack: true",
    ]);
    expect(functionBody).toMatch(
      /projectAppServerEvidenceExportToRuntimeEvidencePack\s*\(\s*response\.result\s*\)/u,
    );
    expect(functionBody).not.toMatch(LEGACY_AGENT_RUNTIME_EXPORT_COMMAND);
    expect(functionBody).not.toContain("normalizeEvidencePack(");
  });

  it("派生导出必须校验返回制品仍属于请求 session", () => {
    const source = readRepoFile(EXPORT_CLIENT_SOURCE);

    expect(source).toContain("function assertRuntimeExportSessionCorrelation");
    expect(countOccurrences(source, "assertRuntimeExportSessionCorrelation(")).toBe(
      6,
    );

    for (const [functionName, methodName] of [
      [
        "exportAgentRuntimeHandoffBundle",
        "APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT",
      ],
      [
        "exportAgentRuntimeAnalysisHandoff",
        "APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT",
      ],
      [
        "exportAgentRuntimeReviewDecisionTemplate",
        "APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT",
      ],
      [
        "saveAgentRuntimeReviewDecision",
        "APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE",
      ],
      [
        "exportAgentRuntimeReplayCase",
        "APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT",
      ],
    ] as const) {
      const functionBody = extractFunctionBody(source, functionName);

      expect(functionBody, `${functionName} 不存在`).not.toBe("");
      assertInOrder(functionBody, [
        "assertRuntimeExportResult(",
        "assertRuntimeExportSessionCorrelation(",
        methodName,
        "normalizedSessionId",
      ]);
    }
  });

  it("生产源码不得重新调用 agent_runtime_export_* legacy command", () => {
    const offenders = PRODUCTION_SCAN_ROOTS.flatMap((root) =>
      collectSourceFiles(join(REPO_ROOT, root)),
    )
      .map((file) => ({
        path: repoRelative(file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ path }) => isProductionSource(path))
      .flatMap(({ path, source }) => {
        const matches = [...source.matchAll(/agent_runtime_export_[a-z0-9_]+/gu)];
        return matches.map((match) => `${path}: ${match[0]}`);
      });

    expect(
      offenders,
      "agent_runtime_export_* 只能作为测试 / retired guard / 诊断夹具出现；生产 evidence / replay / handoff 导出必须走 App Server current methods",
    ).toEqual([]);
  });
});
