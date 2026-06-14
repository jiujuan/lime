import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Lock,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  destroyEmbeddedBrowserView,
  goBackEmbeddedBrowserView,
  goForwardEmbeddedBrowserView,
  isEmbeddedBrowserHostAvailable,
  listenEmbeddedBrowserViewLoadFailed,
  listenEmbeddedBrowserViewState,
  mountEmbeddedBrowserView,
  navigateEmbeddedBrowserView,
  reloadEmbeddedBrowserView,
  setEmbeddedBrowserViewBounds,
  type EmbeddedBrowserBounds,
  type EmbeddedBrowserViewState,
} from "@/lib/api/embeddedBrowser";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { cn } from "@/lib/utils";
import {
  normalizeCanvasWorkbenchBrowserUrl,
  resolveCanvasWorkbenchBrowserInputValue,
} from "./CanvasWorkbenchBrowserViewModel";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchBrowserPanelProps {
  ghostButtonClassName: string;
  translateWorkbench: CanvasWorkbenchTranslation;
  initialUrl?: string | null;
  obscuredByChromeOverlay?: boolean;
  onNavigate?: (url: string) => void;
}

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
    const [errorText, setErrorText] = useState<string | null>(null);
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
          setErrorText(null);
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      },
      [hostAvailable, viewId],
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
          setErrorText(null);
          onNavigate?.(nextUrl);
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      },
      [hostAvailable, onNavigate, viewId],
    );

    useEffect(() => {
      if (!hostAvailable) {
        mountedRef.current = false;
        setState(null);
        setErrorText(null);
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
          setErrorText(null);
          onNavigateRef.current?.(nextState.url || mountUrlRef.current);
          void syncBounds(true);
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorText(
              error instanceof Error ? error.message : String(error),
            );
          }
        });

      return () => {
        cancelled = true;
        mountedRef.current = false;
        void destroyEmbeddedBrowserView(viewId).catch(() => undefined);
      };
    }, [hostAvailable, syncBounds, viewId]);

    useEffect(() => {
      if (!hostAvailable) {
        return;
      }
      let disposed = false;
      let unlistenState: (() => void) | undefined;
      let unlistenLoadFailed: (() => void) | undefined;
      const handleState = (nextState: EmbeddedBrowserViewState) => {
        if (nextState.viewId !== viewId) {
          return;
        }
        setState(nextState);
        if (nextState.isLoading) {
          setErrorText(null);
        }
        if (nextState.url) {
          setAddressValue(
            resolveCanvasWorkbenchBrowserInputValue(nextState.url),
          );
          onNavigateRef.current?.(nextState.url);
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
        setErrorText(
          event.errorDescription ||
            translateWorkbench(
              "agentChat.canvasWorkbench.browser.loadFailedTitle",
            ),
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

      return () => {
        disposed = true;
        unlistenState?.();
        unlistenLoadFailed?.();
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
        setErrorText(null);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    };

    return (
      <section
        data-testid="canvas-workbench-panel-browser"
        className="flex h-full min-h-0 flex-col bg-white"
      >
        <form
          onSubmit={handleSubmit}
          className="flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2"
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
              "agentChat.canvasWorkbench.browser.refresh",
            )}
            disabled={!hostAvailable}
            onClick={() => {
              void handleBrowserCommand(() =>
                reloadEmbeddedBrowserView(viewId),
              );
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              ghostButtonClassName,
            )}
          >
            <RotateCw
              className={cn("h-4 w-4", state?.isLoading && "animate-spin")}
            />
          </button>
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
        </form>
        <div className="relative min-h-0 flex-1 bg-white">
          <div
            ref={viewportRef}
            data-testid="canvas-workbench-browser-viewport"
            className="absolute inset-0 bg-white"
          />
          {!hostAvailable ? (
            <div
              data-testid="canvas-workbench-browser-host-unavailable"
              className="absolute inset-0 flex items-center justify-center p-6"
            >
              <div className="max-w-[380px] text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-amber-200 bg-amber-50 text-amber-700 shadow-sm shadow-amber-950/5">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="text-[15px] font-semibold text-slate-900">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.browser.hostUnavailableTitle",
                  )}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-slate-500">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.browser.hostUnavailableBody",
                  )}
                </div>
              </div>
            </div>
          ) : !state && !errorText ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-[360px] text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-950/5">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="text-[15px] font-semibold text-slate-900">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.browser.title",
                  )}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-slate-500">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.browser.loading",
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {errorText ? (
            <div
              data-testid="canvas-workbench-browser-error"
              className="absolute inset-x-4 top-4 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-900 shadow-sm shadow-rose-950/5"
            >
              <div className="font-medium">
                {translateWorkbench(
                  "agentChat.canvasWorkbench.browser.loadFailedTitle",
                )}
              </div>
              <div className="mt-0.5 text-rose-800/90">{errorText}</div>
            </div>
          ) : null}
        </div>
      </section>
    );
  },
);

CanvasWorkbenchBrowserPanel.displayName = "CanvasWorkbenchBrowserPanel";
