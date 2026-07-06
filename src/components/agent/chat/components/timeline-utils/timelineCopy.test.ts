import { afterEach, describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import type { AgentThreadItem } from "../../types";
import type { AgentThreadOrderedBlock } from "../../utils/agentThreadGrouping";
import {
  extractCompactThinkingParts,
  resolveBlockSummaryLines,
  resolveCompactTechnicalSummary,
  resolveProcessMixLabel,
} from "./blockResolvers";
import {
  resolveItemStatusLabel,
  resolveSubagentStatusLabel,
} from "./statusMapping";

const THREAD_TIMELINE_COPY_KEYS = [
  "agentChat.threadTimeline.alert.failed",
  "agentChat.threadTimeline.alert.warning",
  "agentChat.threadTimeline.approval.completed",
  "agentChat.threadTimeline.approval.pending",
  "agentChat.threadTimeline.contextCompaction.detail.completed",
  "agentChat.threadTimeline.contextCompaction.detail.running",
  "agentChat.threadTimeline.contextCompaction.title.completed",
  "agentChat.threadTimeline.contextCompaction.title.running",
  "agentChat.threadTimeline.contextCompaction.trigger.auto",
  "agentChat.threadTimeline.contextCompaction.trigger.default",
  "agentChat.threadTimeline.contextCompaction.trigger.manual",
  "agentChat.threadTimeline.contextCompaction.trigger.overflow",
  "agentChat.threadTimeline.hint.pausedDetail",
  "agentChat.threadTimeline.hint.pendingDetail",
  "agentChat.threadTimeline.hint.runtimeConfirmationPending",
  "agentChat.threadTimeline.hint.runtimeConfirmationSubmitted",
  "agentChat.threadTimeline.plan.title.completed",
  "agentChat.threadTimeline.plan.title.running",
  "agentChat.threadTimeline.preview.alert.knownPrefixes",
  "agentChat.threadTimeline.preview.alert.prefix",
  "agentChat.threadTimeline.preview.approval.knownPrefixes",
  "agentChat.threadTimeline.preview.approval.prefix",
  "agentChat.threadTimeline.preview.artifact.knownPrefixes",
  "agentChat.threadTimeline.preview.artifact.prefix",
  "agentChat.threadTimeline.processMix.separator",
  "agentChat.threadTimeline.processMix.thinking",
  "agentChat.threadTimeline.processMix.tools",
  "agentChat.threadTimeline.reasoning.title.completed",
  "agentChat.threadTimeline.reasoning.title.running",
  "agentChat.threadTimeline.status.completed",
  "agentChat.threadTimeline.status.confirmed",
  "agentChat.threadTimeline.status.failed",
  "agentChat.threadTimeline.status.paused",
  "agentChat.threadTimeline.status.pending",
  "agentChat.threadTimeline.status.running",
  "agentChat.threadTimeline.technicalSummary",
  "agentChat.threadTimeline.turnSummary.title.completed",
  "agentChat.threadTimeline.turnSummary.title.running",
] as const;

function item(overrides: Partial<AgentThreadItem>): AgentThreadItem {
  return {
    id: "item-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-05-30T00:00:00.000Z",
    updated_at: "2026-05-30T00:00:00.000Z",
    completed_at: "2026-05-30T00:00:01.000Z",
    type: "tool_call",
    tool_name: "read_file",
    ...overrides,
  } as AgentThreadItem;
}

function block(
  overrides: Partial<AgentThreadOrderedBlock>,
): AgentThreadOrderedBlock {
  return {
    id: "block-1",
    kind: "process",
    title: "Process",
    status: "completed",
    items: [],
    previewLines: [],
    countLabel: "",
    rawDetailLabel: "",
    defaultExpanded: false,
    startedAt: "2026-05-30T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(async () => {
  await changeLimeLocale("zh-CN");
});

describe("timeline copy", () => {
  it("基础 timeline copy 应覆盖五语言资源", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const resource = loadNamespaceResource(locale, "agent");
      for (const key of THREAD_TIMELINE_COPY_KEYS) {
        expect(resource[key], `${locale} ${key}`).toEqual(expect.any(String));
        expect(resource[key]?.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("timeline resolver 应跟随当前语言资源，不回落到硬编码中文", async () => {
    await changeLimeLocale("en-US");
    const processBlock = block({
      items: [
        item({
          id: "tool-1",
          type: "tool_call",
          tool_name: "read_file",
        }),
        item({
          id: "reasoning-1",
          sequence: 2,
          type: "reasoning",
          text: "",
        }),
      ],
    });

    expect(resolveItemStatusLabel("in_progress")).toBe("Running");
    expect(resolveSubagentStatusLabel("queued", "in_progress")).toBe("Queued");
    expect(resolveCompactTechnicalSummary(processBlock)).toBe(
      "Processed 2 steps",
    );
    expect(resolveProcessMixLabel(processBlock)).toBe(
      "1 tool steps, 1 reasoning notes",
    );
    expect(
      resolveBlockSummaryLines(
        block({
          kind: "approval",
          status: "completed",
          items: [
            item({
              type: "request_user_input",
              request_id: "request-1",
              action_type: "ask_user",
              prompt: "",
            }),
          ],
        }),
      ),
    ).toEqual(["This step is confirmed"]);
    expect(
      resolveBlockSummaryLines(
        block({
          kind: "artifact",
          items: [
            item({
              type: "file_artifact",
              path: "publish.md",
              content: "",
            }),
          ],
          previewLines: ["publish.md"],
        }),
      ),
    ).toEqual(["Produced publish.md"]);
  });

  it("上下文压缩 compact row 应使用 timeline copy", async () => {
    await changeLimeLocale("en-US");

    expect(
      extractCompactThinkingParts(
        item({
          type: "context_compaction",
          trigger: "manual",
          stage: "completed",
        }) as Extract<AgentThreadItem, { type: "context_compaction" }>,
      ),
    ).toEqual({
      detail: "The earlier conversation was summarized. Continuing from here.",
      title: "Compacted context",
    });
  });
});
