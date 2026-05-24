import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";

interface ExternalLinkClickEvent {
  defaultPrevented?: boolean;
  preventDefault: () => void;
}

export function resolveHttpExternalHref(href: unknown): string | null {
  const value = typeof href === "string" ? href.trim() : "";
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export function interceptHttpExternalLinkClick(
  event: ExternalLinkClickEvent,
  href: unknown,
): boolean {
  if (event.defaultPrevented) {
    return false;
  }

  const externalHref = resolveHttpExternalHref(href);
  if (!externalHref) {
    return false;
  }

  event.preventDefault();
  void openExternalUrlWithSystemBrowser(externalHref).catch((error) => {
    console.error("打开外部链接失败:", error);
  });

  return true;
}
