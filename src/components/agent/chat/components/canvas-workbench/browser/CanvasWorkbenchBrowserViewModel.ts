const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const DOMAIN_LIKE_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;
const LOCALHOST_LIKE_PATTERN =
  /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/i;

export const CANVAS_WORKBENCH_DEFAULT_BROWSER_URL = "https://www.google.com/";

export function normalizeCanvasWorkbenchBrowserUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return CANVAS_WORKBENCH_DEFAULT_BROWSER_URL;
  }

  if (ABSOLUTE_HTTP_URL_PATTERN.test(trimmed)) {
    return resolveCanvasWorkbenchBrowserInputValue(trimmed);
  }

  if (PROTOCOL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (
    DOMAIN_LIKE_PATTERN.test(trimmed) ||
    LOCALHOST_LIKE_PATTERN.test(trimmed)
  ) {
    return resolveCanvasWorkbenchBrowserInputValue(`https://${trimmed}`);
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function resolveCanvasWorkbenchBrowserInputValue(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return url;
  }
}
