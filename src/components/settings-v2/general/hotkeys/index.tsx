/**
 * 快捷键设置页面
 *
 * 展示已经审计、已接入实现并具备测试覆盖的快捷键。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
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
  getExperimentalConfig,
  type ExperimentalFeatures,
} from "@/lib/api/experimentalFeatures";
import {
  getVoiceInputConfig,
  type VoiceInputConfig,
} from "@/lib/api/asrProvider";
import {
  getHotkeyRuntimeStatus,
  type HotkeyRuntimeStatus,
} from "@/lib/api/hotkeys";
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

type RuntimeAvailability = "ready" | "fallback";

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

function LoadingSkeleton() {
  return (
    <div className="space-y-5 pb-8">
      <div className="h-[180px] animate-pulse rounded-[28px] border border-slate-200/80 bg-slate-50" />
      <div className="h-[260px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
      <div className="h-[260px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
    </div>
  );
}

export function HotkeysSettings() {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experimentalConfig, setExperimentalConfig] =
    useState<ExperimentalFeatures | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceInputConfig | null>(null);
  const [runtimeStatus, setRuntimeStatus] =
    useState<HotkeyRuntimeStatus | null>(null);
  const [runtimeAvailability, setRuntimeAvailability] =
    useState<RuntimeAvailability>("ready");
  const unknownLoadErrorMessage = t(
    "settings.hotkeys.error.loadUnknown",
    "加载失败",
  );

  const loadHotkeys = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [experimentalResult, voiceResult, runtimeResult] =
        await Promise.all([
          getExperimentalConfig(),
          getVoiceInputConfig(),
          getHotkeyRuntimeStatus()
            .then((result) => ({ ok: true as const, result }))
            .catch(() => ({ ok: false as const, result: null })),
        ]);

      setExperimentalConfig(experimentalResult);
      setVoiceConfig(voiceResult);
      setRuntimeStatus(runtimeResult.result);
      setRuntimeAvailability(runtimeResult.ok ? "ready" : "fallback");
    } catch (loadError) {
      console.error("加载快捷键信息失败:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : unknownLoadErrorMessage,
      );
    } finally {
      setLoading(false);
    }
  }, [unknownLoadErrorMessage]);

  useEffect(() => {
    void loadHotkeys();
  }, [loadHotkeys]);

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
        return t("settings.hotkeys.platform.current", "当前平台");
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
          defaultValue: "{{label}}说明",
        }),
      sectionTipAria: (title: string) =>
        t("settings.hotkeys.section.tipAria", {
          title,
          defaultValue: "{{title}}说明",
        }),
      scopeGlobal: t("settings.hotkeys.scope.global", "全局"),
      scopeLocal: t("settings.hotkeys.scope.local", "页面内"),
      sourceMeta: (source: string) =>
        t("settings.hotkeys.meta.source", {
          source,
          defaultValue: "来源：{{source}}",
        }),
      conditionMeta: (condition: string) =>
        t("settings.hotkeys.meta.condition", {
          condition,
          defaultValue: "条件：{{condition}}",
        }),
      unsetKey: t("settings.hotkeys.key.unset", "未设置"),
      sectionTotal: (count: number) =>
        t("settings.hotkeys.section.total", {
          count,
          defaultValue: "共 {{count}} 项",
        }),
      sectionReady: (count: number) =>
        t("settings.hotkeys.section.ready", {
          count,
          defaultValue: "可用 {{count}} 项",
        }),
    }),
    [t],
  );

  const catalog = useMemo(() => {
    if (!experimentalConfig || !voiceConfig) {
      return null;
    }

    return buildAuditedHotkeyCatalog({
      platform,
      experimentalConfig,
      voiceConfig,
      runtimeStatus,
      copy: catalogCopy,
    });
  }, [catalogCopy, experimentalConfig, platform, runtimeStatus, voiceConfig]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!catalog) {
    return (
      <div className="space-y-3">
        {error ? (
          <div className="flex items-center justify-between gap-4 rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-slate-950/5">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>
                {t("settings.hotkeys.error.load", {
                  error,
                  defaultValue: "加载快捷键失败：{{error}}",
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadHotkeys()}
              className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
            >
              {t("settings.hotkeys.action.retry", "重试")}
            </button>
          </div>
        ) : null}

        <div className="rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          {t(
            "settings.hotkeys.error.unavailable",
            "快捷键信息暂时不可用，请稍后重试。",
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-slate-950/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              {t("settings.hotkeys.error.load", {
                error,
                defaultValue: "加载快捷键失败：{{error}}",
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadHotkeys()}
            className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
          >
            {t("settings.hotkeys.action.retry", "重试")}
          </button>
        </div>
      ) : null}

      <section className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.hotkeys.title", "快捷键")}
                </h1>
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.hotkeys.hero.tipAria",
                    "已审计快捷键说明",
                  )}
                  content={t("settings.hotkeys.hero.tip", {
                    platform: platformLabel,
                    defaultValue:
                      "当前按 {{platform}} 展示已接入实现的快捷键。全局项读取运行时注册状态，页面内项直接来自对应模块的真实事件匹配逻辑，不再展示手工拼装的占位清单。",
                  })}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t(
                  "settings.hotkeys.description",
                  "查看已接入实现并完成审计的快捷键。",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <SummaryChip>{platformLabel}</SummaryChip>
              <SummaryChip tone="success">
                {t("settings.hotkeys.summary.globalReady", {
                  ready: catalog.summary.globalReady,
                  total: 3,
                  defaultValue: "全局运行中 {{ready}} / {{total}}",
                })}
              </SummaryChip>
              <SummaryChip
                tone={runtimeAvailability === "ready" ? "success" : "warning"}
              >
                {runtimeAvailability === "ready"
                  ? t(
                      "settings.hotkeys.summary.runtime.ready",
                      "运行时状态已连接",
                    )
                  : t(
                      "settings.hotkeys.summary.runtime.fallback",
                      "运行时状态不可读，已回退到配置判断",
                    )}
              </SummaryChip>
              <SummaryChip>
                {t("settings.hotkeys.summary.audited", {
                  count: catalog.summary.total,
                  defaultValue: "已审计 {{count}} 项",
                })}
              </SummaryChip>
              <SummaryChip tone="success">
                {t("settings.hotkeys.summary.ready", {
                  count: catalog.summary.ready,
                  defaultValue: "可直接使用 {{count}} 项",
                })}
              </SummaryChip>
              <SummaryChip
                tone={catalog.summary.attention > 0 ? "warning" : "neutral"}
              >
                {t("settings.hotkeys.summary.attention", {
                  count: catalog.summary.attention,
                  defaultValue: "需要处理 {{count}} 项",
                })}
              </SummaryChip>
              <WorkbenchInfoTip
                ariaLabel={t("settings.hotkeys.audit.tipAria", "已审计说明")}
                content={t(
                  "settings.hotkeys.audit.tip",
                  "当前页只列出已接入实现且已核对的快捷键。",
                )}
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
