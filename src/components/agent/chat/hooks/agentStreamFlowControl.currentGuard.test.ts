import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

function readProductionHookSources() {
  const hooksDir = join(process.cwd(), "src/components/agent/chat/hooks");
  return readdirSync(hooksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /\.(ts|tsx)$/.test(entry.name))
    .filter(
      (entry) =>
        !/\.test\.|\.unit\.test\.|\.component\.test\./.test(entry.name),
    )
    .map((entry) => ({
      name: entry.name,
      source: readFileSync(join(hooksDir, entry.name), "utf8"),
    }));
}

function readProductionAgentChatSources() {
  const root = join(process.cwd(), "src/components/agent/chat");
  const files: Array<{ relativePath: string; source: string }> = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }
      if (/\.test\.|\.unit\.test\.|\.component\.test\./.test(entry.name)) {
        continue;
      }
      files.push({
        relativePath: relative(process.cwd(), absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  };
  visit(root);
  return files;
}

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("agentStreamFlowControl current runtime boundary", () => {
  it("queue / steer / draft 生产写入口必须停留在 current owner inventory", () => {
    const ownerInventory = new Map<string, Set<string>>([
      [
        "inputRestoreDraft",
        new Set([
          "src/components/agent/chat/components/EmptyState.tsx",
          "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.ts",
          "src/components/agent/chat/hooks/agentChatShared.ts",
          "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts",
          "src/components/agent/chat/hooks/handleSendTypes.ts",
          "src/components/agent/chat/hooks/useAgentStream.ts",
        ]),
      ],
      [
        "resolveQueuedTurnsForRestore",
        new Set([
          "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
          "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
        ]),
      ],
      [
        "resolveInterruptedInputRestorePlan",
        new Set([
          "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
          "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
        ]),
      ],
      [
        "setQueuedTurns(",
        new Set([
          "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
          "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
          "src/components/agent/chat/hooks/useAgentSession.ts",
        ]),
      ],
      [
        "upsertQueuedTurnSnapshot",
        new Set([
          "src/components/agent/chat/hooks/agentQueuedTurnProjection.ts",
          "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
          "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
        ]),
      ],
      [
        "removeQueuedTurnSnapshots",
        new Set([
          "src/components/agent/chat/hooks/agentQueuedTurnProjection.ts",
          "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
          "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
        ]),
      ],
    ]);

    const offenders: string[] = [];
    for (const { relativePath, source } of readProductionAgentChatSources()) {
      for (const [pattern, allowedFiles] of ownerInventory) {
        if (source.includes(pattern) && !allowedFiles.has(relativePath)) {
          offenders.push(`${pattern}: ${relativePath}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("停止恢复 queued draft 必须走 current read model 能力，不允许 optional runtime fallback", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
      ),
      "utf8",
    );
    const restorePlanSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
      ),
      "utf8",
    );

    expect(source).toContain("resolveQueuedTurnsForRestore({");
    expect(restorePlanSource).toContain("runtime.getSessionReadModel");
    expect(source).not.toContain("typeof runtime.getSessionReadModel");
    expect(source).not.toContain('getSessionReadModel === "function"');
    expect(source).not.toContain("setQueuedTurns");
    expect(source).not.toContain("removeQueuedTurnFromState");
    expect(source).not.toContain(
      "setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));",
    );
  });

  it("queued turn 本地删除只能由 queue lifecycle event 投影触发", () => {
    const lifecycleEventsSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamRuntimeLifecycleEvents.ts",
      ),
      "utf8",
    );
    const runtimeActionsSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts",
      ),
      "utf8",
    );
    const runtimeHandlerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts",
      ),
      "utf8",
    );
    const submitFailureSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamSubmitFailure.ts",
      ),
      "utf8",
    );
    const submissionLifecycleSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
      ),
      "utf8",
    );
    const resumeBindingSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
      ),
      "utf8",
    );
    const queuedTurnProjectionSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/hooks/agentQueuedTurnProjection.ts",
      ),
      "utf8",
    );

    expect(lifecycleEventsSource).toContain('case "queue_removed"');
    expect(lifecycleEventsSource).toContain('case "queue_started"');
    expect(lifecycleEventsSource).toContain('case "queue_cleared"');
    expect(lifecycleEventsSource).toContain("removeQueuedTurnsFromProjection");
    for (const { name, source } of readProductionHookSources()) {
      expect(source, name).not.toContain("removeQueuedTurnState");
    }
    expect(runtimeActionsSource).not.toContain("removeQueuedTurnState");
    expect(runtimeHandlerSource).not.toContain(
      "removeQueuedTurnState(emptyFinalErrorPlan.queuedTurnIds)",
    );
    expect(runtimeHandlerSource).not.toContain(
      "removeQueuedTurnState(errorFailurePlan.queuedTurnIds)",
    );
    expect(submitFailureSource).not.toContain("removeQueuedTurnState");
    expect(submissionLifecycleSource).toContain("upsertQueuedTurnSnapshot");
    expect(submissionLifecycleSource).toContain("removeQueuedTurnSnapshots");
    expect(resumeBindingSource).toContain("upsertQueuedTurnSnapshot");
    expect(resumeBindingSource).toContain("removeQueuedTurnSnapshots");
    expect(submissionLifecycleSource).not.toContain(".sort((left, right)");
    expect(resumeBindingSource).not.toContain(".sort((left, right)");
    expect(submissionLifecycleSource).not.toContain("new Set(queuedTurnIds)");
    expect(resumeBindingSource).not.toContain("new Set(queuedTurnIds)");
    expect(submissionLifecycleSource).not.toContain("position: index + 1");
    expect(resumeBindingSource).not.toContain("position: index + 1");
    expect(queuedTurnProjectionSource).not.toContain("position: index + 1");
  });

  it("queued turn 状态写入只能来自 read model snapshot 或 queue event projection owner", () => {
    const allowedSetQueuedTurnsPatterns = new Map<string, Set<string>>([
      [
        "agentStreamSubmissionLifecycle.ts",
        new Set([
          "setQueuedTurns((prev) => upsertQueuedTurnSnapshot(prev, nextQueuedTurn));",
          "setQueuedTurns((prev) => removeQueuedTurnSnapshots(prev, queuedTurnIds));",
        ]),
      ],
      [
        "agentStreamResumeBinding.ts",
        new Set([
          "setQueuedTurns((prev) => upsertQueuedTurnSnapshot(prev, queuedTurn));",
          "setQueuedTurns((prev) => removeQueuedTurnSnapshots(prev, queuedTurnIds));",
        ]),
      ],
      [
        "useAgentSession.ts",
        new Set([
          "setQueuedTurns(stableSnapshot.queuedTurns);",
          "setQueuedTurns(snapshot.queuedTurns);",
        ]),
      ],
    ]);

    const offenders: string[] = [];
    for (const { name, source } of readProductionHookSources()) {
      const allowedPatterns =
        allowedSetQueuedTurnsPatterns.get(name) ?? new Set();
      for (const match of source.matchAll(
        /setQueuedTurns\([^;\n]+(?:\n\s*[^;\n]+)*;/g,
      )) {
        const statement = match[0].replace(/\s+/g, " ").trim();
        const isAllowed = [...allowedPatterns].some(
          (pattern) => pattern.replace(/\s+/g, " ").trim() === statement,
        );
        if (!isAllowed) {
          offenders.push(`${name}: ${statement}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("queue projection 旁路只能产生活动投影 / 摘要 / refresh，不允许成为 queuedTurns 或输入恢复事实源", () => {
    const projectionSources = new Map([
      [
        "src/components/agent/chat/projection/queueProjection.ts",
        readSource("src/components/agent/chat/projection/queueProjection.ts"),
      ],
      [
        "packages/agent-runtime-projection/src/queueEvents.ts",
        readSource("packages/agent-runtime-projection/src/queueEvents.ts"),
      ],
      [
        "src/components/agent/chat/projection/agentUiEventProjection.ts",
        readSource(
          "src/components/agent/chat/projection/agentUiEventProjection.ts",
        ),
      ],
      [
        "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts",
        readSource(
          "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts",
        ),
      ],
    ]);

    for (const [name, source] of projectionSources) {
      expect(source, name).not.toContain("setQueuedTurns");
      expect(source, name).not.toContain("upsertQueuedTurnSnapshot");
      expect(source, name).not.toContain("removeQueuedTurnSnapshots");
      expect(source, name).not.toContain("resolveQueuedTurnsForRestore");
      expect(source, name).not.toContain("resolveInterruptedInputRestorePlan");
      expect(source, name).not.toContain("setInput(draft.text)");
      expect(source, name).not.toContain("replacePendingImages");
      expect(source, name).not.toContain("position: index + 1");
      expect(source, name).not.toContain(".sort((left, right)");
    }
  });

  it("input restore policy 必须停留在小模块，flow control 只做编排", () => {
    const flowControlSource = readSource(
      "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
    );
    const restorePlanSource = readSource(
      "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
    );
    const policyTestSource = readSource(
      "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts",
    );

    expect(restorePlanSource).toContain(
      "export function resolveInterruptedInputRestorePlan",
    );
    expect(policyTestSource).toContain('from "./agentStreamInputRestorePlan"');
    expect(flowControlSource).toContain('from "./agentStreamInputRestorePlan"');
    expect(flowControlSource).not.toContain(
      "function normalizeQueuedTurnImage",
    );
    expect(flowControlSource).not.toContain(
      "function queuedTurnToInterruptedInputDraft",
    );
    expect(flowControlSource).not.toContain(
      "function sortQueuedTurnsForRestore",
    );
    expect(flowControlSource).not.toContain(
      "export function resolveInterruptedInputRestorePlan",
    );
  });
});
