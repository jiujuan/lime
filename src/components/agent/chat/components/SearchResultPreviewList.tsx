import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Search,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";
import {
  formatSearchResultSourceLabel,
  type SearchResultPreviewItem,
} from "../utils/searchResultPreview";

function SearchResultHoverCard({
  item,
  onOpenItem,
  popoverSide = "right",
  popoverAlign = "start",
}: {
  item: SearchResultPreviewItem;
  onOpenItem: (item: SearchResultPreviewItem) => void | Promise<void>;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
}) {
  const { t } = useTranslation("agent");
  const sourceLabel = useMemo(
    () => formatSearchResultSourceLabel(item),
    [item],
  );
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleOpenPreview = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleCloseNow = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  const handleScheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      return;
    }
    if (typeof window === "undefined") {
      handleCloseNow();
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [handleCloseNow]);

  const isWithinHoverRegion = useCallback((target: EventTarget | null) => {
    const node = target instanceof Node ? target : null;
    if (!node) {
      return false;
    }
    return Boolean(
      triggerRef.current?.contains(node) || contentRef.current?.contains(node),
    );
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const handleDocumentMouseMove = (event: MouseEvent) => {
      if (isWithinHoverRegion(event.target)) {
        clearCloseTimer();
        return;
      }
      handleScheduleClose();
    };

    const handleWindowBlur = () => {
      handleCloseNow();
    };

    document.addEventListener("mousemove", handleDocumentMouseMove, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    clearCloseTimer,
    handleCloseNow,
    handleScheduleClose,
    isWithinHoverRegion,
    open,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("agentChat.searchResultPreview.previewAria", {
            title: item.title,
          })}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50"
          onMouseEnter={handleOpenPreview}
          onMouseLeave={handleScheduleClose}
          onFocus={handleOpenPreview}
          onBlur={handleScheduleClose}
          onClick={() => void onOpenItem(item)}
        >
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-normal text-slate-700">
                {item.title}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{sourceLabel}</span>
              </div>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side={popoverSide}
        align={popoverAlign}
        sideOffset={8}
        collisionPadding={20}
        className="w-[min(24rem,calc(100vw-3rem))] rounded-2xl border border-border/80 bg-background p-0 shadow-xl"
        onMouseEnter={handleOpenPreview}
        onMouseLeave={handleScheduleClose}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2 text-muted-foreground">
              <Search className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {item.title}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{sourceLabel}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-3 text-sm leading-6 text-muted-foreground">
            {item.snippet || t("agentChat.searchResultPreview.emptySnippet")}
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left text-xs text-primary transition-colors hover:bg-muted/60"
            onClick={() => void onOpenItem(item)}
          >
            <span className="truncate">{item.url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SearchResultPreviewList({
  items,
  onOpenUrl,
  onOpenItem,
  popoverSide = "right",
  popoverAlign = "start",
  className,
  collapsedCount = 4,
  variant = "card",
}: {
  items: SearchResultPreviewItem[];
  onOpenUrl?: (url: string) => void | Promise<void>;
  onOpenItem?: (item: SearchResultPreviewItem) => void | Promise<void>;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  className?: string;
  collapsedCount?: number;
  variant?: "card" | "inline";
}) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const [expanded, setExpanded] = useState(false);
  const handleOpenItem = useCallback(
    (item: SearchResultPreviewItem) => {
      if (onOpenItem) {
        return onOpenItem(item);
      }
      return onOpenUrl?.(item.url);
    },
    [onOpenItem, onOpenUrl],
  );
  const identityKey = useMemo(
    () => items.map((item) => item.id).join("|"),
    [items],
  );

  useEffect(() => {
    setExpanded(false);
  }, [identityKey]);

  if (items.length === 0) {
    return null;
  }

  const shouldCollapse = items.length > collapsedCount;
  const visibleItems =
    shouldCollapse && !expanded ? items.slice(0, collapsedCount) : items;
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className={cn(variant === "inline" ? "space-y-1" : "space-y-2", className)}>
      {visibleItems.map((item) =>
        variant === "inline" ? (
          <button
            key={item.id}
            type="button"
            className="block w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-50"
            onClick={() => void handleOpenItem(item)}
            aria-label={t("agentChat.searchResultPreview.previewAria", {
              title: item.title,
            })}
          >
            <span className="flex min-w-0 items-start gap-2">
              <Globe className="mt-1 h-3 w-3 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs leading-5 text-slate-700">
                  {item.title}
                </span>
                <span className="block truncate text-[11px] leading-4 text-slate-400">
                  {formatSearchResultSourceLabel(item)}
                </span>
              </span>
            </span>
          </button>
        ) : (
          <SearchResultHoverCard
            key={item.id}
            item={item}
            onOpenItem={handleOpenItem}
            popoverSide={popoverSide}
            popoverAlign={popoverAlign}
          />
        ),
      )}
      {shouldCollapse ? (
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-center gap-2 text-xs transition-colors",
            variant === "inline"
              ? "rounded-md px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              : "rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={
            expanded
              ? t("agentChat.searchResultPreview.collapseAria")
              : t("agentChat.searchResultPreview.expandAria")
          }
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              expanded && "rotate-180",
            )}
          />
          <span>
            {expanded
              ? t("agentChat.searchResultPreview.collapse")
              : t("agentChat.searchResultPreview.expandMore", {
                  countLabel: formatNumber(hiddenCount, { locale }),
                })}
          </span>
        </button>
      ) : null}
    </div>
  );
}
