export { isUnifiedWebSearchToolName } from "./toolNameFamily";

export interface SearchResultPreviewItem {
  id: string;
  title: string;
  url: string;
  hostname: string;
  snippet?: string;
  snapshotContent?: string;
  snapshotTitle?: string;
  snapshotSource?: "web_fetch";
}

const URL_PATTERN_SOURCE = String.raw`\bhttps?:\/\/[^\s<>"'\`]+`;
const URL_TRAILING_PUNCTUATION = /[),.;!?]+$/;
const SEARCH_MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export const SEARCH_RESULT_LIST_LIMIT = 10;

function createUrlPattern(): RegExp {
  return new RegExp(URL_PATTERN_SOURCE, "gi");
}

function isSearchEngineHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "bing.com" ||
    normalized.endsWith(".bing.com") ||
    normalized === "google.com" ||
    normalized.endsWith(".google.com") ||
    normalized === "baidu.com" ||
    normalized.endsWith(".baidu.com")
  );
}

function isSearchEngineNavigationNoise(item: SearchResultPreviewItem): boolean {
  const normalizedTitle = item.title.trim();
  const normalizedSnippet = item.snippet?.trim() || "";
  const text = `${normalizedTitle} ${normalizedSnippet}`;

  if (isSearchEngineHostname(item.hostname)) {
    return true;
  }

  if (!normalizedTitle) {
    return true;
  }

  return /(?:了解必应|新版必应壁纸|增值电信业务经营许可证|京ICP备|隐私声明|使用条款|privacy|terms of use)/i.test(
    text,
  );
}

function filterUserFacingSearchResults(
  items: SearchResultPreviewItem[],
): SearchResultPreviewItem[] {
  return reindexSearchResultPreviewItems(
    items.filter((item) => !isSearchEngineNavigationNoise(item)),
  );
}

function reindexSearchResultPreviewItems(
  items: SearchResultPreviewItem[],
): SearchResultPreviewItem[] {
  const typeCounts = new Map<string, number>();

  return items.map((item) => {
    const type = item.id.match(/^search-(record|markdown|text|url)-\d+-/)?.[1];
    if (!type) {
      return item;
    }

    const nextIndex = typeCounts.get(type) || 0;
    typeCounts.set(type, nextIndex + 1);

    return {
      ...item,
      id: `search-${type}-${nextIndex}-${item.url}`,
    };
  });
}

