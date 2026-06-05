import {
  openBrowserConnectorGuideWindow as openBrowserConnectorGuideWindowCommand,
  type BrowserConnectorGuideMode,
} from "@/lib/webview-api";
import { hasDesktopHostInvokeCapability } from "@/lib/desktop-runtime";

export type { BrowserConnectorGuideMode };

const GUIDE_ROUTE = "/browser-connector-guide";
const GUIDE_WINDOW_SHELL_ROUTE = "index.html";
const GUIDE_WINDOW_ROUTE_PARAM = "lime_window";
const GUIDE_WINDOW_ROUTE_ID = "browser-connector-guide";

export function buildBrowserConnectorGuideUrl(
  mode: BrowserConnectorGuideMode,
): string {
  return `${GUIDE_ROUTE}?mode=${encodeURIComponent(mode)}`;
}

export function buildBrowserConnectorGuideShellUrl(
  mode: BrowserConnectorGuideMode,
): string {
  return `${GUIDE_WINDOW_SHELL_ROUTE}?${GUIDE_WINDOW_ROUTE_PARAM}=${encodeURIComponent(
    GUIDE_WINDOW_ROUTE_ID,
  )}&mode=${encodeURIComponent(mode)}`;
}

export function buildBrowserConnectorGuideNavigationUrl(
  mode: BrowserConnectorGuideMode,
): string {
  if (typeof window === "undefined") {
    return buildBrowserConnectorGuideUrl(mode);
  }

  const params = new URLSearchParams(window.location.search);
  if (
    window.location.pathname === `/${GUIDE_WINDOW_SHELL_ROUTE}` &&
    params.get(GUIDE_WINDOW_ROUTE_PARAM) === GUIDE_WINDOW_ROUTE_ID
  ) {
    return buildBrowserConnectorGuideShellUrl(mode);
  }

  return buildBrowserConnectorGuideUrl(mode);
}

export async function openBrowserConnectorGuideWindow({
  mode,
}: {
  mode: BrowserConnectorGuideMode;
}): Promise<void> {
  if (hasDesktopHostInvokeCapability()) {
    await openBrowserConnectorGuideWindowCommand({ mode });
    return;
  }

  if (typeof window !== "undefined") {
    window.open(
      buildBrowserConnectorGuideUrl(mode),
      "_blank",
      "noopener,noreferrer",
    );
  }
}
