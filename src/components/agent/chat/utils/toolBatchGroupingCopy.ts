import { resolveRequiredAgentChatCopy } from "./agentChatCopy";

export interface WebSearchBatchCopyParams {
  hasRunning: boolean;
  latestWebSearchHint?: string | null;
  webFetchCount: number;
  webSearchCount: number;
}

export interface ExplorationBatchCopyParams {
  latestHint?: string | null;
  listCount: number;
  readCount: number;
  searchCount: number;
  significantCount: number;
}

export interface BrowserBatchCopyParams {
  browserCount: number;
  latestHint?: string | null;
}

function joinSummaryParts(parts: string[]): string {
  const separator = resolveRequiredAgentChatCopy(
    "toolBatch.separator.clause",
  );
  return parts.filter(Boolean).join(separator);
}

export function resolveWebSearchFallbackLine(
  params: Pick<WebSearchBatchCopyParams, "webFetchCount" | "webSearchCount">,
): string {
  return params.webFetchCount > 0
    ? resolveRequiredAgentChatCopy("toolBatch.webSearch.fallback.searchAndFetch", {
        fetchCount: params.webFetchCount,
        searchCount: params.webSearchCount,
      })
    : resolveRequiredAgentChatCopy("toolBatch.webSearch.fallback.searchOnly", {
        searchCount: params.webSearchCount,
      });
}

export function resolveWebSearchLatestHintLine(hint: string): string {
  return resolveRequiredAgentChatCopy("toolBatch.webSearch.latestHint", {
    hint,
  });
}

export function resolveWebSearchTitle(
  params: WebSearchBatchCopyParams,
): string {
  if (
    params.webSearchCount === 1 &&
    params.webFetchCount === 0 &&
    params.latestWebSearchHint
  ) {
    return resolveRequiredAgentChatCopy(
      params.hasRunning
        ? "toolBatch.webSearch.title.running.singleWithHint"
        : "toolBatch.webSearch.title.completed.singleWithHint",
      { hint: params.latestWebSearchHint },
    );
  }

  if (params.webFetchCount > 0) {
    return resolveRequiredAgentChatCopy(
      params.hasRunning
        ? "toolBatch.webSearch.title.running.searchAndFetch"
        : "toolBatch.webSearch.title.completed.searchAndFetch",
      {
        fetchCount: params.webFetchCount,
        searchCount: params.webSearchCount,
      },
    );
  }

  return resolveRequiredAgentChatCopy(
    params.hasRunning
      ? "toolBatch.webSearch.title.running.searchOnly"
      : "toolBatch.webSearch.title.completed.searchOnly",
    { searchCount: params.webSearchCount },
  );
}

export function resolveWebSearchCountLabel(
  params: Pick<WebSearchBatchCopyParams, "webFetchCount" | "webSearchCount">,
): string {
  return params.webFetchCount > 0
    ? resolveRequiredAgentChatCopy("toolBatch.webSearch.count.searchAndFetch", {
        fetchCount: params.webFetchCount,
        searchCount: params.webSearchCount,
      })
    : resolveRequiredAgentChatCopy("toolBatch.webSearch.count.searchOnly", {
        count: params.webSearchCount,
      });
}

export function resolveWebSearchRawDetailLabel(
  params: Pick<
    WebSearchBatchCopyParams,
    "hasRunning" | "webFetchCount"
  >,
): string {
  if (params.hasRunning) {
    return params.webFetchCount > 0
      ? resolveRequiredAgentChatCopy(
          "toolBatch.webSearch.rawDetail.running.searchAndFetch",
        )
      : resolveRequiredAgentChatCopy(
          "toolBatch.webSearch.rawDetail.running.searchOnly",
        );
  }

  return params.webFetchCount > 0
    ? resolveRequiredAgentChatCopy(
        "toolBatch.webSearch.rawDetail.completed.searchAndFetch",
      )
    : resolveRequiredAgentChatCopy(
        "toolBatch.webSearch.rawDetail.completed.searchOnly",
      );
}

export function resolveExplorationTitle(
  params: Pick<ExplorationBatchCopyParams, "readCount" | "searchCount">,
): string {
  if (params.readCount > 0 && params.searchCount > 0) {
    return resolveRequiredAgentChatCopy("toolBatch.exploration.title.mixed");
  }
  if (params.readCount > 0) {
    return resolveRequiredAgentChatCopy("toolBatch.exploration.title.read");
  }
  if (params.searchCount > 0) {
    return resolveRequiredAgentChatCopy("toolBatch.exploration.title.search");
  }
  return resolveRequiredAgentChatCopy("toolBatch.exploration.title.list");
}

export function resolveExplorationDetailLine(
  params: Pick<
    ExplorationBatchCopyParams,
    "listCount" | "readCount" | "searchCount"
  >,
): string | null {
  const detailParts: string[] = [];
  if (params.readCount > 0) {
    detailParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.detail.read", {
        count: params.readCount,
      }),
    );
  }
  if (params.searchCount > 0) {
    detailParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.detail.search", {
        count: params.searchCount,
      }),
    );
  }
  if (params.listCount > 0) {
    detailParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.detail.list", {
        count: params.listCount,
      }),
    );
  }

  return detailParts.length > 0 ? joinSummaryParts(detailParts) : null;
}

export function resolveExplorationLatestHintLine(hint: string): string {
  return resolveRequiredAgentChatCopy("toolBatch.exploration.latestHint", {
    hint,
  });
}

export function resolveExplorationCountLabel(
  params: ExplorationBatchCopyParams,
): string {
  const countParts: string[] = [];
  if (params.readCount > 0) {
    countParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.count.read", {
        count: params.readCount,
      }),
    );
  }
  if (params.searchCount > 0) {
    countParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.count.search", {
        count: params.searchCount,
      }),
    );
  }
  if (params.listCount > 0) {
    countParts.push(
      resolveRequiredAgentChatCopy("toolBatch.exploration.count.list", {
        count: params.listCount,
      }),
    );
  }

  return (
    countParts.join(" / ") ||
    resolveRequiredAgentChatCopy("toolBatch.exploration.count.steps", {
      count: params.significantCount,
    })
  );
}

export function resolveExplorationRawDetailLabel(): string {
  return resolveRequiredAgentChatCopy("toolBatch.exploration.rawDetail");
}

export function resolveBrowserTitle(): string {
  return resolveRequiredAgentChatCopy("toolBatch.browser.title");
}

export function resolveBrowserFallbackLine(params: BrowserBatchCopyParams): string {
  return resolveRequiredAgentChatCopy("toolBatch.browser.fallbackLine", {
    count: params.browserCount,
  });
}

export function resolveBrowserLatestHintLine(hint: string): string {
  return resolveRequiredAgentChatCopy("toolBatch.browser.latestHint", {
    hint,
  });
}

export function resolveBrowserCountLabel(params: BrowserBatchCopyParams): string {
  return resolveRequiredAgentChatCopy("toolBatch.browser.count", {
    count: params.browserCount,
  });
}

export function resolveBrowserRawDetailLabel(): string {
  return resolveRequiredAgentChatCopy("toolBatch.browser.rawDetail");
}
