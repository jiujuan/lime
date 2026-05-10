/**
 * DOM Text Replacer Utility
 *
 * Replaces Chinese text in the DOM with translated text using a TreeWalker.
 * This is the core of the Patch Layer architecture.
 *
 * Key features:
 * - Walks the entire DOM tree to find text nodes
 * - Replaces Chinese text with translations based on the current language
 * - Skips script, style, and already patched nodes
 * - Handles multiple Chinese segments in a single text node
 * - Marks patched nodes to avoid double-patching
 */

import { getTextMap, Language } from "./text-map";

const EDITABLE_CONTAINER_SELECTOR =
  "input, textarea, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only'], .ProseMirror";
const CHINESE_TEXT_REGEX = /[\u3400-\u9fff]/;

interface CompiledPatchMap {
  matcher: RegExp | null;
  replacements: Map<string, string>;
}

export interface I18nPatchRunMetrics {
  durationMs: number;
  language: Language;
  matchedSegments: number;
  replacedNodes: number;
  rootKind: "document" | "text" | "element" | "other";
  timestamp: number;
}

export interface I18nPatchMetrics {
  patchTimes: number[];
  languageChanges: number;
  totalRuns: number;
  totalReplacedNodes: number;
  totalMatchedSegments: number;
  runs: I18nPatchRunMetrics[];
  lastRun: I18nPatchRunMetrics | null;
}

export interface I18nPatchMetricsReport {
  averagePatchTimeMs: number;
  languageChanges: number;
  lastRun: I18nPatchRunMetrics | null;
  recentRuns: I18nPatchRunMetrics[];
  slowestPatchTimeMs: number;
  totalMatchedSegments: number;
  totalReplacedNodes: number;
  totalRuns: number;
}

interface TextReplacementResult {
  matchedSegments: number;
  replaced: boolean;
}

const MAX_PATCH_RUN_RECORDS = 200;
const compiledPatchMapCache = new Map<Language, CompiledPatchMap>();

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCompiledPatchMap(language: Language): CompiledPatchMap {
  const cached = compiledPatchMapCache.get(language);
  if (cached) {
    return cached;
  }

  const patches = getTextMap(language);
  const entries = Object.entries(patches)
    .filter(
      ([key, value]) =>
        key.length > 0 && key !== value && !key.startsWith("//"),
    )
    .sort(([left], [right]) => right.length - left.length);

  if (entries.length === 0) {
    const emptyCompiled = { matcher: null, replacements: new Map() };
    compiledPatchMapCache.set(language, emptyCompiled);
    return emptyCompiled;
  }

  const replacements = new Map<string, string>(entries);
  const pattern = entries.map(([key]) => escapeRegExp(key)).join("|");
  const matcher = new RegExp(pattern, "g");
  const compiled = { matcher, replacements };
  compiledPatchMapCache.set(language, compiled);
  return compiled;
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) {
    return true;
  }

  const tagName = parent.tagName;
  if (tagName === "SCRIPT" || tagName === "STYLE") {
    return true;
  }

  if (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    parent.matches(EDITABLE_CONTAINER_SELECTOR) ||
    parent.closest(EDITABLE_CONTAINER_SELECTOR)
  ) {
    return true;
  }

  const text = node.textContent;
  if (!text || !CHINESE_TEXT_REGEX.test(text)) {
    return true;
  }

  return false;
}

function createEmptyI18nPatchMetrics(): I18nPatchMetrics {
  return {
    patchTimes: [],
    languageChanges: 0,
    totalRuns: 0,
    totalReplacedNodes: 0,
    totalMatchedSegments: 0,
    runs: [],
    lastRun: null,
  };
}

function ensureI18nPatchMetrics(): I18nPatchMetrics | null {
  if (typeof window === "undefined") {
    return null;
  }

  window.__I18N_METRICS__ ??= createEmptyI18nPatchMetrics();
  return window.__I18N_METRICS__;
}

function resolveRootKind(root: Node): I18nPatchRunMetrics["rootKind"] {
  if (root === document.body) {
    return "document";
  }

  if (root.nodeType === Node.TEXT_NODE) {
    return "text";
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    return "element";
  }

  return "other";
}

function recordPatchRun(run: I18nPatchRunMetrics): void {
  const metrics = ensureI18nPatchMetrics();
  if (!metrics) {
    return;
  }

  metrics.patchTimes.push(run.durationMs);
  metrics.totalRuns += 1;
  metrics.totalReplacedNodes += run.replacedNodes;
  metrics.totalMatchedSegments += run.matchedSegments;
  metrics.runs.push(run);
  if (metrics.runs.length > MAX_PATCH_RUN_RECORDS) {
    metrics.runs.splice(0, metrics.runs.length - MAX_PATCH_RUN_RECORDS);
  }
  metrics.lastRun = run;
}

