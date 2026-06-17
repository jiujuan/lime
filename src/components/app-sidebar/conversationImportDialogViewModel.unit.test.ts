import { describe, expect, it } from "vitest";
import type { ImportedThreadSummary } from "@/lib/api/conversationImport";
import {
  buildImportPreviewMetaText,
  buildSourceProvenanceLabels,
  firstImportableThread,
  isImportedThread,
  resolveImportConfirmActionKey,
  resolveImportConfirmNoticeKey,
  resolveImportSourceClientLabel,
  resolveImportThreadSecondaryText,
  resolveImportThreadTitle,
  sourceEventLabel,
  sourcePayloadLabel,
  truncateImportPreviewText,
  type ConversationImportDialogTranslate,
} from "./conversationImportDialogViewModel";

const t: ConversationImportDialogTranslate = (
  key: string,
  defaultValueOrOptions?: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>,
) => {
  const defaultValue =
    typeof defaultValueOrOptions === "string"
      ? defaultValueOrOptions
      : typeof defaultValueOrOptions?.defaultValue === "string"
        ? defaultValueOrOptions.defaultValue
        : key;
  const options =
    typeof defaultValueOrOptions === "string"
      ? maybeOptions
      : defaultValueOrOptions;
  return defaultValue.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) => {
    const value = options?.[name.trim()];
    return value === undefined || value === null ? "" : String(value);
  });
};

function thread(
  overrides: Partial<ImportedThreadSummary> = {},
): ImportedThreadSummary {
  return {
    sourceClient: "codex",
    sourceThreadId: "codex-thread-1",
    title: "本地历史修复记录",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    cwd: "/repo/project-1",
    source: "cli",
    modelProvider: "openai",
    archived: false,
    sourcePath: "/Users/example/.codex/sessions/codex-thread-1.jsonl",
    importStatus: "not_imported",
    ...overrides,
  };
}

describe("conversationImportDialogViewModel", () => {
  it("标题和副标题 fallback 不回显底层来源 thread id 或默认数据目录", () => {
    const item = thread({ title: undefined, cwd: undefined });

    expect(resolveImportThreadTitle(item)).toBe("本地历史对话");
    expect(resolveImportThreadSecondaryText(item, null, t)).toBe("本地历史");
    expect(resolveImportThreadTitle(item)).not.toContain("codex-thread");
    expect(resolveImportThreadSecondaryText(item, null, t)).not.toContain(
      ".codex",
    );
  });

  it("预览 meta 只展示历史对话与时间，不插入 sourceThreadId", () => {
    const meta = buildImportPreviewMetaText("2026年6月16日 12:00", t);

    expect(meta).toBe("历史对话 · 2026年6月16日 12:00");
    expect(meta).not.toMatch(/\bcodex\b/i);
    expect(meta).not.toContain("thread-1");
  });

  it("source client label 只在第二来源导入场景显示来源名，默认来源展示为本地历史", () => {
    expect(resolveImportSourceClientLabel("codex")).toBe("本地历史");
    expect(resolveImportSourceClientLabel(undefined)).toBe("本地历史");
    expect(resolveImportSourceClientLabel("claude_code")).toBe("Claude Code");
  });

  it("默认选择第一条未导入对话，全部已导入时回退第一条", () => {
    const imported = thread({
      sourceThreadId: "imported-thread",
      importStatus: "imported",
    });
    const fresh = thread({ sourceThreadId: "fresh-thread" });

    expect(firstImportableThread([imported, fresh])?.sourceThreadId).toBe(
      "fresh-thread",
    );
    expect(firstImportableThread([imported])?.sourceThreadId).toBe(
      "imported-thread",
    );
    expect(firstImportableThread([])).toBeNull();
  });

  it("已导入线程使用清理并重新导入确认态", () => {
    const imported = thread({ importStatus: "imported" });
    const fresh = thread({ importStatus: "not_imported" });

    expect(isImportedThread(imported)).toBe(true);
    expect(isImportedThread(fresh)).toBe(false);
    expect(resolveImportConfirmActionKey(imported)).toBe(
      "navigation.sidebar.importDialog.action.replace",
    );
    expect(resolveImportConfirmActionKey(fresh)).toBe(
      "navigation.sidebar.importDialog.action.confirm",
    );
    expect(resolveImportConfirmNoticeKey(imported)).toBe(
      "navigation.sidebar.importDialog.confirmNotice.replace",
    );
    expect(resolveImportConfirmNoticeKey(fresh)).toBe(
      "navigation.sidebar.importDialog.confirmNotice",
    );
  });

  it("provenance 标签映射为用户可读文案，且不泄漏 source client 和 call id", () => {
    const labels = buildSourceProvenanceLabels(
      {
        sourceClient: "codex",
        sourceThreadId: "codex-thread-1",
        sourcePath: "/Users/example/.codex/sessions/codex-thread-1.jsonl",
        sourceEventType: "event_msg",
        sourceEventSeq: 3,
        sourcePayloadType: "agent_message",
        sourceCallId: "codex_import_approval",
      },
      t,
    );

    expect(labels).toEqual(["来源行 #3", "历史记录", "助手回复", "调用记录"]);
    expect(labels.join(" ")).not.toMatch(/\bcodex\b/i);
    expect(labels.join(" ")).not.toContain(".codex");
    expect(labels.join(" ")).not.toContain("codex_import_approval");
  });

  it("provenance raw kind 映射覆盖工具、确认、补丁和空值", () => {
    expect(sourceEventLabel("custom_tool_call", t)).toBe("工具记录");
    expect(sourceEventLabel("approval_request", t)).toBe("确认记录");
    expect(sourceEventLabel(undefined, t)).toBeNull();
    expect(sourcePayloadLabel("function_call_output", t)).toBe("工具调用");
    expect(sourcePayloadLabel("patch_apply_end", t)).toBe("文件变更");
    expect(sourcePayloadLabel(undefined, t)).toBeNull();
  });

  it("预览正文会归一化空白并限制长度", () => {
    expect(truncateImportPreviewText("  第一行\n\n第二行  ")).toBe(
      "第一行 第二行",
    );
    expect(truncateImportPreviewText("x".repeat(230))).toHaveLength(223);
  });
});
