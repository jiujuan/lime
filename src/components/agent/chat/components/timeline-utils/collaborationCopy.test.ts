import { afterEach, describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import type { AgentThreadOrderedBlock } from "../../utils/agentThreadGrouping";
import {
  resolveCollaborationDefaultTitle,
  resolveCollaborationFallback,
  resolveCollaborationOpenSubagentLabel,
  resolveCollaborationPreviewLine,
  resolveCollaborationStatusLabel,
  resolveCollaborationTitle,
} from "./collaborationCopy";

const COLLABORATION_COPY_KEYS = [
  "agentChat.collaboration.defaultTitle",
  "agentChat.collaboration.fallback.completed",
  "agentChat.collaboration.fallback.running",
  "agentChat.collaboration.openSubagent",
  "agentChat.collaboration.preview.knownPrefixes",
  "agentChat.collaboration.preview.prefix",
  "agentChat.collaboration.status.completed",
  "agentChat.collaboration.status.failed",
  "agentChat.collaboration.status.interacted",
  "agentChat.collaboration.status.interrupted",
  "agentChat.collaboration.status.paused",
  "agentChat.collaboration.status.queued",
  "agentChat.collaboration.status.running",
  "agentChat.collaboration.status.started",
  "agentChat.collaboration.title",
] as const;

afterEach(async () => {
  await changeLimeLocale("zh-CN");
});

describe("collaboration copy", () => {
  it("协作执行 copy 应覆盖五语言资源", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const resource = loadNamespaceResource(locale, "agent");
      for (const key of COLLABORATION_COPY_KEYS) {
        expect(resource[key], `${locale} ${key}`).toEqual(expect.any(String));
        expect(resource[key]?.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("协作执行 resolver 应跟随当前语言资源，不回落到 timeline 旧 key", async () => {
    await changeLimeLocale("en-US");
    const subagentKind: AgentThreadOrderedBlock["kind"] = "subagent";

    expect(resolveCollaborationDefaultTitle()).toBe("Subtask");
    expect(resolveCollaborationTitle("Review")).toBe("Subtask: Review");
    expect(resolveCollaborationOpenSubagentLabel()).toBe(
      "View subtask details",
    );
    expect(resolveCollaborationStatusLabel("queued", "in_progress")).toBe(
      "Queued",
    );
    expect(resolveCollaborationStatusLabel("running", "in_progress")).toBe(
      "Processing",
    );
    expect(resolveCollaborationStatusLabel("started", "completed")).toBe(
      "Started",
    );
    expect(resolveCollaborationStatusLabel("interacted", "completed")).toBe(
      "Contacted",
    );
    expect(resolveCollaborationStatusLabel("interrupted", "completed")).toBe(
      "Interrupted",
    );
    expect(resolveCollaborationStatusLabel("future_value", "completed")).toBe(
      "Completed",
    );
    expect(resolveCollaborationFallback("completed")).toBe("Subtask completed");
    expect(resolveCollaborationPreviewLine(subagentKind, "Review draft")).toBe(
      "Assigned to subtask: Review draft",
    );
  });
});