function extractBalancedJsonSnippets(rawText: string): string[] {
  const snippets: string[] = [];
  const stack: string[] = [];
  let startIndex = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const current = rawText[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (current === "\\") {
      escaped = true;
      continue;
    }

    if (current === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (current === "{" || current === "[") {
      if (stack.length === 0) {
        startIndex = index;
      }
      stack.push(current);
      continue;
    }

    if (current !== "}" && current !== "]") {
      continue;
    }

    const opening = stack[stack.length - 1];
    const matchesPair =
      (opening === "{" && current === "}") ||
      (opening === "[" && current === "]");
    if (!matchesPair) {
      stack.length = 0;
      startIndex = -1;
      continue;
    }

    stack.pop();
    if (stack.length === 0 && startIndex >= 0) {
      snippets.push(rawText.slice(startIndex, index + 1));
      startIndex = -1;
    }
  }

  return snippets;
}

function collectJsonParseCandidates(rawText: string): string[] {
  const candidates = new Set<string>();

  const pushCandidate = (value?: string) => {
    const normalized = value?.trim();
    if (normalized) {
      candidates.add(normalized);
    }
  };

  pushCandidate(rawText);

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  pushCandidate(fencedMatch?.[1]);

  for (const source of [rawText, fencedMatch?.[1] || ""]) {
    for (const snippet of extractBalancedJsonSnippets(source)) {
      pushCandidate(snippet);
    }
  }

  return Array.from(candidates);
}

function normalizeUrlCandidate(rawUrl: string): {
  url: string;
  trailing: string;
} {
  const normalized = rawUrl.replace(URL_TRAILING_PUNCTUATION, "");
  return {
    url: normalized || rawUrl,
    trailing: rawUrl.slice((normalized || rawUrl).length),
  };
}

function normalizeStructuredUrlCandidate(rawUrl: string): string | null {
  const normalized = normalizeUrlCandidate(rawUrl.trim()).url.trim();
  if (!normalized) {
    return null;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return normalized;
}

function findFirstUrl(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const match = value.match(createUrlPattern());
    if (!match || match.length === 0) {
      continue;
    }
    return normalizeUrlCandidate(match[0]).url;
  }
  return undefined;
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/^[\s>*•·\-–—\d().:：\]]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonishFieldLine(
  value: string,
): { key: string; rawValue: string } | null {
  const normalized = value.trim().replace(/,$/, "").trim();
  const match = normalized.match(/^["']?([A-Za-z_][\w-]*)["']?\s*:\s*(.*)$/);
  if (!match) {
    return null;
  }
  return {
    key: match[1]?.toLowerCase() || "",
    rawValue: match[2]?.trim() || "",
  };
}

function normalizeJsonishFieldValue(rawValue: string): string {
  const normalized = rawValue.trim().replace(/,$/, "").trim();
  if (!normalized || normalized === "null" || normalized === "undefined") {
    return "";
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    const jsonCompatible =
      normalized.startsWith("'") && normalized.endsWith("'")
        ? `"${normalized.slice(1, -1).replace(/"/g, '\\"')}"`
        : normalized;
    try {
      const parsed = JSON.parse(jsonCompatible) as unknown;
      return typeof parsed === "string" ? parsed : "";
    } catch {
      return normalized.slice(1, -1);
    }
  }

  return normalized;
}

function normalizeSearchTitleCandidate(value: string): string {
  const field = readJsonishFieldLine(value);
  if (field) {
    if (
      [
        "title",
        "name",
        "headline",
        "label",
        "summary",
        "snippet",
        "description",
      ].includes(field.key)
    ) {
      return normalizeSearchText(normalizeJsonishFieldValue(field.rawValue));
    }
    return "";
  }

  const normalized = normalizeSearchText(value);
  if (!normalized || /^[{}[\],]+$/.test(normalized)) {
    return "";
  }
  return normalized;
}

export function getHostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractSearchResultFromRecord(
  record: Record<string, unknown>,
  index: number,
): SearchResultPreviewItem | null {
  const locator =
    record.locator && typeof record.locator === "object"
      ? (record.locator as Record<string, unknown>)
      : null;
  const url =
    (typeof record.url === "string" &&
      normalizeStructuredUrlCandidate(record.url)) ||
    (typeof record.link === "string" &&
      normalizeStructuredUrlCandidate(record.link)) ||
    (typeof record.href === "string" &&
      normalizeStructuredUrlCandidate(record.href)) ||
    (typeof record.sourceUrl === "string" &&
      normalizeStructuredUrlCandidate(record.sourceUrl)) ||
    (typeof record.source_url === "string" &&
      normalizeStructuredUrlCandidate(record.source_url)) ||
    (typeof record.targetUrl === "string" &&
      normalizeStructuredUrlCandidate(record.targetUrl)) ||
    (typeof record.target_url === "string" &&
      normalizeStructuredUrlCandidate(record.target_url)) ||
    (typeof locator?.url === "string" &&
      normalizeStructuredUrlCandidate(locator.url)) ||
    "";
  if (!url) {
    return null;
  }

  const title =
    (typeof record.title === "string" && normalizeSearchText(record.title)) ||
    (typeof record.name === "string" && normalizeSearchText(record.name)) ||
    (typeof record.headline === "string" &&
      normalizeSearchText(record.headline)) ||
    (typeof record.label === "string" && normalizeSearchText(record.label)) ||
    getHostnameFromUrl(url);
  const snippet =
    (typeof record.summary === "string" &&
      normalizeSearchText(record.summary)) ||
    (typeof record.snippet === "string" &&
      normalizeSearchText(record.snippet)) ||
    (typeof record.description === "string" &&
      normalizeSearchText(record.description)) ||
    (typeof record.content === "string" &&
      normalizeSearchText(record.content)) ||
    (typeof record.preview === "string" &&
      normalizeSearchText(record.preview)) ||
    (typeof record.text === "string" && normalizeSearchText(record.text)) ||
    undefined;

  return {
    id: `search-record-${index}-${url}`,
    title,
    url,
    hostname: getHostnameFromUrl(url),
    snippet: snippet || undefined,
  };
}

function parseSearchResultRecords(rawText: string): SearchResultPreviewItem[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return [];
  }

  const seenUrls = new Set<string>();
  for (const candidate of collectJsonParseCandidates(trimmed)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const queue: unknown[] = [parsed];
      const entries: SearchResultPreviewItem[] = [];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        if (typeof current !== "object") {
          continue;
        }

        const record = current as Record<string, unknown>;
        const extracted = extractSearchResultFromRecord(record, entries.length);
        if (extracted && !seenUrls.has(extracted.url)) {
          seenUrls.add(extracted.url);
          entries.push(extracted);
          if (entries.length >= SEARCH_RESULT_LIST_LIMIT) {
            return entries;
          }
        }

        for (const nested of Object.values(record)) {
          if (nested && typeof nested === "object") {
            queue.push(nested);
          }
        }
      }

      if (entries.length > 0) {
        return entries;
      }
    } catch {
      continue;
    }
  }

  return [];
}

