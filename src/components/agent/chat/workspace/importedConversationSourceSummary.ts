import type { AgentThreadItem } from "../types";
import type { GeneralWorkbenchTaskRailContextItem } from "../components/generalWorkbenchTaskRailViewModel";
import {
  type MinimalTranslate,
  translateTaskRailText,
} from "../components/generalWorkbenchTaskRailText";

interface ImportedFidelityCounts {
  messages?: number | null;
  attachments?: number | null;
  reasoning?: number | null;
  tools?: number | null;
  commands?: number | null;
  patches?: number | null;
  approvals?: number | null;
  mcp?: number | null;
  webSearch?: number | null;
  unsupported?: number | null;
  provenanceOnly?: number | null;
  budgetDropped?: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return null;
}

function readThreadItemMetadata(
  item: AgentThreadItem,
): Record<string, unknown> | null {
  return asRecord((item as unknown as { metadata?: unknown }).metadata);
}

function hasImportedProvenance(item: AgentThreadItem): boolean {
  const metadata = readThreadItemMetadata(item);
  const provenance = asRecord(
    metadata?.source_provenance ??
      metadata?.sourceProvenance ??
      (item as unknown as { sourceProvenance?: unknown }).sourceProvenance ??
      (item as unknown as { source_provenance?: unknown }).source_provenance,
  );

  return Boolean(
    provenance ||
      metadata?.source_client ||
      metadata?.sourceClient ||
      metadata?.codexImportFidelity ||
      metadata?.codex_import_fidelity,
  );
}

function readFidelityCounts(value: unknown): ImportedFidelityCounts | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const counts: ImportedFidelityCounts = {
    messages: recordNumber(record, ["messages"]),
    attachments: recordNumber(record, ["attachments"]),
    reasoning: recordNumber(record, ["reasoning"]),
    tools: recordNumber(record, ["tools"]),
    commands: recordNumber(record, ["commands"]),
    patches: recordNumber(record, ["patches"]),
    approvals: recordNumber(record, ["approvals"]),
    mcp: recordNumber(record, ["mcp"]),
    webSearch: recordNumber(record, ["webSearch", "web_search"]),
    unsupported: recordNumber(record, ["unsupported"]),
    provenanceOnly: recordNumber(record, [
      "provenanceOnly",
      "provenance_only",
    ]),
    budgetDropped: recordNumber(record, ["budgetDropped", "budget_dropped"]),
  };

  return Object.values(counts).some((count) => typeof count === "number")
    ? counts
    : null;
}

function resolveImportedFidelityCounts(
  threadItems: readonly AgentThreadItem[] | undefined,
): ImportedFidelityCounts | null {
  for (const item of threadItems ?? []) {
    const metadata = readThreadItemMetadata(item);
    const counts = readFidelityCounts(
      metadata?.codexImportFidelity ?? metadata?.codex_import_fidelity,
    );
    if (counts) {
      return counts;
    }
  }
  return null;
}

function positiveInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function interpolateText(value: string, options?: Record<string, unknown>): string {
  if (!options) {
    return value;
  }
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) => {
    const option = options[name.trim()];
    return option === undefined || option === null ? "" : String(option);
  });
}

function importedText(
  t: MinimalTranslate,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return interpolateText(
    translateTaskRailText(t, key, defaultValue, options),
    options,
  );
}

function buildImportedDetailLabels(
  fidelity: ImportedFidelityCounts | null,
  t: MinimalTranslate,
): string[] {
  const detailLabels: string[] = [];
  const appendCount = (
    labelKey: string,
    fallback: string,
    count?: number | null,
  ) => {
    if (!count) {
      return;
    }
    detailLabels.push(importedText(t, labelKey, fallback, { count }));
  };

  appendCount(
    "generalWorkbench.importedHistory.detail.messages",
    "消息 {{count}}",
    fidelity?.messages,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.reasoning",
    "思考 {{count}}",
    fidelity?.reasoning,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.commands",
    "命令 {{count}}",
    fidelity?.commands,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.tools",
    "工具 {{count}}",
    fidelity?.tools,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.patches",
    "补丁 {{count}}",
    fidelity?.patches,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.approvals",
    "确认 {{count}}",
    fidelity?.approvals,
  );
  appendCount(
    "generalWorkbench.importedHistory.detail.webSearch",
    "搜索 {{count}}",
    fidelity?.webSearch,
  );

  return detailLabels;
}

export function buildImportedConversationSourceSummary({
  threadItems,
  t,
}: {
  threadItems?: readonly AgentThreadItem[];
  t: MinimalTranslate;
}): GeneralWorkbenchTaskRailContextItem | null {
  if (!(threadItems ?? []).some(hasImportedProvenance)) {
    return null;
  }

  const fidelity = resolveImportedFidelityCounts(threadItems);
  const detailLabels = buildImportedDetailLabels(fidelity, t);
  const budgetDropped = positiveInteger(fidelity?.budgetDropped ?? null);
  const unsupported = positiveInteger(fidelity?.unsupported ?? null);
  const titleParts = [
    importedText(
      t,
      "generalWorkbench.importedHistory.value",
      "本地历史导入",
    ),
    detailLabels.length > 0 ? detailLabels.slice(0, 4).join(" / ") : null,
  ].filter(Boolean);

  return {
    id: "imported-source",
    label: importedText(
      t,
      "generalWorkbench.importedHistory.label",
      "导入",
    ),
    value: importedText(
      t,
      "generalWorkbench.importedHistory.value",
      "本地历史导入",
    ),
    title: titleParts.join(" · ") || null,
    detailLabels: detailLabels.slice(0, 3),
    detailOverflowLabel:
      detailLabels.length > 3
        ? importedText(
            t,
            "generalWorkbench.importedHistory.detailOverflow",
            "另有 {{count}} 项",
            { count: detailLabels.length - 3 },
          )
        : null,
    detailStatus:
      budgetDropped > 0 || unsupported > 0
        ? {
            label: importedText(
              t,
              "generalWorkbench.importedHistory.status.partial",
              "部分保留",
            ),
            tone: "warning",
            title: importedText(
              t,
              "generalWorkbench.importedHistory.status.partialTitle",
              "有 {{unsupported}} 项未完整映射，{{budgetDropped}} 项因预算裁剪",
              { unsupported, budgetDropped },
            ),
          }
        : {
            label: importedText(
              t,
              "generalWorkbench.importedHistory.status.restored",
              "已还原",
            ),
            tone: "success",
            title: importedText(
              t,
              "generalWorkbench.importedHistory.status.restoredTitle",
              "导入细节已进入当前会话轨迹",
            ),
          },
  };
}
