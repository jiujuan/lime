import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, RefreshCw, ScrollText, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { clearSiteAdapterCatalogCache } from "@/lib/siteAdapterCatalogBootstrap";
import {
  emitSiteAdapterCatalogBootstrap,
  extractSiteAdapterCatalogFromBootstrapPayload,
  subscribeSiteAdapterCatalogChanged,
} from "@/lib/siteAdapterCatalogBootstrap";
import {
  siteGetAdapterCatalogStatus,
  siteImportAdapterYamlBundle,
  siteListAdapters,
  type SiteAdapterCatalogStatus,
  type SiteAdapterDefinition,
} from "@/lib/webview-api";
import {
  DANGER_BUTTON_CLASS_NAME,
  DeveloperInlineMessage,
  type DeveloperPanelMessage,
  SECONDARY_BUTTON_CLASS_NAME,
} from "./shared";

type SiteAdapterExampleKey =
  | "settings.developer.siteAdapterCatalog.example.github.description"
  | "settings.developer.siteAdapterCatalog.example.github.queryDescription"
  | "settings.developer.siteAdapterCatalog.example.reddit.description"
  | "settings.developer.siteAdapterCatalog.example.reddit.limitDescription"
  | "settings.developer.siteAdapterCatalog.example.reddit.subredditDescription";

type BasicTranslate = (key: SiteAdapterExampleKey) => string;

function getDefaultSiteAdapterCatalogEditorValue(t: BasicTranslate) {
  return JSON.stringify(
    {
      siteAdapterCatalog: {
        catalogVersion: "tenant-site-2026-03-26",
        tenantId: "tenant-demo",
        syncedAt: "2026-03-26T12:00:00.000Z",
        adapters: [
          {
            name: "github/search",
            domain: "github.com",
            description: t(
              "settings.developer.siteAdapterCatalog.example.github.description",
            ),
            read_only: true,
            capabilities: ["search", "research"],
            args: [
              {
                name: "query",
                description: t(
                  "settings.developer.siteAdapterCatalog.example.github.queryDescription",
                ),
                required: true,
                arg_type: "string",
                example: "model context protocol",
              },
            ],
            example: 'github/search {"query":"model context protocol"}',
            entry: {
              kind: "fixed_url",
              url: "https://github.com/search",
            },
            script:
              "async ({ query }) => ({ items: [{ title: query, url: location.href }] })",
            sourceVersion: "tenant-site-2026-03-26",
          },
        ],
      },
    },
    null,
    2,
  );
}

function getDefaultSiteAdapterImportEditorValue(t: BasicTranslate) {
  return `site: reddit
name: hot
description: ${t(
    "settings.developer.siteAdapterCatalog.example.reddit.description",
  )}
domain: www.reddit.com
args:
  subreddit:
    type: str
    default: ""
    description: ${t(
      "settings.developer.siteAdapterCatalog.example.reddit.subredditDescription",
    )}
  limit:
    type: int
    default: 20
    description: ${t(
      "settings.developer.siteAdapterCatalog.example.reddit.limitDescription",
    )}
pipeline:
  - navigate: https://www.reddit.com
  - evaluate: |
      (async () => {
        const sub = \${{ args.subreddit | json }};
        const path = sub ? '/r/' + sub + '/hot.json' : '/hot.json';
        const limit = \${{ args.limit }};
        const response = await fetch(path + '?limit=' + limit, { credentials: 'include' });
        const data = await response.json();
        return (data?.data?.children || []).map((item) => ({
          title: item.data.title,
          subreddit: item.data.subreddit_name_prefixed,
          score: item.data.score,
        }));
      })()
  - map:
      rank: \${{ index + 1 }}
      title: \${{ item.title }}
      subreddit: \${{ item.subreddit }}
      score: \${{ item.score }}
  - limit: \${{ args.limit }}
columns: [rank, title, subreddit, score]
`;
}

function toErrorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRetiredSiteAdapterError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "is retired until Site Adapter moves to App Server current methods",
    )
  );
}