function parseSearchResultText(rawText: string): SearchResultPreviewItem[] {
  const normalizedText = rawText.trim();
  if (!normalizedText) {
    return [];
  }

  const entries: SearchResultPreviewItem[] = [];
  const seenUrls = new Set<string>();

  for (const match of normalizedText.matchAll(SEARCH_MARKDOWN_LINK_RE)) {
    const url = normalizeUrlCandidate(match[2] || "").url;
    if (!url || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    entries.push({
      id: `search-markdown-${entries.length}-${url}`,
      title: normalizeSearchText(match[1] || "") || getHostnameFromUrl(url),
      url,
      hostname: getHostnameFromUrl(url),
    });
    if (entries.length >= SEARCH_RESULT_LIST_LIMIT) {
      return entries;
    }
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index];
    const url = findFirstUrl(currentLine);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    let title = normalizeSearchTitleCandidate(currentLine.replace(url, ""));
    if (!title && index > 0) {
      const previousLine = normalizeSearchTitleCandidate(lines[index - 1] || "");
      if (previousLine && !findFirstUrl(previousLine)) {
        title = previousLine;
      }
    }

    const snippetLines: string[] = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = normalizeSearchTitleCandidate(lines[nextIndex] || "");
      if (!nextLine || findFirstUrl(nextLine)) {
        break;
      }
      if (nextIndex + 1 < lines.length && findFirstUrl(lines[nextIndex + 1])) {
        break;
      }
      snippetLines.push(nextLine);
      if (snippetLines.length >= 2 || snippetLines.join(" ").length >= 180) {
        break;
      }
    }

    seenUrls.add(url);
    entries.push({
      id: `search-text-${entries.length}-${url}`,
      title: title || getHostnameFromUrl(url),
      url,
      hostname: getHostnameFromUrl(url),
      snippet: snippetLines.join(" ").trim() || undefined,
    });

    if (entries.length >= SEARCH_RESULT_LIST_LIMIT) {
      break;
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  for (const match of normalizedText.matchAll(createUrlPattern())) {
    const url = normalizeUrlCandidate(match[0] || "").url;
    if (!url || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    entries.push({
      id: `search-url-${entries.length}-${url}`,
      title: getHostnameFromUrl(url),
      url,
      hostname: getHostnameFromUrl(url),
    });
    if (entries.length >= SEARCH_RESULT_LIST_LIMIT) {
      break;
    }
  }

  return entries;
}

export function resolveSearchResultPreviewItemsFromText(
  rawText?: string | null,
): SearchResultPreviewItem[] {
  const normalizedText = rawText?.trim();
  if (!normalizedText) {
    return [];
  }

  const structuredEntries = parseSearchResultRecords(normalizedText);
  if (structuredEntries.length > 0) {
    return filterUserFacingSearchResults(structuredEntries);
  }

  return filterUserFacingSearchResults(parseSearchResultText(normalizedText));
}
