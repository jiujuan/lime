import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MonitorUp, X } from "lucide-react";
import {
  destroyEmbeddedBrowserView,
  isEmbeddedBrowserHostAvailable,
  listenEmbeddedBrowserViewLoadFailed,
  listenEmbeddedBrowserViewState,
  mountEmbeddedBrowserView,
  navigateEmbeddedBrowserView,
  setEmbeddedBrowserViewBounds,
  type EmbeddedBrowserBounds,
  type EmbeddedBrowserViewState,
} from "@/lib/api/embeddedBrowser";
import {
  selectWorkspacePluginSurfaceDescriptor,
  type WorkspacePluginSurfaceDescriptor,
} from "./workspacePluginSurfaceModel";

interface WorkspacePluginSurfaceProps {
  activeContainerId?: string | null;
  onCloseSurface?: (surface: WorkspacePluginSurfaceDescriptor) => void;
  onSelectSurface?: (surface: WorkspacePluginSurfaceDescriptor) => void;
  surface?: WorkspacePluginSurfaceDescriptor | null;
  surfaces?: readonly WorkspacePluginSurfaceDescriptor[];
}

type PluginSurfaceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function WorkspacePluginSurface({
  activeContainerId,
  onCloseSurface,
  onSelectSurface,
  surface,
  surfaces,
}: WorkspacePluginSurfaceProps): ReactElement {
  const { t } = useTranslation("agent");
  const dynamicT = t as PluginSurfaceTranslation;
  const surfaceList = useMemo(
    () =>
      normalizeWorkspacePluginSurfaces(
        surfaces ?? (surface ? [surface] : []),
      ),
    [surface, surfaces],
  );
  const activeSurface = selectWorkspacePluginSurfaceDescriptor(
    surfaceList,
    activeContainerId,
  );

  if (!activeSurface) {
    return (
      <section
        className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)]"
        data-testid="workspace-plugin-surface"
      />
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)]"
      data-testid="workspace-plugin-surface"
    >
      {surfaceList.length > 1 ? (
        <div
          className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-2"
          data-testid="workspace-plugin-surface-tabs"
          role="tablist"
        >
          {surfaceList.map((item) => {
            const active = item.containerId === activeSurface.containerId;
            const closeLabel = `${dynamicT("agentChat.pluginSurface.closeTab")} ${item.title}`;
            return (
              <div
                key={item.containerId}
                className={`inline-flex h-7 shrink-0 items-center rounded-xl border ${
                  active
                    ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-chrome-tab-active-surface)]"
                    : "border-transparent bg-transparent hover:bg-[color:var(--lime-chrome-tab-hover)]"
                }`}
              >
                <button
                  type="button"
                  className={`h-full min-w-0 max-w-[160px] truncate px-2 text-xs font-medium ${
                    active
                      ? "text-[color:var(--lime-text-strong)]"
                      : "text-[color:var(--lime-text-muted)] hover:text-[color:var(--lime-text-strong)]"
                  }`}
                  aria-selected={active}
                  data-testid={`workspace-plugin-surface-tab-${item.containerId}`}
                  role="tab"
                  onClick={() => onSelectSurface?.(item)}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-lg text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface)] hover:text-[color:var(--lime-text-strong)]"
                  aria-label={closeLabel}
                  title={closeLabel}
                  data-testid={`workspace-plugin-surface-close-${item.containerId}`}
                  onClick={() => onCloseSurface?.(item)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {surfaceList.map((item) => (
          <WorkspacePluginSurfaceFrame
            key={item.containerId}
            active={item.containerId === activeSurface.containerId}
            surface={item}
          />
        ))}
      </div>
    </section>
  );
}

function WorkspacePluginSurfaceFrame({
  active,
  surface,
}: {
  active: boolean;
  surface: WorkspacePluginSurfaceDescriptor;
}): ReactElement {
  const { t } = useTranslation("agent");
  const dynamicT = t as PluginSurfaceTranslation;
  const viewId = useMemo(
    () => `plugin-surface-${sanitizeViewId(surface.containerId)}`,
    [surface.containerId],
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(active);
  const lastBoundsRef = useRef<EmbeddedBrowserBounds | null>(null);
  const lastVisibleRef = useRef<boolean | null>(null);
  const latestEntryUrlRef = useRef(surface.entryUrl);
  activeRef.current = active;
  latestEntryUrlRef.current = surface.entryUrl;
  const [state, setState] = useState<EmbeddedBrowserViewState | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const hostAvailable = isEmbeddedBrowserHostAvailable();

  const syncBounds = useCallback(
    async (force = false) => {
      if (!hostAvailable || !mountedRef.current) {
        return;
      }
      const element = active ? viewportRef.current : null;
      const bounds = element
        ? resolveElementBounds(element)
        : HIDDEN_EMBEDDED_BROWSER_BOUNDS;
      const visible = active && bounds.width > 0 && bounds.height > 0;
      if (
        !force &&
        boundsEqual(lastBoundsRef.current, bounds) &&
        lastVisibleRef.current === visible
      ) {
        return;
      }
      lastBoundsRef.current = bounds;
      lastVisibleRef.current = visible;
      try {
        await setEmbeddedBrowserViewBounds({
          viewId,
          bounds,
          visible,
        });
        setErrorText(null);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    },
    [active, hostAvailable, viewId],
  );

  useEffect(() => {
    if (!hostAvailable) {
      mountedRef.current = false;
      setState(null);
      setErrorText(null);
      return;
    }

    let cancelled = false;
    const isActive = activeRef.current;
    const element = isActive ? viewportRef.current : null;
    const bounds = element
      ? resolveElementBounds(element)
      : HIDDEN_EMBEDDED_BROWSER_BOUNDS;
    const visible = isActive && bounds.width > 0 && bounds.height > 0;
    lastBoundsRef.current = bounds;
    lastVisibleRef.current = visible;

    void mountEmbeddedBrowserView({
      viewId,
      url: latestEntryUrlRef.current,
      bounds,
      visible,
    })
      .then((nextState) => {
        if (cancelled) {
          return;
        }
        mountedRef.current = true;
        setState(nextState);
        setErrorText(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      void destroyEmbeddedBrowserView(viewId).catch(() => undefined);
    };
  }, [hostAvailable, viewId]);

  useEffect(() => {
    if (!hostAvailable || !mountedRef.current) {
      return;
    }
    void syncBounds(true);
  }, [active, hostAvailable, syncBounds]);

  useEffect(() => {
    if (
      !hostAvailable ||
      !mountedRef.current ||
      state?.url === surface.entryUrl
    ) {
      return;
    }

    void navigateEmbeddedBrowserView({
      viewId,
      url: surface.entryUrl,
    })
      .then((nextState) => {
        setState(nextState);
        setErrorText(null);
      })
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : String(error));
      });
  }, [hostAvailable, state?.url, surface.entryUrl, viewId]);

  useEffect(() => {
    if (!hostAvailable) {
      return;
    }

    let disposed = false;
    let unlistenState: (() => void) | undefined;
    let unlistenLoadFailed: (() => void) | undefined;
    void listenEmbeddedBrowserViewState((nextState) => {
      if (nextState.viewId !== viewId) {
        return;
      }
      setState(nextState);
      if (nextState.isLoading) {
        setErrorText(null);
      }
    })
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
      setErrorText(event.errorDescription);
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
  }, [hostAvailable, viewId]);

  useEffect(() => {
    if (!hostAvailable || !active) {
      return;
    }
    const element = viewportRef.current;
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
  }, [active, hostAvailable, syncBounds]);

  return (
    <section
      aria-hidden={!active}
      className={`absolute inset-0 flex h-full min-h-0 flex-col bg-[color:var(--lime-surface)] ${
        active ? "" : "hidden"
      }`}
      data-testid="workspace-plugin-surface-frame"
      data-view-id={viewId}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:var(--lime-surface-border)] px-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] text-[color:var(--lime-text-muted)]">
          <MonitorUp className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
            {surface.title}
          </div>
          <div className="truncate text-xs text-[color:var(--lime-text-muted)]">
            {state?.isLoading
              ? dynamicT("agentChat.pluginSurface.loading")
              : dynamicT("agentChat.pluginSurface.ready")}
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 bg-white">
        <div
          ref={viewportRef}
          className="absolute inset-0 bg-white"
          data-testid="workspace-plugin-surface-viewport"
        />
        {!hostAvailable ? (
          <SurfaceOverlay
            tone="warning"
            title={dynamicT("agentChat.pluginSurface.hostUnavailableTitle")}
            body={dynamicT("agentChat.pluginSurface.hostUnavailableBody")}
          />
        ) : !state && !errorText ? (
          <SurfaceOverlay
            title={dynamicT("agentChat.pluginSurface.loadingTitle")}
            body={dynamicT("agentChat.pluginSurface.loadingBody")}
          />
        ) : null}
        {errorText ? (
          <SurfaceOverlay
            tone="error"
            title={dynamicT("agentChat.pluginSurface.loadFailedTitle")}
            body={errorText}
          />
        ) : null}
      </div>
    </section>
  );
}

function normalizeWorkspacePluginSurfaces(
  surfaces: readonly WorkspacePluginSurfaceDescriptor[],
): WorkspacePluginSurfaceDescriptor[] {
  const next: WorkspacePluginSurfaceDescriptor[] = [];
  for (const surface of surfaces) {
    if (
      surface.containerId.trim().length === 0 ||
      next.some((item) => item.containerId === surface.containerId)
    ) {
      continue;
    }
    next.push(surface);
  }
  return next;
}

const HIDDEN_EMBEDDED_BROWSER_BOUNDS: EmbeddedBrowserBounds = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

function SurfaceOverlay({
  body,
  title,
  tone = "default",
}: {
  body: string;
  title: string;
  tone?: "default" | "warning" | "error";
}): ReactElement {
  const colorClass =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text)]";
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div
        className={`max-w-[360px] rounded-[8px] border px-4 py-3 text-center shadow-sm shadow-slate-950/5 ${colorClass}`}
      >
        <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-[8px] border border-current/20 bg-white/60">
          <AlertTriangle className="size-4" />
        </div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-5 opacity-80">{body}</div>
      </div>
    </div>
  );
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

function sanitizeViewId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
}