export function SiteAdapterCatalogTools() {
  const { t } = useTranslation("settings");
  const translateText = useCallback(
    (key: SiteAdapterExampleKey) => String(t(key)),
    [t],
  ) satisfies BasicTranslate;
  const [busy, setBusy] = useState(false);
  const [siteCatalogEditorValue, setSiteCatalogEditorValue] = useState("");
  const [siteImportEditorValue, setSiteImportEditorValue] = useState("");
  const [siteCatalogStatus, setSiteCatalogStatus] =
    useState<SiteAdapterCatalogStatus | null>(null);
  const [siteAdapters, setSiteAdapters] = useState<SiteAdapterDefinition[]>([]);
  const [message, setMessage] = useState<DeveloperPanelMessage | null>(null);

  const showMessage = useCallback((next: DeveloperPanelMessage) => {
    setMessage(next);
    setTimeout(() => setMessage(null), 2500);
  }, []);

  const loadSiteAdapterCatalog = useCallback(async () => {
    const [status, adapters] = await Promise.all([
      siteGetAdapterCatalogStatus(),
      siteListAdapters(),
    ]);
    setSiteCatalogStatus(status);
    setSiteAdapters(adapters);
    return { status, adapters };
  }, []);

  useEffect(() => {
    void loadSiteAdapterCatalog().catch((error) => {
      if (isRetiredSiteAdapterError(error)) {
        return;
      }
      console.error("加载站点脚本目录失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.siteAdapterCatalog.message.loadFailed"),
        ),
      });
    });
  }, [loadSiteAdapterCatalog, showMessage, t]);

  useEffect(() => {
    return subscribeSiteAdapterCatalogChanged(() => {
      void loadSiteAdapterCatalog().catch((error) => {
        if (isRetiredSiteAdapterError(error)) {
          return;
        }
        console.error("刷新站点脚本目录失败:", error);
        showMessage({
          type: "error",
          text: toErrorText(
            error,
            t("settings.developer.siteAdapterCatalog.message.refreshFailed"),
          ),
        });
      });
    });
  }, [loadSiteAdapterCatalog, showMessage, t]);

  const handleHydrateSiteCatalogEditorWithTemplate = useCallback(() => {
    setSiteCatalogEditorValue(
      getDefaultSiteAdapterCatalogEditorValue(translateText),
    );
    showMessage({
      type: "success",
      text: t(
        "settings.developer.siteAdapterCatalog.message.catalogTemplateHydrated",
      ),
    });
  }, [showMessage, t, translateText]);

  const handleHydrateSiteImportEditorWithTemplate = useCallback(() => {
    setSiteImportEditorValue(
      getDefaultSiteAdapterImportEditorValue(translateText),
    );
    showMessage({
      type: "success",
      text: t(
        "settings.developer.siteAdapterCatalog.message.importTemplateHydrated",
      ),
    });
  }, [showMessage, t, translateText]);

  const handleRefreshSiteCatalog = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { adapters } = await loadSiteAdapterCatalog();
      showMessage({
        type: "success",
        text: t("settings.developer.siteAdapterCatalog.message.refreshed", {
          count: adapters.length,
        }),
      });
    } catch (error) {
      if (!isRetiredSiteAdapterError(error)) {
        console.error("刷新站点脚本目录状态失败:", error);
      }
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t(
            "settings.developer.siteAdapterCatalog.message.refreshStatusFailed",
          ),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [loadSiteAdapterCatalog, showMessage, t]);

  const handleApplySiteCatalogPayload = useCallback(async () => {
    const raw = siteCatalogEditorValue.trim();
    if (!raw) {
      showMessage({
        type: "error",
        text: t(
          "settings.developer.siteAdapterCatalog.message.emptyCatalogPayload",
        ),
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(raw) as unknown;
      const previewCatalog =
        extractSiteAdapterCatalogFromBootstrapPayload(parsed);
      if (!previewCatalog) {
        throw new Error(
          t(
            "settings.developer.siteAdapterCatalog.message.invalidCatalogPayload",
          ),
        );
      }

      const adapterCount = Array.isArray(
        (previewCatalog as { adapters?: unknown }).adapters,
      )
        ? ((previewCatalog as { adapters: unknown[] }).adapters?.length ?? 0)
        : 0;
      emitSiteAdapterCatalogBootstrap(parsed);
      showMessage({
        type: "success",
        text: t("settings.developer.siteAdapterCatalog.message.injected", {
          count: adapterCount,
        }),
      });
    } catch (error) {
      console.error("注入站点脚本目录失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.siteAdapterCatalog.message.injectFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [showMessage, siteCatalogEditorValue, t]);

  const handleClearSiteCatalog = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await clearSiteAdapterCatalogCache();
      const { adapters } = await loadSiteAdapterCatalog();
      showMessage({
        type: "success",
        text: t("settings.developer.siteAdapterCatalog.message.cleared", {
          count: adapters.length,
        }),
      });
    } catch (error) {
      if (!isRetiredSiteAdapterError(error)) {
        console.error("清空站点脚本目录缓存失败:", error);
      }
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.siteAdapterCatalog.message.clearFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [loadSiteAdapterCatalog, showMessage, t]);

  const handleImportSiteAdapterYamlBundle = useCallback(async () => {
    const raw = siteImportEditorValue.trim();
    if (!raw) {
      showMessage({
        type: "error",
        text: t(
          "settings.developer.siteAdapterCatalog.message.emptyImportPayload",
        ),
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await siteImportAdapterYamlBundle({
        yaml_bundle: raw,
      });
      const { adapters } = await loadSiteAdapterCatalog();
      showMessage({
        type: "success",
        text: t("settings.developer.siteAdapterCatalog.message.imported", {
          importedCount: result.adapter_count,
          effectiveCount: adapters.length,
        }),
      });
    } catch (error) {
      if (!isRetiredSiteAdapterError(error)) {
        console.error("导入外部站点适配器来源失败:", error);
      }
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.siteAdapterCatalog.message.importFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [loadSiteAdapterCatalog, showMessage, siteImportEditorValue, t]);

  const siteCatalogSourceLabel = useMemo(() => {
    if (!siteCatalogStatus) {
      return t("settings.developer.siteAdapterCatalog.source.loading");
    }

    if (siteCatalogStatus.source_kind === "server_synced") {
      return t("settings.developer.siteAdapterCatalog.source.serverSynced");
    }

    if (siteCatalogStatus.source_kind === "imported") {
      return t("settings.developer.siteAdapterCatalog.source.imported");
    }

    return t("settings.developer.siteAdapterCatalog.source.bundled");
  }, [siteCatalogStatus, t]);

  return (
    <div className="space-y-4">
      {message ? <DeveloperInlineMessage message={message} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.siteAdapterCatalog.stat.source")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {siteCatalogSourceLabel}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.siteAdapterCatalog.stat.effective")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {siteAdapters.length}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.siteAdapterCatalog.stat.catalog")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {siteCatalogStatus?.exists ? siteCatalogStatus.adapter_count : 0}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.siteAdapterCatalog.stat.syncedAt")}
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {siteCatalogStatus?.synced_at ??
              t("settings.developer.siteAdapterCatalog.status.unsynced")}
          </p>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {t("settings.developer.siteAdapterCatalog.summary.title")}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t("settings.developer.siteAdapterCatalog.summary.description")}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            {busy
              ? t("settings.developer.siteAdapterCatalog.status.busy")
              : t("settings.developer.siteAdapterCatalog.status.idle")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {siteAdapters.slice(0, 4).map((adapter) => (
            <span
              key={adapter.name}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              {adapter.name}
            </span>
          ))}
          {siteAdapters.length > 4 ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
              {t("settings.developer.siteAdapterCatalog.summary.moreItems", {
                count: siteAdapters.length - 4,
              })}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
          <div>
            {t("settings.developer.siteAdapterCatalog.summary.catalogVersion", {
              version:
                siteCatalogStatus?.catalog_version ??
                t("settings.developer.siteAdapterCatalog.source.bundled"),
            })}
          </div>
          <div>
            {t("settings.developer.siteAdapterCatalog.summary.tenant", {
              tenant:
                siteCatalogStatus?.tenant_id ??
                t(
                  "settings.developer.siteAdapterCatalog.summary.unboundTenant",
                ),
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.siteAdapterCatalog.import.title")}
          </p>
          <p className="text-sm leading-6 text-slate-500">
            {t(
              "settings.developer.siteAdapterCatalog.import.descriptionPrefix",
            )}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {t(
                "settings.developer.siteAdapterCatalog.import.code.imported",
              )}
            </code>
            {t(
              "settings.developer.siteAdapterCatalog.import.descriptionMiddle",
            )}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {t(
                "settings.developer.siteAdapterCatalog.import.code.supportedSubset",
              )}
            </code>
            {t(
              "settings.developer.siteAdapterCatalog.import.descriptionSuffix",
            )}
          </p>
        </div>

        <Textarea
          aria-label={t("settings.developer.siteAdapterCatalog.import.aria")}
          value={siteImportEditorValue}
          onChange={(event) => setSiteImportEditorValue(event.target.value)}
          placeholder={getDefaultSiteAdapterImportEditorValue(translateText)}
          className="min-h-[260px] rounded-[18px] border-slate-200/80 bg-slate-50/60 font-mono text-xs leading-6 text-slate-700"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleHydrateSiteImportEditorWithTemplate}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <ScrollText className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.fillYamlExample")}
          </button>
          <button
            type="button"
            onClick={() => void handleImportSiteAdapterYamlBundle()}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <Sparkles className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.importToLime")}
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.siteAdapterCatalog.bootstrap.title")}
          </p>
          <p className="text-sm leading-6 text-slate-500">
            {t(
              "settings.developer.siteAdapterCatalog.bootstrap.descriptionPrefix",
            )}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {t(
                "settings.developer.siteAdapterCatalog.bootstrap.code.wrapper",
              )}
            </code>
            {t(
              "settings.developer.siteAdapterCatalog.bootstrap.descriptionSuffix",
            )}
          </p>
        </div>

        <Textarea
          aria-label={t("settings.developer.siteAdapterCatalog.bootstrap.aria")}
          value={siteCatalogEditorValue}
          onChange={(event) => setSiteCatalogEditorValue(event.target.value)}
          placeholder={getDefaultSiteAdapterCatalogEditorValue(translateText)}
          className="min-h-[240px] rounded-[18px] border-slate-200/80 bg-slate-50/60 font-mono text-xs leading-6 text-slate-700"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleHydrateSiteCatalogEditorWithTemplate}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <ScrollText className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.fillSiteExample")}
          </button>
          <button
            type="button"
            onClick={() => void handleRefreshSiteCatalog()}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <RefreshCw className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.refreshStatus")}
          </button>
          <button
            type="button"
            onClick={() => void handleApplySiteCatalogPayload()}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <Globe className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.inject")}
          </button>
          <button
            type="button"
            onClick={() => void handleClearSiteCatalog()}
            disabled={busy}
            className={DANGER_BUTTON_CLASS_NAME}
          >
            <Trash2 className="h-4 w-4" />
            {t("settings.developer.siteAdapterCatalog.action.clearCache")}
          </button>
        </div>
      </div>
    </div>
  );
}
