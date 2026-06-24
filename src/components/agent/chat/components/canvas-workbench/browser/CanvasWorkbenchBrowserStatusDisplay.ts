import type {
  EmbeddedBrowserLoadFailureCategory,
  EmbeddedBrowserViewLoadFailedEvent,
} from "@/lib/api/embeddedBrowser";

export type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface BrowserErrorDisplay {
  title: string;
  body: string;
  source: "host" | "load";
}

const BROWSER_LOAD_FAILURE_COPY: Record<
  EmbeddedBrowserLoadFailureCategory,
  { titleKey: string; bodyKey: string }
> = {
  dns: {
    titleKey: "agentChat.canvasWorkbench.browser.loadFailedDnsTitle",
    bodyKey: "agentChat.canvasWorkbench.browser.loadFailedDnsBody",
  },
  tls: {
    titleKey: "agentChat.canvasWorkbench.browser.loadFailedTlsTitle",
    bodyKey: "agentChat.canvasWorkbench.browser.loadFailedTlsBody",
  },
  blocked: {
    titleKey: "agentChat.canvasWorkbench.browser.loadFailedBlockedTitle",
    bodyKey: "agentChat.canvasWorkbench.browser.loadFailedBlockedBody",
  },
  aborted: {
    titleKey: "agentChat.canvasWorkbench.browser.loadFailedAbortedTitle",
    bodyKey: "agentChat.canvasWorkbench.browser.loadFailedAbortedBody",
  },
  load_failed: {
    titleKey: "agentChat.canvasWorkbench.browser.loadFailedTitle",
    bodyKey: "agentChat.canvasWorkbench.browser.loadFailedBody",
  },
};

export function resolveBrowserCommandErrorDisplay(
  error: unknown,
  translateWorkbench: CanvasWorkbenchTranslation,
): BrowserErrorDisplay {
  return {
    title: translateWorkbench(
      "agentChat.canvasWorkbench.browser.loadFailedTitle",
    ),
    body: error instanceof Error ? error.message : String(error),
    source: "host",
  };
}

export function resolveBrowserLoadFailureDisplay(
  event: EmbeddedBrowserViewLoadFailedEvent,
  translateWorkbench: CanvasWorkbenchTranslation,
): BrowserErrorDisplay {
  const copy =
    BROWSER_LOAD_FAILURE_COPY[event.failureCategory] ??
    BROWSER_LOAD_FAILURE_COPY.load_failed;
  const message =
    event.errorDescription ||
    translateWorkbench("agentChat.canvasWorkbench.browser.loadFailedFallback");
  return {
    title: translateWorkbench(copy.titleKey),
    body: translateWorkbench(copy.bodyKey, { message }),
    source: "load",
  };
}
