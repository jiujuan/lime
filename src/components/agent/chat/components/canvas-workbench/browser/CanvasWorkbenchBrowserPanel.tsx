import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe2,
  Lock,
  RotateCw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  destroyEmbeddedBrowserView,
  findInEmbeddedBrowserView,
  goBackEmbeddedBrowserView,
  goForwardEmbeddedBrowserView,
  isEmbeddedBrowserHostAvailable,
  listenEmbeddedBrowserDownload,
  listenEmbeddedBrowserPermissionRequest,
  listenEmbeddedBrowserViewLoadFailed,
  listenEmbeddedBrowserViewState,
  mountEmbeddedBrowserView,
  navigateEmbeddedBrowserView,
  reloadEmbeddedBrowserView,
  setEmbeddedBrowserViewZoom,
  setEmbeddedBrowserViewBounds,
  stopFindInEmbeddedBrowserView,
  stopLoadingEmbeddedBrowserView,
  type EmbeddedBrowserBounds,
  type EmbeddedBrowserDownloadEvent,
  type EmbeddedBrowserPermissionRequestEvent,
  type EmbeddedBrowserViewState,
} from "@/lib/api/embeddedBrowser";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { cn } from "@/lib/utils";
import {
  normalizeCanvasWorkbenchBrowserUrl,
  resolveCanvasWorkbenchBrowserInputValue,
} from "./CanvasWorkbenchBrowserViewModel";
import { CanvasWorkbenchBrowserDownloadShelf } from "./CanvasWorkbenchBrowserDownloadShelf";
import { CanvasWorkbenchBrowserPermissionBanner } from "./CanvasWorkbenchBrowserPermissionBanner";
import {
  CanvasWorkbenchBrowserErrorBanner,
  CanvasWorkbenchBrowserHostUnavailable,
  CanvasWorkbenchBrowserLoading,
} from "./CanvasWorkbenchBrowserStatusOverlays";
import {
  type BrowserErrorDisplay,
  resolveBrowserCommandErrorDisplay,
  resolveBrowserLoadFailureDisplay,
} from "./CanvasWorkbenchBrowserStatusDisplay";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchBrowserPanelProps {
  ghostButtonClassName: string;
  translateWorkbench: CanvasWorkbenchTranslation;
  initialUrl?: string | null;
  obscuredByChromeOverlay?: boolean;
  onNavigate?: (url: string, title?: string | null) => void;
}

const MIN_BROWSER_ZOOM_FACTOR = 0.5;
const MAX_BROWSER_ZOOM_FACTOR = 3;
const BROWSER_ZOOM_STEP = 0.1;

function resolveElementBounds(element: HTMLElement): EmbeddedBrowserBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function boundsEqual(
  left: EmbeddedBrowserBounds | null,
  right: EmbeddedBrowserBounds,
): boolean {
  return (
    Boolean(left) &&
    left?.x === right.x &&
    left?.y === right.y &&
    left?.width === right.width &&
    left?.height === right.height
  );
}

function clampBrowserZoomFactor(value: number): number {
  return (
    Math.round(
      Math.min(
        MAX_BROWSER_ZOOM_FACTOR,
        Math.max(MIN_BROWSER_ZOOM_FACTOR, value),
      ) * 100,
    ) / 100
  );
}

function formatBrowserZoomPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const CanvasWorkbenchBrowserPanel = memo(
  function CanvasWorkbenchBrowserPanel({
    ghostButtonClassName,
    translateWorkbench,
    initialUrl = null,
    obscuredByChromeOverlay = false,
    onNavigate,
  }: CanvasWorkbenchBrowserPanelProps) {
    const reactId = useId();
    const viewId = useMemo(
      () =>
        `canvas-workbench-browser-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
      [reactId],
    );
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const lastBoundsRef = useRef<EmbeddedBrowserBounds | null>(null);
    const mountedRef = useRef(false);
    const obscuredByChromeOverlayRef = useRef(obscuredByChromeOverlay);
    obscuredByChromeOverlayRef.current = obscuredByChromeOverlay;
    const resolvedInitialUrl = useMemo(
      () => normalizeCanvasWorkbenchBrowserUrl(initialUrl || ""),
      [initialUrl],
    );
    const mountUrlRef = useRef(resolvedInitialUrl);
    const [state, setState] = useState<EmbeddedBrowserViewState | null>(null);
    const [addressValue, setAddressValue] = useState(
      resolveCanvasWorkbenchBrowserInputValue(resolvedInitialUrl),
    );
    const [findVisible, setFindVisible] = useState(false);
    const [findValue, setFindValue] = useState("");
    const [latestDownload, setLatestDownload] =
      useState<EmbeddedBrowserDownloadEvent | null>(null);
    const [latestPermission, setLatestPermission] =
      useState<EmbeddedBrowserPermissionRequestEvent | null>(null);
    const [errorDisplay, setErrorDisplay] =
      useState<BrowserErrorDisplay | null>(null);
    const hostAvailable = isEmbeddedBrowserHostAvailable();
    const onNavigateRef = useRef(onNavigate);
    onNavigateRef.current = onNavigate;

    const syncBounds = useCallback(
      async (force = false) => {
        if (!hostAvailable) {
          return;
        }
        const element = viewportRef.current;
        if (!element) {
          return;
        }
        const bounds = resolveElementBounds(element);
        const visible = bounds.width > 0 && bounds.height > 0;
        if (!force && boundsEqual(lastBoundsRef.current, bounds)) {
          return;
        }
        lastBoundsRef.current = bounds;
        if (!mountedRef.current) {
          return;
        }
        try {
          await setEmbeddedBrowserViewBounds({
            viewId,
            bounds,
            visible: visible && !obscuredByChromeOverlayRef.current,
          });
          setErrorDisplay((current) =>
            current?.source === "host" ? null : current,
          );
        } catch (error) {
          setErrorDisplay(
            resolveBrowserCommandErrorDisplay(error, translateWorkbench),
          );
        }
      },
      [hostAvailable, translateWorkbench, viewId],
    );

    const navigateTo = useCallback(
      async (value: string) => {
        if (!hostAvailable) {
          return;
        }
        const nextUrl = normalizeCanvasWorkbenchBrowserUrl(value);
        setAddressValue(resolveCanvasWorkbenchBrowserInputValue(nextUrl));
        try {
          const nextState = await navigateEmbeddedBrowserView({
            viewId,
            url: nextUrl,
          });
          setState(nextState);
          setErrorDisplay(null);
          onNavigate?.(nextState.url || nextUrl, nextState.title);
        } catch (error) {
          setErrorDisplay(
            resolveBrowserCommandErrorDisplay(error, translateWorkbench),
          );
        }
      },
      [hostAvailable, onNavigate, translateWorkbench, viewId],
    );

    useEffect(() => {
      if (!hostAvailable) {
        mountedRef.current = false;
        setState(null);
        setErrorDisplay(null);
        return;
      }
      let cancelled = false;
      const element = viewportRef.current;
      const bounds = element ? resolveElementBounds(element) : undefined;
      if (bounds) {
        lastBoundsRef.current = bounds;
      }

      void mountEmbeddedBrowserView({
        viewId,
        url: mountUrlRef.current,
        bounds,
        visible: Boolean(
          bounds &&
          bounds.width > 0 &&
          bounds.height > 0 &&
          !obscuredByChromeOverlayRef.current,
        ),
      })
        .then((nextState) => {
          if (cancelled) {
            return;
          }
          mountedRef.current = true;
          setState(nextState);
          setAddressValue(
            resolveCanvasWorkbenchBrowserInputValue(nextState.url),
          );
          setErrorDisplay(null);
          onNavigateRef.current?.(
            nextState.url || mountUrlRef.current,
            nextState.title,
          );
          void syncBounds(true);
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorDisplay(
              resolveBrowserCommandErrorDisplay(error, translateWorkbench),
            );
          }
        });

      return () => {
        cancelled = true;
        mountedRef.current = false;
        void destroyEmbeddedBrowserView(viewId).catch(() => undefined);
      };
    }, [hostAvailable, syncBounds, translateWorkbench, viewId]);

    useEffect(() => {
      if (!hostAvailable) {
        return;
      }
      let disposed = false;
      let unlistenState: (() => void) | undefined;
      let unlistenLoadFailed: (() => void) | undefined;
      let unlistenDownload: (() => void) | undefined;
      let unlistenPermission: (() => void) | undefined;
      const handleState = (nextState: EmbeddedBrowserViewState) => {
        if (nextState.viewId !== viewId) {
          return;
        }
        setState(nextState);
        if (nextState.isLoading) {
          setErrorDisplay(null);
        }
        if (nextState.url) {
          setAddressValue(
            resolveCanvasWorkbenchBrowserInputValue(nextState.url),
          );
          onNavigateRef.current?.(nextState.url, nextState.title);
        }
      };
      void listenEmbeddedBrowserViewState(handleState)
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
            return;
          }
          unlistenState = nextUnlisten;
        })
        .catch(() => undefined);
      void listenEmbeddedBrowserViewLoadFailed((event) => {
        if (event.viewId !== viewId) {
          return;
        }
        setState(event);
        setAddressValue(resolveCanvasWorkbenchBrowserInputValue(event.url));
        setErrorDisplay(
          resolveBrowserLoadFailureDisplay(event, translateWorkbench),
        );
      })
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
            return;
          }
          unlistenLoadFailed = nextUnlisten;
        })
        .catch(() => undefined);
      void listenEmbeddedBrowserDownload((event) => {
        if (event.viewId !== viewId) {
          return;
        }
        setLatestDownload(event);
      })
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
            return;
          }
          unlistenDownload = nextUnlisten;
        })
        .catch(() => undefined);
      void listenEmbeddedBrowserPermissionRequest((event) => {
        if (event.viewId !== viewId) {
          return;
        }
        setLatestPermission(event);
      })
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
            return;
          }
          unlistenPermission = nextUnlisten;
        })
        .catch(() => undefined);

      return () => {
        disposed = true;
        unlistenState?.();
        unlistenLoadFailed?.();
        unlistenDownload?.();
        unlistenPermission?.();
      };
    }, [hostAvailable, translateWorkbench, viewId]);

    useEffect(() => {
      const element = viewportRef.current;
      if (!hostAvailable) {
        return;
      }
      if (!element) {
        return;
      }
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              void syncBounds();
            });
      observer?.observe(element);
      const handleWindowChange = () => {
        void syncBounds();
      };
      window.addEventListener("resize", handleWindowChange);
      window.addEventListener("scroll", handleWindowChange, true);
      void syncBounds(true);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", handleWindowChange);
        window.removeEventListener("scroll", handleWindowChange, true);
      };
    }, [hostAvailable, syncBounds]);

    useEffect(() => {
      if (!hostAvailable || !mountedRef.current) {
        return;
      }
      void syncBounds(true);
    }, [hostAvailable, obscuredByChromeOverlay, syncBounds]);

    useEffect(() => {
      if (!hostAvailable) {
        return;
      }
      if (!mountedRef.current || resolvedInitialUrl === state?.url) {
        return;
      }
      void navigateTo(resolvedInitialUrl);
    }, [hostAvailable, navigateTo, resolvedInitialUrl, state?.url]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void navigateTo(addressValue);
    };

    const handleOpenExternal = async () => {
      try {
        await openExternalUrlWithSystemBrowser(
          state?.url || resolvedInitialUrl,
        );
      } catch (error) {
        toast.error(
          translateWorkbench(
            "agentChat.canvasWorkbench.browser.openExternalFailed",
            {
              message: error instanceof Error ? error.message : String(error),
            },
          ),
        );
      }
    };

    const handleBrowserCommand = async (
      command: () => Promise<EmbeddedBrowserViewState>,
    ) => {
      try {
        setState(await command());
        setErrorDisplay(null);
      } catch (error) {
        setErrorDisplay(
          resolveBrowserCommandErrorDisplay(error, translateWorkbench),
        );
      }
    };

    const pageTitle =
      state?.title?.trim() ||
      translateWorkbench("agentChat.canvasWorkbench.browser.title");
    const faviconUrl = state?.faviconUrl || null;
    const loadProgress =
      typeof state?.loadProgress === "number"
        ? Math.min(1, Math.max(0, state.loadProgress))
        : state?.isLoading
          ? 0.35
          : 1;
    const zoomFactor =
      typeof state?.zoomFactor === "number" ? state.zoomFactor : 1;
    const findState = state?.find ?? {
      text: "",
      activeMatchOrdinal: 0,
      matches: 0,
      finalUpdate: true,
    };

    const runFind = (forward: boolean, findNext: boolean) => {
      const text = findValue.trim();
      if (!text) {
        void handleBrowserCommand(() => stopFindInEmbeddedBrowserView(viewId));
        return;
      }
      void handleBrowserCommand(() =>
        findInEmbeddedBrowserView({
          viewId,
          text,
          forward,
          findNext,
        }),
      );
    };

    const handleFindKeyDown = (
      event: KeyboardEvent<HTMLInputElement>,
    ): void => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      runFind(!event.shiftKey, true);
    };

    const updateZoom = (nextZoomFactor: number) => {
      void handleBrowserCommand(() =>
        setEmbeddedBrowserViewZoom(
          viewId,
          clampBrowserZoomFactor(nextZoomFactor),
        ),
      );
    };

    return (
      <section
        data-testid="canvas-workbench-panel-browser"
        className="flex h-full min-h-0 flex-col bg-white"
      >
        <form
          onSubmit={handleSubmit}
          className="relative flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2"
        >
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.browser.back",
            )}
            disabled={!state?.canGoBack}
            onClick={() => {
              void handleBrowserCommand(() =>
                goBackEmbeddedBrowserView(viewId),
              );
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              ghostButtonClassName,
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.browser.forward",
            )}
            disabled={!state?.canGoForward}
            onClick={() => {
              void handleBrowserCommand(() =>
                goForwardEmbeddedBrowserView(viewId),
              );
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              ghostButtonClassName,
            )}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={translateWorkbench(
              state?.isLoading
                ? "agentChat.canvasWorkbench.browser.stop"
                : "agentChat.canvasWorkbench.browser.refresh",
            )}
            disabled={!hostAvailable}
            onClick={() => {
              void handleBrowserCommand(() =>
                state?.isLoading
                  ? stopLoadingEmbeddedBrowserView(viewId)
                  : reloadEmbeddedBrowserView(viewId),
              );
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              ghostButtonClassName,
            )}
          >
            {state?.isLoading ? (
              <X className="h-4 w-4" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </button>
          <div
            className="flex h-8 min-w-[96px] max-w-[170px] flex-[0_1_170px] items-center gap-1.5 overflow-hidden rounded-[8px] border border-slate-200 bg-white px-2 text-[12px] text-slate-600"
            title={pageTitle}
          >
            {faviconUrl ? (
              <img
                alt=""
                className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
                src={faviconUrl}
              />
            ) : (
              <Globe2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            <span className="truncate">{pageTitle}</span>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-500">
            <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              aria-label={translateWorkbench(
                "agentChat.canvasWorkbench.browser.address",
              )}
              value={addressValue}
              onChange={(event) => setAddressValue(event.target.value)}
              disabled={!hostAvailable}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
              placeholder={translateWorkbench(
                "agentChat.canvasWorkbench.browser.addressPlaceholder",
              )}
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.browser.find",
            )}
            title={translateWorkbench("agentChat.canvasWorkbench.browser.find")}
            disabled={!hostAvailable}
            onClick={() => setFindVisible((visible) => !visible)}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              findVisible
                ? "border-slate-300 bg-white text-slate-900"
                : ghostButtonClassName,
            )}
          >
            <Search className="h-4 w-4" />
          </button>
          {findVisible ? (
            <div className="flex h-8 w-[210px] shrink-0 items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-1.5 text-[12px] text-slate-600">
              <input
                aria-label={translateWorkbench(
                  "agentChat.canvasWorkbench.browser.findInput",
                )}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
                value={findValue}
                placeholder={translateWorkbench(
                  "agentChat.canvasWorkbench.browser.findPlaceholder",
                )}
                onChange={(event) => setFindValue(event.target.value)}
                onKeyDown={handleFindKeyDown}
                disabled={!hostAvailable}
                spellCheck={false}
              />
              <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">
                {translateWorkbench(
                  "agentChat.canvasWorkbench.browser.findMatchCount",
                  {
                    active: findState.activeMatchOrdinal,
                    total: findState.matches,
                  },
                )}
              </span>
              <button
                type="button"
                aria-label={translateWorkbench(
                  "agentChat.canvasWorkbench.browser.findPrevious",
                )}
                disabled={!hostAvailable || !findValue.trim()}
                onClick={() => runFind(false, true)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={translateWorkbench(
                  "agentChat.canvasWorkbench.browser.findNext",
                )}
                disabled={!hostAvailable || !findValue.trim()}
                onClick={() => runFind(true, true)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <div className="flex h-8 shrink-0 items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-1">
            <button
              type="button"
              aria-label={translateWorkbench(
                "agentChat.canvasWorkbench.browser.zoomOut",
              )}
              disabled={!hostAvailable || zoomFactor <= MIN_BROWSER_ZOOM_FACTOR}
              onClick={() => updateZoom(zoomFactor - BROWSER_ZOOM_STEP)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={translateWorkbench(
                "agentChat.canvasWorkbench.browser.zoomReset",
              )}
              disabled={!hostAvailable}
              onClick={() => updateZoom(1)}
              className="inline-flex h-6 min-w-10 items-center justify-center rounded-[6px] px-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {formatBrowserZoomPercent(zoomFactor)}
            </button>
            <button
              type="button"
              aria-label={translateWorkbench(
                "agentChat.canvasWorkbench.browser.zoomIn",
              )}
              disabled={!hostAvailable || zoomFactor >= MAX_BROWSER_ZOOM_FACTOR}
              onClick={() => updateZoom(zoomFactor + BROWSER_ZOOM_STEP)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.browser.openExternal",
            )}
            title={translateWorkbench(
              "agentChat.canvasWorkbench.browser.openExternal",
            )}
            onClick={() => {
              void handleOpenExternal();
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors",
              ghostButtonClassName,
            )}
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          {state?.isLoading ? (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent"
            >
              <div
                className="h-full bg-emerald-500 transition-[width] duration-150"
                style={{ width: `${Math.max(8, loadProgress * 100)}%` }}
              />
            </div>
          ) : null}
        </form>
        <div className="relative min-h-0 flex-1 bg-white">
          <div
            ref={viewportRef}
            data-testid="canvas-workbench-browser-viewport"
            className="absolute inset-0 bg-white"
          />
          {!hostAvailable ? (
            <CanvasWorkbenchBrowserHostUnavailable
              translateWorkbench={translateWorkbench}
            />
          ) : !state && !errorDisplay ? (
            <CanvasWorkbenchBrowserLoading
              translateWorkbench={translateWorkbench}
            />
          ) : null}
          {errorDisplay ? (
            <CanvasWorkbenchBrowserErrorBanner error={errorDisplay} />
          ) : null}
          {!errorDisplay && latestPermission ? (
            <CanvasWorkbenchBrowserPermissionBanner
              permission={latestPermission}
              translateWorkbench={translateWorkbench}
            />
          ) : null}
          {latestDownload ? (
            <CanvasWorkbenchBrowserDownloadShelf
              download={latestDownload}
              translateWorkbench={translateWorkbench}
            />
          ) : null}
        </div>
      </section>
    );
  },
);

CanvasWorkbenchBrowserPanel.displayName = "CanvasWorkbenchBrowserPanel";
