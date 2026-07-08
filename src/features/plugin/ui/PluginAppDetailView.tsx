import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PluginUninstallRehearsalResult } from "@/lib/api/plugins";
import type { PluginLifecycleUninstallRehearsalDescriptor } from "../install/lifecycleAction";
import type {
  CloudBootstrapApp,
  InstalledPluginState,
  PluginUiMountResult,
  ProjectedEntry,
} from "../types";
import type { DetailDeclaration } from "./pluginDetailDeclarations";
import {
  PluginDetailAgentsSection,
  PluginDetailAuthorizationsSection,
  PluginDetailCommonEntriesSection,
  PluginDetailHeroSection,
  PluginDetailHostLifecycleSection,
  PluginDetailMoreInfoSection,
  PluginDetailSummaryAside,
} from "./PluginDetailSections";
import {
  PluginDetailRuntimeRequirementSections,
  PluginDetailSubagentsSection,
} from "./PluginDetailRuntimeSections";
import { PluginLifecycleActionsSection } from "./PluginLifecycleActionsSection";
import type { PluginDynamicTranslation } from "./PluginsPagePresentation";
import type { AppCenterItem } from "./PluginsPageViewModel";

type UninstallMode = "keep-data" | "delete-data";

function PluginRegistrationForm({
  app,
  busyAction,
  registrationCode,
  t,
  onRegistrationCodeChange,
  onSubmitRegistration,
}: {
  app: CloudBootstrapApp;
  busyAction: string | null;
  registrationCode: string;
  t: PluginDynamicTranslation;
  onRegistrationCodeChange: (appId: string, value: string) => void;
  onSubmitRegistration: (app: CloudBootstrapApp) => void | Promise<void>;
}) {
  return (
    <div
      className="rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3"
      data-testid={`plugins-registration-${app.appId}`}
    >
      <p className="text-xs font-semibold text-[color:var(--lime-text-strong)]">
        {t("plugin.apps.center.detail.registrationHint")}
      </p>
      <p className="mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]">
        {app.registrationHint ??
          t("plugin.apps.registration.hintFallback", {
            state: app.registrationState ?? "required",
          })}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2 text-xs text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
          value={registrationCode}
          onChange={(event) =>
            onRegistrationCodeChange(app.appId, event.target.value)
          }
          onInput={(event) =>
            onRegistrationCodeChange(app.appId, event.currentTarget.value)
          }
          placeholder={t("plugin.apps.registration.placeholder")}
          aria-label={t("plugin.apps.registration.placeholder")}
          data-testid={`plugins-registration-code-${app.appId}`}
        />
        <button
          type="button"
          className="shrink-0 rounded-full bg-[color:var(--lime-text-strong)] px-3 py-2 text-xs font-medium text-[color:var(--lime-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busyAction)}
          onClick={() => void onSubmitRegistration(app)}
          data-testid={`plugins-submit-registration-${app.appId}`}
        >
          {t("plugin.apps.registration.submit")}
        </button>
      </div>
    </div>
  );
}

