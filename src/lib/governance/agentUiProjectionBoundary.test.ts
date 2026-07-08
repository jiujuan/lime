import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const AGENT_UI_EVENT_PROJECTION =
  "src/components/agent/chat/projection/agentUiEventProjection.ts";

const ALLOWED_RELATIVE_IMPORTS = new Map<string, Set<string>>([
  ["./actionProjection", new Set(["buildActionProjectionEvents"])],
  ["./artifactProjection", new Set(["buildArtifactProjectionEvents"])],
  [
    "./conversationEventProjection",
    new Set(["buildConversationProjectionEvents"]),
  ],
  ["./contextProjection", new Set(["buildTurnContextEvents"])],
  ["./diagnosticProjection", new Set(["buildDiagnosticProjectionEvents"])],
  ["./projectionBase", new Set(["sequenceProjectionEvents"])],
  ["./queueProjection", new Set(["buildQueueProjectionEvents"])],
  ["./routingProjection", new Set(["buildRoutingProjectionEvents"])],
  ["./runtimeLifecycleProjection", new Set(["buildRuntimeLifecycleEvents"])],
  ["./subagentStatusProjection", new Set(["buildSubagentProjectionEvents"])],
  ["./threadItemProjection", new Set(["buildThreadItemProjectionEvents"])],
  ["./toolEventProjection", new Set(["buildToolProjectionEvents"])],
]);

const FORBIDDEN_DIRECT_BUILDER_SNIPPETS = [
  "buildActionRequiredEvent",
  "buildActionResolvedEvent",
  "buildArtifactEvent",
  "buildContextTraceEvent",
  "buildRequestedFixExecutionEventsFromArtifact",
  "buildMessageSnapshotEvent",
  "buildTextDeltaEvent",
  "buildThinkingDeltaEvent",
  "buildCostMetricEvent",
  "buildWarningEvent",
  "buildQueueAddedEvents",
  "buildQueueLifecycleEvents",
  "buildRoutingProjectionEvent",
  "buildModelEffectiveEvent",
  "buildModelChangeEvent",
  "buildRunCanceledEvent",
  "buildRunFailedEvent",
  "buildRunFinishedEvent",
  "buildRuntimeStatusEvents",
  "buildTaskProfileResolvedEvent",
  "buildThreadStartedEvent",
  "buildTurnStartedEvent",
  "buildSubagentStatusChangedEvents",
  "buildThreadItemEvents",
  "buildToolEndEvents",
  "buildToolInputDeltaEvent",
  "buildToolOutputDeltaEvent",
  "buildToolProgressEvent",
  "buildToolStartEvents",
];

function readProjectionSource(): string {
  return readFileSync(join(REPO_ROOT, AGENT_UI_EVENT_PROJECTION), "utf8");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importedNames(node: ts.ImportDeclaration): string[] {
  const importClause = node.importClause;
  if (!importClause) {
    return [];
  }

  const names: string[] = [];
  if (importClause.name) {
    names.push(importClause.name.text);
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return names;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    names.push(namedBindings.name.text);
    return names;
  }

  return [
    ...names,
    ...namedBindings.elements.map(
      (element) => element.propertyName?.text ?? element.name.text,
    ),
  ];
}

describe("Agent UI projection boundary", () => {
  it("聚合器只能导入 owner dispatcher，不应回流单个 adapter builder", () => {
    const source = readProjectionSource();
    const sourceFile = ts.createSourceFile(
      AGENT_UI_EVENT_PROJECTION,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const offenders: Array<{
      module: string;
      imported: string[];
      allowed?: string[];
    }> = [];

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }

      const moduleName = statement.moduleSpecifier.text;
      if (!moduleName.startsWith(".")) {
        continue;
      }

      const imported = importedNames(statement);
      const allowed = ALLOWED_RELATIVE_IMPORTS.get(moduleName);
      if (!allowed) {
        offenders.push({ module: moduleName, imported });
        continue;
      }

      const unexpected = imported.filter((name) => !allowed.has(name));
      if (unexpected.length > 0) {
        offenders.push({
          module: moduleName,
          imported: unexpected,
          allowed: [...allowed],
        });
      }
    }

    expect(
      offenders,
      "agentUiEventProjection.ts 只能做事件族委托和 sequence 编排；单个 adapter builder 必须留在各 projection owner",
    ).toEqual([]);
  });

  it("聚合器不得重新直接组装 projection 事件或拆 item 参数", () => {
    const source = readProjectionSource();
    const sourceFile = ts.createSourceFile(
      AGENT_UI_EVENT_PROJECTION,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const forbiddenHits = FORBIDDEN_DIRECT_BUILDER_SNIPPETS.filter((snippet) =>
      new RegExp(`\\b${escapeRegExp(snippet)}\\b`).test(source),
    );
    const nonEmptyArrayReturns: string[] = [];

    function visit(node: ts.Node): void {
      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        ts.isArrayLiteralExpression(node.expression) &&
        node.expression.elements.length > 0
      ) {
        nonEmptyArrayReturns.push(node.getText(sourceFile));
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    expect(source).not.toContain('from "@limecloud/agent-runtime-projection"');
    expect(nonEmptyArrayReturns).toEqual([]);
    expect(source).not.toContain("event.item");
    expect(
      forbiddenHits,
      "agentUiEventProjection.ts 不得重新 import 单个 builder；新增事件族先进入对应 owner，再由聚合器委托",
    ).toEqual([]);
  });
});
