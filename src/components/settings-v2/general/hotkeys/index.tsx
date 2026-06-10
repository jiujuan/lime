/**
 * 快捷键设置页面
 *
 * 展示已经审计、已接入实现并具备测试覆盖的快捷键。
 */

import { useCallback, useMemo, type ReactNode } from "react";
import {
  FileText,
  Keyboard,
  PanelsTopLeft,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { cn } from "@/lib/utils";
import {
  resolveHotkeyPlatform,
  UNSET_SHORTCUT_TOKEN,
} from "@/lib/hotkeys/platform";
import {
  buildAuditedHotkeyCatalog,
  createHotkeyCatalogCopy,
  type AuditedHotkeyItem,
  type AuditedHotkeySection,
  type HotkeyCatalogTranslate,
} from "./hotkeyCatalog";

interface HotkeysPageCopy {
  itemTipAria: (label: string) => string;
  sectionTipAria: (title: string) => string;
  scopeGlobal: string;
  scopeLocal: string;
  sourceMeta: (source: string) => string;
  conditionMeta: (condition: string) => string;
  unsetKey: string;
  sectionTotal: (count: number) => string;
  sectionReady: (count: number) => string;
}

function SummaryChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}

function HotkeyStatusBadge({ item }: { item: AuditedHotkeyItem }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
        item.status === "ready" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        item.status === "inactive" &&
          "border-slate-200 bg-slate-100 text-slate-500",
        item.status === "needs-config" &&
          "border-amber-200 bg-amber-50 text-amber-700",
        item.status === "runtime-error" &&
          "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      {item.statusLabel}
    </span>
  );
}

function HotkeyRow({
  item,
  copy,
}: {
  item: AuditedHotkeyItem;
  copy: HotkeysPageCopy;
}) {
  return (
    <article className="rounded-[20px] border border-slate-200/80 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            <WorkbenchInfoTip
              ariaLabel={copy.itemTipAria(item.label)}
              content={
                <div className="space-y-1">
                  <p>{item.description}</p>
                  <p>{item.statusDescription}</p>
                </div>
              }
              tone="slate"
            />
            <HotkeyStatusBadge item={item} />
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
              {item.scope === "global" ? copy.scopeGlobal : copy.scopeLocal}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{copy.sourceMeta(item.source)}</span>
            <span>{copy.conditionMeta(item.condition)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:max-w-[320px] sm:justify-end">
          {item.keys.map((key) => (
            <span
              key={`${item.id}-${key}`}
              className={cn(
                "inline-flex min-h-9 min-w-9 items-center justify-center rounded-[14px] border px-3 text-sm font-medium shadow-sm",
                key === UNSET_SHORTCUT_TOKEN
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              {key === UNSET_SHORTCUT_TOKEN ? copy.unsetKey : key}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

const SECTION_ICON_MAP: Record<AuditedHotkeySection["scene"], LucideIcon> = {
  global: Sparkles,
  workspace: PanelsTopLeft,
  "document-editor": FileText,
  "document-canvas": ScrollText,
};

function HotkeySectionCard({
  section,
  copy,
}: {
  section: AuditedHotkeySection;
  copy: HotkeysPageCopy;
}) {
  const Icon = SECTION_ICON_MAP[section.scene] || Keyboard;
  const readyCount = section.hotkeys.filter((item) => item.available).length;

  return (
    <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Icon className="h-4 w-4 text-sky-600" />
            {section.title}
            <WorkbenchInfoTip
              ariaLabel={copy.sectionTipAria(section.title)}
              content={section.description}
              tone="slate"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip>{copy.sectionTotal(section.hotkeys.length)}</SummaryChip>
          <SummaryChip tone="success">
            {copy.sectionReady(readyCount)}
          </SummaryChip>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {section.hotkeys.map((item) => (
          <HotkeyRow key={item.id} item={item} copy={copy} />
        ))}
      </div>
    </section>
  );
}

export function HotkeysSettings() {
  const { t } = useTranslation("settings");
  const platform = useMemo(
    () =>
      resolveHotkeyPlatform(
        typeof navigator === "undefined" ? undefined : navigator,
      ),
    [],
  );

  const platformLabel = useMemo(() => {
    switch (platform) {
      case "mac":
        return "macOS";
      case "windows":
        return "Windows";
      default:
        return t("settings.hotkeys.platform.current");
    }
  }, [platform, t]);

  const translateCatalog = useCallback<HotkeyCatalogTranslate>(
    (key, options) => t(key as never, options as never) as unknown as string,
    [t],
  );

  const catalogCopy = useMemo(
    () => createHotkeyCatalogCopy(translateCatalog),
    [translateCatalog],
  );

  const pageCopy = useMemo<HotkeysPageCopy>(
    () => ({
      itemTipAria: (label: string) =>
        t("settings.hotkeys.item.tipAria", {
          label,
        }),
      sectionTipAria: (title: string) =>
        t("settings.hotkeys.section.tipAria", {
          title,
        }),
      scopeGlobal: t("settings.hotkeys.scope.global"),
      scopeLocal: t("settings.hotkeys.scope.local"),
      sourceMeta: (source: string) =>
        t("settings.hotkeys.meta.source", {
          source,
        }),
      conditionMeta: (condition: string) =>
        t("settings.hotkeys.meta.condition", {
          condition,
        }),
      unsetKey: t("settings.hotkeys.key.unset"),
      sectionTotal: (count: number) =>
        t("settings.hotkeys.section.total", {
          count,
        }),
      sectionReady: (count: number) =>
        t("settings.hotkeys.section.ready", {
          count,
        }),
    }),
    [t],
  );

  const catalog = useMemo(() => {
    return buildAuditedHotkeyCatalog({
      platform,
      copy: catalogCopy,
    });
  }, [catalogCopy, platform]);

  return (
    <div className="space-y-4 pb-8">
      <section className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.hotkeys.title")}
                </h1>
                <WorkbenchInfoTip
                  ariaLabel={t("settings.hotkeys.hero.tipAria")}
                  content={t("settings.hotkeys.hero.tip", {
                    platform: platformLabel,
                  })}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t("settings.hotkeys.description")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <SummaryChip>{platformLabel}</SummaryChip>
              <SummaryChip>
                {t("settings.hotkeys.summary.audited", {
                  count: catalog.summary.total,
                })}
              </SummaryChip>
              <SummaryChip tone="success">
                {t("settings.hotkeys.summary.ready", {
                  count: catalog.summary.ready,
                })}
              </SummaryChip>
              <SummaryChip
                tone={catalog.summary.attention > 0 ? "warning" : "neutral"}
              >
                {t("settings.hotkeys.summary.attention", {
                  count: catalog.summary.attention,
                })}
              </SummaryChip>
              <WorkbenchInfoTip
                ariaLabel={t("settings.hotkeys.audit.tipAria")}
                content={t("settings.hotkeys.audit.tip")}
                tone="slate"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {catalog.sections.map((section) => (
          <HotkeySectionCard
            key={section.scene}
            section={section}
            copy={pageCopy}
          />
        ))}
      </div>
    </div>
  );
}