export function PluginAppDetailView({
  activeUninstallDescriptor,
  busyAction,
  deleteDataConfirmationInput,
  deleteDataConfirmationMatches,
  deleteDataConfirmationPhrase,
  deleteDataExecutionBlocked,
  item,
  launchSummary,
  moreInfoOpen,
  mountedUi,
  registrationCode,
  selected,
  t,
  uninstallPreview,
  onCloudAction,
  onClose,
  onConfirmUninstall,
  onDeleteDataConfirmationInputChange,
  onLaunchActivationDeclaration,
  onLaunchEntry,
  onMoreInfoToggle,
  onPreviewUninstall,
  onPrimaryAction,
  onRegistrationCodeChange,
  onSetDisabled,
  onSubmitRegistration,
}: {
  activeUninstallDescriptor: PluginLifecycleUninstallRehearsalDescriptor | null;
  busyAction: string | null;
  deleteDataConfirmationInput: string;
  deleteDataConfirmationMatches: boolean;
  deleteDataConfirmationPhrase: string;
  deleteDataExecutionBlocked: boolean;
  item: AppCenterItem;
  launchSummary: string | null;
  moreInfoOpen: boolean;
  mountedUi: PluginUiMountResult | null;
  registrationCode: string;
  selected: InstalledPluginState | null;
  t: PluginDynamicTranslation;
  uninstallPreview: PluginUninstallRehearsalResult | null;
  onCloudAction: (item: AppCenterItem) => void | Promise<void>;
  onClose: () => void;
  onConfirmUninstall: () => void | Promise<void>;
  onDeleteDataConfirmationInputChange: (value: string) => void;
  onLaunchActivationDeclaration: (
    state: InstalledPluginState,
    declaration: DetailDeclaration,
  ) => void;
  onLaunchEntry: (
    state: InstalledPluginState,
    entry: ProjectedEntry,
  ) => void | Promise<void>;
  onMoreInfoToggle: () => void;
  onPreviewUninstall: (
    state: InstalledPluginState,
    mode: UninstallMode,
  ) => void | Promise<void>;
  onPrimaryAction: (item: AppCenterItem) => void | Promise<void>;
  onRegistrationCodeChange: (appId: string, value: string) => void;
  onSetDisabled: (
    state: InstalledPluginState,
    disabled: boolean,
  ) => void | Promise<void>;
  onSubmitRegistration: (app: CloudBootstrapApp) => void | Promise<void>;
}) {
  return (
    <main
      className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,760px)_280px]"
      data-testid="plugins-detail"
    >
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--lime-text-muted)]">
          <div className="flex min-w-0 items-center gap-2">
            <span>{t("plugin.apps.center.title")}</span>
            <ChevronRight size={14} />
            <span className="truncate font-medium text-[color:var(--lime-text-strong)]">
              {item.title}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text)] transition hover:bg-[color:var(--lime-surface-hover)]"
            aria-label={t("plugin.apps.center.detail.backToList")}
            title={t("plugin.apps.center.detail.backToList")}
            onClick={onClose}
            data-testid="plugins-close-detail"
          >
            <ChevronLeft size={14} />
            {t("plugin.apps.center.detail.backToList")}
          </button>
        </div>

        <PluginDetailHeroSection
          item={item}
          busyAction={busyAction}
          t={t}
          onPrimaryAction={onPrimaryAction}
          onCloudAction={onCloudAction}
          onLaunchEntry={onLaunchEntry}
        />

        {item.registrationBlocked && item.cloudApp ? (
          <PluginRegistrationForm
            app={item.cloudApp}
            busyAction={busyAction}
            registrationCode={registrationCode}
            t={t}
            onRegistrationCodeChange={onRegistrationCodeChange}
            onSubmitRegistration={onSubmitRegistration}
          />
        ) : null}

        <PluginDetailHostLifecycleSection item={item} t={t} />

        <PluginDetailAgentsSection
          item={item}
          busyAction={busyAction}
          t={t}
          onLaunchActivationDeclaration={onLaunchActivationDeclaration}
        />

        <PluginDetailSubagentsSection item={item} />

        <PluginDetailAuthorizationsSection item={item} t={t} />

        <PluginDetailRuntimeRequirementSections item={item} />

        <PluginDetailCommonEntriesSection
          item={item}
          busyAction={busyAction}
          t={t}
          onLaunchEntry={onLaunchEntry}
        />

        {mountedUi && mountedUi.appId === item.appId ? (
          <section className="sr-only" data-testid="plugins-mounted-ui">
            {t("plugin.apps.surface.title", {
              title: mountedUi.title,
            })}
            {mountedUi.route ?? mountedUi.entryKey}
          </section>
        ) : null}

        {launchSummary ? (
          <div
            role="status"
            className="rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3 text-sm font-medium text-[color:var(--lime-text-strong)]"
            data-testid="plugins-launch-summary"
          >
            {launchSummary}
          </div>
        ) : null}

        <PluginLifecycleActionsSection
          selected={selected}
          busyAction={busyAction}
          uninstallPreview={uninstallPreview}
          activeUninstallDescriptor={activeUninstallDescriptor}
          deleteDataExecutionBlocked={deleteDataExecutionBlocked}
          deleteDataConfirmationPhrase={deleteDataConfirmationPhrase}
          deleteDataConfirmationInput={deleteDataConfirmationInput}
          deleteDataConfirmationMatches={deleteDataConfirmationMatches}
          t={t}
          onSetDisabled={onSetDisabled}
          onPreviewUninstall={onPreviewUninstall}
          onConfirmUninstall={onConfirmUninstall}
          onDeleteDataConfirmationInputChange={
            onDeleteDataConfirmationInputChange
          }
        />

        <PluginDetailMoreInfoSection
          item={item}
          isOpen={moreInfoOpen}
          t={t}
          onToggle={onMoreInfoToggle}
        />
      </div>
      <PluginDetailSummaryAside item={item} t={t} />
    </main>
  );
}
