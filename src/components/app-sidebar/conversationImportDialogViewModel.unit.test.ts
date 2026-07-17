import { describe, expect, it } from "vitest";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import type {
  ConversationImportJob,
  ImportedThreadSummary,
} from "@/lib/api/conversationImport";
import {
  buildImportThreadGroups,
  buildImportPreviewMetaText,
  buildSourceProvenanceLabels,
  filterImportThreadsByArchiveStatus,
  firstImportableThread,
  initialImportSelection,
  isImportedThread,
  isImportingThread,
  isSelectableImportThread,
  resolveImportConfirmActionKey,
  resolveImportConfirmNoticeKey,
  resolveImportJobPercent,
  resolveImportJobPhaseLabel,
  resolveImportSourceClientLabel,
  resolveImportThreadSecondaryText,
  resolveImportThreadTitle,
  resolveImportWarningText,
  selectedImportThreads,
  sourceEventLabel,
  sourcePayloadLabel,
  truncateImportPreviewText,
  type ConversationImportDialogTranslate,
} from "./conversationImportDialogViewModel";

const zhNavigationResource = loadNamespaceResource("zh-CN", "navigation");
const IMPORT_DIALOG_KEY_PREFIXES = [
  "navigation.sidebar.importDialog.",
  "navigation.sidebar.conversations.import",
] as const;

function importDialogResourceKeys(resource: Record<string, string>): string[] {
  return Object.keys(resource)
    .filter((key) =>
      IMPORT_DIALOG_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    )
    .sort();
}

