import { describe, expect, it } from "vitest";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import type { AgentThreadItem } from "../types";
import { buildImportedConversationSourceSummary } from "./importedConversationSourceSummary";

function importedHistoryResourceKeys(resource: Record<string, string>): string[] {
  return Object.keys(resource)
    .filter((key) => key.startsWith("generalWorkbench.importedHistory."))
    .sort();
}

const t = (key: string, values?: Record<string, unknown>) => {
  const templates: Record<string, string> = {
    "generalWorkbench.importedHistory.detail.approvals": "确认 {{count}}",
    "generalWorkbench.importedHistory.detail.commands": "命令 {{count}}",
    "generalWorkbench.importedHistory.detail.messages": "消息 {{count}}",
    "generalWorkbench.importedHistory.detail.patches": "补丁 {{count}}",
    "generalWorkbench.importedHistory.detail.reasoning": "思考 {{count}}",
    "generalWorkbench.importedHistory.detail.tools": "工具 {{count}}",
    "generalWorkbench.importedHistory.detail.webSearch": "搜索 {{count}}",
    "generalWorkbench.importedHistory.detailOverflow": "另有 {{count}} 项",
    "generalWorkbench.importedHistory.label": "导入",
    "generalWorkbench.importedHistory.status.partial": "部分保留",
    "generalWorkbench.importedHistory.status.partialTitle":
      "有 {{unsupported}} 项未完整映射，{{budgetDropped}} 项因预算裁剪",
    "generalWorkbench.importedHistory.status.restored": "已还原",
    "generalWorkbench.importedHistory.status.restoredTitle":
      "导入细节已进入当前会话轨迹",
    "generalWorkbench.importedHistory.value": "本地历史导入",
  };
  return (templates[key] ?? key).replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_, name: string) => String(values?.[name.trim()] ?? ""),
  );
};

function importedCommandItem(
  metadata: Record<string, unknown>,
): AgentThreadItem {
  return {
    id: "imported-command",
    type: "command_execution",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    command: "npm test",
    cwd: "/workspace/imported-local-history",
    metadata,
    started_at: "2026-06-17T10:00:00.000Z",
    completed_at: "2026-06-17T10:00:01.000Z",
    updated_at: "2026-06-17T10:00:01.000Z",
  };
}

describe("buildImportedConversationSourceSummary", () => {
  it("导入来源摘要文案覆盖五语言资源", () => {
    const requiredKeys = importedHistoryResourceKeys(
      loadNamespaceResource("zh-CN", "agent"),
    );

    expect(requiredKeys).toContain("generalWorkbench.importedHistory.value");
    expect(requiredKeys).toContain(
      "generalWorkbench.importedHistory.status.restoredTitle",
    );

    for (const locale of SUPPORTED_LOCALES) {
      const resource = loadNamespaceResource(locale, "agent");
      for (const key of requiredKeys) {
        expect(resource[key], `${locale}:${key}`).toEqual(expect.any(String));
        expect(String(resource[key]).trim()).not.toBe("");
      }
    }
  });

  it("应从本地历史导入 metadata 构建中性摘要", () => {
    const summary = buildImportedConversationSourceSummary({
      threadItems: [
        importedCommandItem({
          source_client: "codex",
          source_provenance: {
            sourceClient: "codex",
            sourceThreadId: "thread-codex-20260617abcdef",
          },
          codexImportFidelity: {
            messages: 6,
            reasoning: 2,
            commands: 1,
            tools: 4,
            patches: 1,
            approvals: 1,
            webSearch: 1,
          },
        }),
      ],
      t,
    });

    expect(summary).toEqual({
      id: "imported-source",
      label: "导入",
      value: "本地历史导入",
      title: "本地历史导入 · 消息 6 / 思考 2 / 命令 1 / 工具 4",
      detailLabels: ["消息 6", "思考 2", "命令 1"],
      detailOverflowLabel: "另有 4 项",
      detailStatus: {
        label: "已还原",
        tone: "success",
        title: "导入细节已进入当前会话轨迹",
      },
    });
    expect(JSON.stringify(summary)).not.toContain("codex");
    expect(JSON.stringify(summary)).not.toContain("thread-codex");
    expect(JSON.stringify(summary)).not.toContain("npm test");
  });

  it("普通会话不应生成导入摘要", () => {
    const summary = buildImportedConversationSourceSummary({
      threadItems: [
        importedCommandItem({
          source: "workspace-history",
        }),
      ],
      t,
    });

    expect(summary).toBeNull();
  });

  it("预算裁剪或未完整映射时应展示部分保留状态", () => {
    const summary = buildImportedConversationSourceSummary({
      threadItems: [
        importedCommandItem({
          source_provenance: {
            sourceClient: "codex",
          },
          codex_import_fidelity: {
            messages: 3,
            unsupported: 2,
            budget_dropped: 1,
          },
        }),
      ],
      t,
    });

    expect(summary?.detailStatus).toEqual({
      label: "部分保留",
      tone: "warning",
      title: "有 2 项未完整映射，1 项因预算裁剪",
    });
  });

  it("资源缺失时导入摘要 fallback 不应回退成中文", () => {
    const summary = buildImportedConversationSourceSummary({
      threadItems: [
        importedCommandItem({
          source_provenance: {
            sourceClient: "codex",
          },
          codex_import_fidelity: {
            messages: 3,
            reasoning: 1,
            unsupported: 2,
            budget_dropped: 1,
          },
        }),
      ],
      t: (_key, options) => options?.defaultValue,
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).toContain("Local history import");
    expect(serialized).toContain("3 messages");
    expect(serialized).toContain("Partially retained");
    expect(serialized).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
