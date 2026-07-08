import type {
  BuildThreadReliabilityViewParams,
  ThreadReliabilityViewTextContext,
} from "./threadReliabilityTypes";

const VIEW_I18N_PREFIX = "agentChat.threadReliability.view.";
const DEFAULT_VIEW_LOCALE = "en-US";

export function createThreadReliabilityViewTextContext(
  params: Pick<BuildThreadReliabilityViewParams, "t" | "locale">,
): ThreadReliabilityViewTextContext {
  return {
    t: params.t,
    locale: params.locale?.trim() || DEFAULT_VIEW_LOCALE,
  };
}

function interpolateFallback(
  template: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return template;
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = options[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function viewText(
  context: ThreadReliabilityViewTextContext,
  key: string,
  fallback: string,
  options?: Record<string, unknown>,
): string {
  const fullKey = `${VIEW_I18N_PREFIX}${key}`;
  const translated = context.t?.(fullKey, options);
  if (translated && translated !== fullKey) {
    return translated;
  }
  return interpolateFallback(fallback, options);
}

export function normalizeText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

export function shortenText(
  value?: string | null,
  maxLength = 52,
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDateValue(value?: string | number | null): Date | null {
  if (typeof value === "number") {
    const normalizedValue = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function formatTimeLabel(
  value: string | number | null | undefined,
  context: ThreadReliabilityViewTextContext,
): string | null {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }

  return date.toLocaleString(context.locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWaitingLabel(
  value: string | number | null | undefined,
  context: ThreadReliabilityViewTextContext,
): string | null {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }

  const deltaMs = Math.max(0, Date.now() - date.getTime());
  const deltaMinutes = Math.floor(deltaMs / 60_000);
  const deltaHours = Math.floor(deltaMinutes / 60);

  if (deltaMinutes < 1) {
    return viewText(context, "time.justNow", "Just now");
  }
  if (deltaMinutes < 60) {
    return viewText(context, "time.waitingMinutes", "Waiting {{count}} min", {
      count: deltaMinutes,
    });
  }
  if (deltaHours < 24) {
    return viewText(context, "time.waitingHours", "Waiting {{count}} hr", {
      count: deltaHours,
    });
  }
  return viewText(context, "time.waitingDays", "Waiting {{count}} days", {
    count: Math.floor(deltaHours / 24),
  });
}