const t: ConversationImportDialogTranslate = (
  key: string,
  defaultValueOrOptions?: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>,
) => {
  const resourceValue = zhNavigationResource[key];
  const defaultValue =
    typeof resourceValue === "string"
      ? resourceValue
      : typeof defaultValueOrOptions === "string"
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

    expect(resolveImportThreadTitle(item, t)).toBe("本地历史对话");
    expect(resolveImportThreadSecondaryText(item, null, t)).toBe("本地历史");
    expect(resolveImportThreadTitle(item, t)).not.toContain("codex-thread");
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

  it("Codex 导入入口统一展示为本地历史", () => {
    expect(resolveImportSourceClientLabel(t)).toBe("本地历史");
  });

  it("默认优先选择后台导入中的对话，其次选择未导入对话", () => {
    const imported = thread({
      sourceThreadId: "imported-thread",
      importStatus: "imported",
    });
    const fresh = thread({ sourceThreadId: "fresh-thread" });
    const importing = thread({
      sourceThreadId: "importing-thread",
      importStatus: "importing",
      importJobId: "import-job-1",
    });
    expect(
      firstImportableThread([imported, fresh, importing])?.sourceThreadId,
    ).toBe("importing-thread");
    expect(firstImportableThread([imported, fresh])?.sourceThreadId).toBe(
      "fresh-thread",
    );
    expect(firstImportableThread([imported])?.sourceThreadId).toBe(
      "imported-thread",
    );
    expect(firstImportableThread([])).toBeNull();
  });

  it("批量导入默认只勾选第一条可导入对话，不隐式全量导入", () => {
    const imported = thread({
      sourceThreadId: "imported-thread",
      importStatus: "imported",
    });
    const fresh = thread({ sourceThreadId: "fresh-thread" });
    const importing = thread({
      sourceThreadId: "importing-thread",
      importStatus: "importing",
      importJobId: "import-job-1",
    });
    const conflict = thread({
      sourceThreadId: "conflict-thread",
      importStatus: "conflict",
    });

    const selection = initialImportSelection([imported, fresh, conflict]);

    expect([...selection]).toEqual(["fresh-thread"]);
    expect(isSelectableImportThread(imported)).toBe(true);
    expect(isSelectableImportThread(fresh)).toBe(true);
    expect(isSelectableImportThread(importing)).toBe(true);
    expect(isSelectableImportThread(conflict)).toBe(false);
    expect(
      selectedImportThreads([imported, fresh, conflict], selection).map(
        (item) => item.sourceThreadId,
      ),
    ).toEqual(["fresh-thread"]);
  });

  it("后台导入进度按真实 item 比例计算，并为无总量阶段提供稳定占位", () => {
    const job: ConversationImportJob = {
      jobId: "import-job-1",
      sourceClient: "codex",
      sourceThreadId: "thread-1",
      status: "running",
      progress: {
        phase: "reading_source",
        completedItems: 0,
        totalItems: 0,
        completedTurns: 0,
        totalTurns: 0,
      },
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    };

    expect(resolveImportJobPercent(job)).toBe(12);
    expect(
      resolveImportJobPercent({
        ...job,
        progress: {
          ...job.progress,
          phase: "persisting_history",
          completedItems: 75,
          totalItems: 100,
        },
      }),
    ).toBe(75);
    expect(resolveImportJobPercent({ ...job, status: "completed" })).toBe(100);
    expect(resolveImportJobPhaseLabel("persisting_history", t)).toBe(
      "正在保存对话历史",
    );
  });

  it("可按天和按月对导入列表分组", () => {
    const first = thread({
      sourceThreadId: "thread-day-1",
      updatedAt: "2026-06-16T09:00:00.000Z",
    });
    const second = thread({
      sourceThreadId: "thread-day-2",
      updatedAt: "2026-06-16T10:00:00.000Z",
    });
    const nextMonth = thread({
      sourceThreadId: "thread-month-2",
      updatedAt: "2026-07-01T10:00:00.000Z",
    });

    const dayGroups = buildImportThreadGroups(
      [first, second, nextMonth],
      "day",
      "zh-CN",
      t,
    );
    const monthGroups = buildImportThreadGroups(
      [first, second, nextMonth],
      "month",
      "zh-CN",
      t,
    );

    expect(dayGroups.map((group) => group.id)).toEqual([
      "2026-06-16",
      "2026-07-01",
    ]);
    expect(dayGroups[0].threads.map((item) => item.sourceThreadId)).toEqual([
      "thread-day-1",
      "thread-day-2",
    ]);
    expect(monthGroups.map((group) => group.id)).toEqual([
      "2026-06",
      "2026-07",
    ]);
  });

  it("可按归档状态筛选导入列表，默认 all 不隐藏归档会话", () => {
    const active = thread({
      sourceThreadId: "active-thread",
      archived: false,
    });
    const archived = thread({
      sourceThreadId: "archived-thread",
      archived: true,
    });

    expect(
      filterImportThreadsByArchiveStatus([active, archived], "all").map(
        (item) => item.sourceThreadId,
      ),
    ).toEqual(["active-thread", "archived-thread"]);
    expect(
      filterImportThreadsByArchiveStatus([active, archived], "active").map(
        (item) => item.sourceThreadId,
      ),
    ).toEqual(["active-thread"]);
    expect(
      filterImportThreadsByArchiveStatus([active, archived], "archived").map(
        (item) => item.sourceThreadId,
      ),
    ).toEqual(["archived-thread"]);
  });

  it("已导入线程使用清理并重新导入确认态", () => {
    const imported = thread({ importStatus: "imported" });
    const fresh = thread({ importStatus: "not_imported" });

    expect(isImportedThread(imported)).toBe(true);
    expect(isImportedThread(fresh)).toBe(false);
    expect(isImportingThread(thread({ importStatus: "importing" }))).toBe(true);
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

  it("后端导入 warning 应映射成展示层本地化文案", () => {
    expect(
      resolveImportWarningText(
        "Some source rollout items are counted but not shown in preview.",
        t,
      ),
    ).toBe("部分来源条目只保留为来源记录，不会出现在预览里。");
    expect(
      resolveImportWarningText(
        "Imported local history messages and supported tool/patch timeline events; unsupported source items remain as provenance only.",
        t,
      ),
    ).toBe("消息和已支持的过程会导入，未支持的来源条目只保留为来源记录。");
    expect(
      resolveImportWarningText(
        "Skipped high-volume local history runtime events outside default window.",
        t,
      ),
    ).toContain("大量过程记录");
    expect(resolveImportWarningText("raw backend diagnostic", t)).toBe(
      "部分来源细节只能保留为来源记录。",
    );
  });

  it("导入弹窗与入口文案覆盖五语言资源", () => {
    const requiredKeys = importDialogResourceKeys(zhNavigationResource);

    expect(requiredKeys).toContain("navigation.sidebar.importDialog.title");
    expect(requiredKeys).toContain(
      "navigation.sidebar.importDialog.warnings.provenanceOnlyCommit",
    );
    expect(requiredKeys).toContain(
      "navigation.sidebar.conversations.importConversation",
    );

    for (const locale of SUPPORTED_LOCALES) {
      const resource = loadNamespaceResource(locale, "navigation");
      for (const key of requiredKeys) {
        expect(resource[key], `${locale}:${key}`).toEqual(expect.any(String));
        expect(String(resource[key]).trim()).not.toBe("");
      }
    }
  });

  it("预览正文会归一化空白并限制长度", () => {
    expect(truncateImportPreviewText("  第一行\n\n第二行  ")).toBe(
      "第一行 第二行",
    );
    expect(truncateImportPreviewText("x".repeat(230))).toHaveLength(223);
  });
});