export function recordI18nLanguageChange(): void {
  const metrics = ensureI18nPatchMetrics();
  if (metrics) {
    metrics.languageChanges += 1;
  }
}

export function resetI18nPatchMetrics(): I18nPatchMetrics {
  const metrics = createEmptyI18nPatchMetrics();
  if (typeof window !== "undefined") {
    window.__I18N_METRICS__ = metrics;
  }
  return metrics;
}

export function getI18nPatchMetricsReport(): I18nPatchMetricsReport {
  const metrics = ensureI18nPatchMetrics() ?? createEmptyI18nPatchMetrics();
  const totalPatchTime = metrics.patchTimes.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const averagePatchTimeMs =
    metrics.patchTimes.length > 0
      ? totalPatchTime / metrics.patchTimes.length
      : 0;
  const slowestPatchTimeMs =
    metrics.patchTimes.length > 0 ? Math.max(...metrics.patchTimes) : 0;

  return {
    averagePatchTimeMs,
    languageChanges: metrics.languageChanges,
    lastRun: metrics.lastRun,
    recentRuns: [...metrics.runs],
    slowestPatchTimeMs,
    totalMatchedSegments: metrics.totalMatchedSegments,
    totalReplacedNodes: metrics.totalReplacedNodes,
    totalRuns: metrics.totalRuns,
  };
}

function replaceTextNode(
  node: Text,
  compiled: CompiledPatchMap,
): TextReplacementResult {
  const originalText = node.textContent;
  if (!originalText || !compiled.matcher) {
    return { matchedSegments: 0, replaced: false };
  }

  compiled.matcher.lastIndex = 0;
  let matchedSegments = 0;
  const nextText = originalText.replace(compiled.matcher, (matched) => {
    const replacement = compiled.replacements.get(matched);
    if (replacement === undefined) {
      return matched;
    }
    matchedSegments += 1;
    return replacement;
  });

  if (nextText === originalText) {
    return { matchedSegments: 0, replaced: false };
  }

  node.textContent = nextText;
  return { matchedSegments, replaced: true };
}

function replaceTextInNodeInternal(
  root: Node,
  language: Language,
): I18nPatchRunMetrics {
  const startTime = performance.now();
  const rootKind = resolveRootKind(root);

  if (!root.isConnected && root !== document.body) {
    const run = {
      durationMs: performance.now() - startTime,
      language,
      matchedSegments: 0,
      replacedNodes: 0,
      rootKind,
      timestamp: Date.now(),
    };
    recordPatchRun(run);
    return run;
  }

  const compiled = getCompiledPatchMap(language);
  let replacedNodes = 0;
  let matchedSegments = 0;

  if (!compiled.matcher) {
    // Still record zero-hit runs so migration reports can show Patch Layer usage.
  } else if (root.nodeType === Node.TEXT_NODE) {
    const textNode = root as Text;
    if (!shouldSkipTextNode(textNode)) {
      const result = replaceTextNode(textNode, compiled);
      if (result.replaced) {
        replacedNodes += 1;
        matchedSegments += result.matchedSegments;
      }
    }
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (shouldSkipTextNode(node as Text)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current: Node | null;
    while ((current = walker.nextNode())) {
      const result = replaceTextNode(current as Text, compiled);
      if (result.replaced) {
        replacedNodes += 1;
        matchedSegments += result.matchedSegments;
      }
    }
  }

  const duration = performance.now() - startTime;
  const run = {
    durationMs: duration,
    language,
    matchedSegments,
    replacedNodes,
    rootKind,
    timestamp: Date.now(),
  };
  recordPatchRun(run);

  if (duration > 50) {
    console.warn(
      `[i18n] DOM replacement took ${duration.toFixed(2)}ms (replaced=${replacedNodes}, matched=${matchedSegments})`,
    );
  }

  return run;
}

/**
 * Replace text in DOM nodes with translations
 *
 * @param language - Target language ('zh' or 'en')
 */
export function replaceTextInDOM(language: Language): I18nPatchRunMetrics {
  return replaceTextInNodeInternal(document.body, language);
}

/**
 * Replace text in a specific subtree.
 *
 * 适用于 MutationObserver 场景，只处理新增或变更节点，避免全量扫描。
 */
export function replaceTextInNode(
  root: Node,
  language: Language,
): I18nPatchRunMetrics {
  return replaceTextInNodeInternal(root, language);
}

// Declare global type for metrics
declare global {
  interface Window {
    __I18N_METRICS__?: {
      patchTimes: number[];
      languageChanges: number;
      totalRuns: number;
      totalReplacedNodes: number;
      totalMatchedSegments: number;
      runs: I18nPatchRunMetrics[];
      lastRun: I18nPatchRunMetrics | null;
    };
  }
}

ensureI18nPatchMetrics();
