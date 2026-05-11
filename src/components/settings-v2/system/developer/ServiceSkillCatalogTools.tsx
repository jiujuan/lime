import { useCallback, useEffect, useState } from "react";
import { DatabaseZap, ScrollText, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import {
  clearServiceSkillCatalogCache,
  getServiceSkillCatalog,
  subscribeServiceSkillCatalogChanged,
  type ServiceSkillCatalog,
} from "@/lib/api/serviceSkills";
import {
  emitServiceSkillCatalogBootstrap,
  extractServiceSkillCatalogFromBootstrapPayload,
} from "@/lib/serviceSkillCatalogBootstrap";
import {
  DANGER_BUTTON_CLASS_NAME,
  DeveloperInlineMessage,
  type DeveloperPanelMessage,
  SECONDARY_BUTTON_CLASS_NAME,
} from "./shared";

function toErrorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ServiceSkillCatalogTools() {
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState(false);
  const [catalogEditorValue, setCatalogEditorValue] = useState("");
  const [serviceCatalog, setServiceCatalog] =
    useState<ServiceSkillCatalog | null>(null);
  const [message, setMessage] = useState<DeveloperPanelMessage | null>(null);

  const showMessage = useCallback((next: DeveloperPanelMessage) => {
    setMessage(next);
    setTimeout(() => setMessage(null), 2500);
  }, []);

  const loadServiceSkillCatalog = useCallback(async () => {
    const catalog = await getServiceSkillCatalog();
    setServiceCatalog(catalog);
    return catalog;
  }, []);

  useEffect(() => {
    void loadServiceSkillCatalog().catch((error) => {
      console.error("加载服务型技能目录失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.serviceSkillCatalog.message.loadFailed"),
        ),
      });
    });
  }, [loadServiceSkillCatalog, showMessage, t]);

  useEffect(() => {
    return subscribeServiceSkillCatalogChanged(() => {
      void loadServiceSkillCatalog().catch((error) => {
        console.error("刷新服务型技能目录失败:", error);
        showMessage({
          type: "error",
          text: toErrorText(
            error,
            t("settings.developer.serviceSkillCatalog.message.refreshFailed"),
          ),
        });
      });
    });
  }, [loadServiceSkillCatalog, showMessage, t]);

  const handleHydrateCatalogEditor = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const catalog = await loadServiceSkillCatalog();
      setCatalogEditorValue(
        JSON.stringify(
          {
            serviceSkillCatalog: catalog,
          },
          null,
          2,
        ),
      );
      showMessage({
        type: "success",
        text: t("settings.developer.serviceSkillCatalog.message.hydrated"),
      });
    } catch (error) {
      console.error("读取服务型技能目录失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.serviceSkillCatalog.message.readFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [loadServiceSkillCatalog, showMessage, t]);

  const handleApplyCatalogPayload = useCallback(async () => {
    const raw = catalogEditorValue.trim();
    if (!raw) {
      showMessage({
        type: "error",
        text: t("settings.developer.serviceSkillCatalog.message.emptyPayload"),
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(raw) as unknown;
      const previewCatalog =
        extractServiceSkillCatalogFromBootstrapPayload(parsed);
      if (!previewCatalog) {
        throw new Error(
          t("settings.developer.serviceSkillCatalog.message.invalidPayload"),
        );
      }

      emitServiceSkillCatalogBootstrap(parsed);
      showMessage({
        type: "success",
        text: t("settings.developer.serviceSkillCatalog.message.injected", {
          count: previewCatalog.items.length,
        }),
      });
    } catch (error) {
      console.error("注入服务型技能目录失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.serviceSkillCatalog.message.injectFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [catalogEditorValue, showMessage, t]);

  const handleClearServiceSkillCatalog = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      clearServiceSkillCatalogCache();
      const catalog = await loadServiceSkillCatalog();
      showMessage({
        type: "success",
        text: t("settings.developer.serviceSkillCatalog.message.cleared", {
          count: catalog.items.length,
        }),
      });
    } catch (error) {
      console.error("清空服务型技能目录缓存失败:", error);
      showMessage({
        type: "error",
        text: toErrorText(
          error,
          t("settings.developer.serviceSkillCatalog.message.clearFailed"),
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [loadServiceSkillCatalog, showMessage, t]);

  return (
    <div className="space-y-4">
      {message ? <DeveloperInlineMessage message={message} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.serviceSkillCatalog.stat.tenant")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {serviceCatalog?.tenantId ??
              t("settings.developer.serviceSkillCatalog.status.loading")}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.serviceSkillCatalog.stat.version")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {serviceCatalog?.version ??
              t("settings.developer.serviceSkillCatalog.status.loading")}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.serviceSkillCatalog.stat.items")}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {serviceCatalog?.items.length ?? 0}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
            {t("settings.developer.serviceSkillCatalog.stat.syncedAt")}
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {serviceCatalog?.syncedAt ??
              t("settings.developer.serviceSkillCatalog.status.loading")}
          </p>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {t("settings.developer.serviceSkillCatalog.summary.title")}
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {t("settings.developer.serviceSkillCatalog.summary.description")}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            {busy
              ? t("settings.developer.serviceSkillCatalog.status.busy")
              : t("settings.developer.serviceSkillCatalog.status.idle")}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(serviceCatalog?.items ?? []).slice(0, 4).map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              {item.title}
            </span>
          ))}
          {(serviceCatalog?.items.length ?? 0) > 4 ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
              {t("settings.developer.serviceSkillCatalog.summary.moreItems", {
                count: (serviceCatalog?.items.length ?? 0) - 4,
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.serviceSkillCatalog.editor.title")}
          </p>
          <p className="text-sm leading-6 text-slate-500">
            {t(
              "settings.developer.serviceSkillCatalog.editor.descriptionPrefix",
            )}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {"{ serviceSkillCatalog: ... }"}
            </code>
            {t(
              "settings.developer.serviceSkillCatalog.editor.descriptionSuffix",
            )}
          </p>
        </div>

        <Textarea
          aria-label={t("settings.developer.serviceSkillCatalog.editor.aria")}
          value={catalogEditorValue}
          onChange={(event) => setCatalogEditorValue(event.target.value)}
          placeholder='{\n  "serviceSkillCatalog": {\n    "version": "tenant-2026-03-24",\n    "tenantId": "tenant-demo",\n    "syncedAt": "2026-03-24T12:00:00.000Z",\n    "items": []\n  }\n}'
          className="min-h-[240px] rounded-[18px] border-slate-200/80 bg-slate-50/60 font-mono text-xs leading-6 text-slate-700"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleHydrateCatalogEditor()}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <ScrollText className="h-4 w-4" />
            {t("settings.developer.serviceSkillCatalog.action.loadCurrent")}
          </button>
          <button
            type="button"
            onClick={() => void handleApplyCatalogPayload()}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <DatabaseZap className="h-4 w-4" />
            {t("settings.developer.serviceSkillCatalog.action.inject")}
          </button>
          <button
            type="button"
            onClick={() => void handleClearServiceSkillCatalog()}
            disabled={busy}
            className={DANGER_BUTTON_CLASS_NAME}
          >
            <Trash2 className="h-4 w-4" />
            {t("settings.developer.serviceSkillCatalog.action.clearCache")}
          </button>
        </div>
      </div>
    </div>
  );
}
