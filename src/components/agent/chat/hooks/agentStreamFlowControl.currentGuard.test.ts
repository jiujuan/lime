import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("停止恢复只处理当前 submitted draft，不读取 queued turn 作为第二事实源", () => {
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

    expect(source).not.toContain("queuedTurns:");
    expect(source).not.toContain("resolveQueuedTurnsForRestore({");
    expect(restorePlanSource).not.toContain("resolveQueuedTurnsForRestore");
    expect(restorePlanSource).not.toContain("QueuedTurnSnapshot");
    expect(restorePlanSource).not.toContain("runtime.getSessionReadModel");
    expect(source).not.toContain("typeof runtime.getSessionReadModel");
    expect(source).not.toContain('getSessionReadModel === "function"');
    expect(source).not.toContain("setQueuedTurns");
    expect(source).not.toContain("removeQueuedTurnFromState");
    expect(source).not.toContain(
      "setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));",
    );
  });

  it("停止恢复不得驱动 queued turn 本地删除", () => {
    const runtimeLifecycleSource = readFileSync(
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
    for (const { name, source } of readProductionHookSources()) {
      expect(source, name).not.toContain("removeQueuedTurnState");
    }
    for (const retiredQueueEvent of [
      "queue_added",
      "queue_removed",
      "queue_started",
      "queue_cleared",
      "handleAgentStreamQueueEvent",
      "removeQueuedTurnsFromProjection",
    ]) {
      expect(runtimeLifecycleSource).not.toContain(retiredQueueEvent);
    }
    expect(runtimeActionsSource).not.toContain("removeQueuedTurnState");
    expect(runtimeHandlerSource).not.toContain(
      "removeQueuedTurnState(emptyFinalErrorPlan.queuedTurnIds)",
    );
    expect(runtimeHandlerSource).not.toContain(
      "removeQueuedTurnState(errorFailurePlan.queuedTurnIds)",
    );
    expect(submitFailureSource).not.toContain("removeQueuedTurnState");
    for (const source of [submissionLifecycleSource, resumeBindingSource]) {
      expect(source).not.toContain("upsertQueuedTurnSnapshot");
      expect(source).not.toContain("removeQueuedTurnSnapshots");
      expect(source).not.toContain("QueuedTurnSnapshot");
      expect(source).not.toContain("setQueuedTurns");
    }
  });

  it("send/lifecycle 不得重建 Renderer queued-turn 状态 owner", () => {
    for (const relativePath of [
      "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
      "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
      "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts",
      "src/components/agent/chat/hooks/agentStreamUserInputSubmission.ts",
    ]) {
      const source = readSource(relativePath);
      expect(source, relativePath).not.toContain("setQueuedTurns");
      expect(source, relativePath).not.toContain("QueuedTurnSnapshot");
      expect(source, relativePath).not.toContain("expectingQueue");
    }
  });

  it("已删除的 queue projection 旁路不得回流", () => {
    for (const relativePath of [
      "src/components/agent/chat/projection/queueProjection.ts",
      "packages/agent-runtime-projection/src/queueEvents.ts",
      "src/components/agent/chat/hooks/agentQueuedTurnProjection.ts",
      "src/components/agent/chat/hooks/agentQueuedTurnProjection.unit.test.ts",
    ]) {
      expect(existsSync(join(process.cwd(), relativePath)), relativePath).toBe(
        false,
      );
    }
    const projectionSources = new Map([
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
      expect(source, name).not.toContain("buildQueueProjectionEvents");
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
