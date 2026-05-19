import type { AgentTokenUsage as TokenUsage } from "@/lib/api/agentProtocol";

const COMPACT_UNITS = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
] as const;

export type TokenUsageSummaryCopyKey =
  | "agentChat.tokenUsage.total"
  | "agentChat.tokenUsage.inputOutput"
  | "agentChat.tokenUsage.promptCache.zero"
  | "agentChat.tokenUsage.promptCache.read"
  | "agentChat.tokenUsage.promptCache.write"
  | "agentChat.tokenUsage.promptCache.readWrite";

type TokenUsageSummaryCopyValue = number | string;

export type TokenUsageSummaryCopyTranslate = (
  key: TokenUsageSummaryCopyKey,
  values?: Record<string, TokenUsageSummaryCopyValue>,
) => string;

export interface TokenUsageSummaryCopy {
  total: (count: string) => string;
  inputOutput: (input: string, output: string) => string;
  promptCache: {
    zero: string;
    read: (count: string) => string;
    write: (count: string) => string;
    readWrite: (total: string, read: string, write: string) => string;
  };
}

export function buildTokenUsageSummaryCopy(
  translate: TokenUsageSummaryCopyTranslate,
): TokenUsageSummaryCopy {
  return {
    total: (count) => translate("agentChat.tokenUsage.total", { count }),
    inputOutput: (input, output) =>
      translate("agentChat.tokenUsage.inputOutput", { input, output }),
    promptCache: {
      zero: translate("agentChat.tokenUsage.promptCache.zero"),
      read: (count) =>
        translate("agentChat.tokenUsage.promptCache.read", { count }),
      write: (count) =>
        translate("agentChat.tokenUsage.promptCache.write", { count }),
      readWrite: (total, read, write) =>
        translate("agentChat.tokenUsage.promptCache.readWrite", {
          total,
          read,
          write,
        }),
    },
  };
}

export function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const normalized = Math.max(0, value);
  for (const unit of COMPACT_UNITS) {
    if (normalized >= unit.threshold) {
      return `${(normalized / unit.threshold).toFixed(1)}${unit.suffix}`;
    }
  }

  return normalized.toLocaleString();
}

export function resolvePromptCacheActivity(usage?: {
  cached_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): number {
  return (
    Math.max(0, usage?.cached_input_tokens ?? 0) +
    Math.max(0, usage?.cache_creation_input_tokens ?? 0)
  );
}

export function resolveUsageInputOutputSummary(
  usage?: TokenUsage,
  copy?: TokenUsageSummaryCopy,
): string | null {
  if (!usage) {
    return null;
  }

  const input = formatCompactTokenCount(usage.input_tokens);
  const output = formatCompactTokenCount(usage.output_tokens);
  return copy?.inputOutput(input, output) ?? `${input} / ${output}`;
}

export function resolvePromptCacheMetaText(
  usage?: TokenUsage,
  copy?: TokenUsageSummaryCopy,
): string | null {
  const hasCachedRead = Number.isFinite(usage?.cached_input_tokens);
  const hasCacheCreation = Number.isFinite(usage?.cache_creation_input_tokens);

  if (!hasCachedRead && !hasCacheCreation) {
    return null;
  }

  const cachedRead = Math.max(0, usage?.cached_input_tokens ?? 0);
  const cacheCreation = Math.max(0, usage?.cache_creation_input_tokens ?? 0);
  const totalCached = cachedRead + cacheCreation;

  if (totalCached <= 0) {
    return copy?.promptCache.zero ?? "0";
  }

  if (hasCacheCreation) {
    if (hasCachedRead) {
      return (
        copy?.promptCache.readWrite(
          formatCompactTokenCount(totalCached),
          formatCompactTokenCount(cachedRead),
          formatCompactTokenCount(cacheCreation),
        ) ??
        `${formatCompactTokenCount(totalCached)} (${formatCompactTokenCount(
          cachedRead,
        )} / ${formatCompactTokenCount(cacheCreation)})`
      );
    }
    return (
      copy?.promptCache.write(formatCompactTokenCount(cacheCreation)) ??
      formatCompactTokenCount(cacheCreation)
    );
  }

  return (
    copy?.promptCache.read(formatCompactTokenCount(cachedRead)) ??
    formatCompactTokenCount(cachedRead)
  );
}

export function resolveTokenUsageTotalText(
  usage: TokenUsage,
  copy?: TokenUsageSummaryCopy,
): string {
  const total = formatCompactTokenCount(
    usage.input_tokens + usage.output_tokens,
  );
  return copy?.total(total) ?? total;
}
