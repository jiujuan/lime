import i18n from "i18next";
import { describe, expect, it } from "vitest";

function assertI18nKeyTypes() {
  i18n.t("common.save", { ns: "common" });
  i18n.t("common.app.loadingPage", { ns: "common" });
  i18n.t("common.confirmDialog.title", { ns: "common" });
  i18n.t("common.projectSelector.placeholder.project", { ns: "common" });
  i18n.t("common.createProjectDialog.title", { ns: "common" });
  i18n.t("common.projects.rename.nameRequired", { ns: "common" });
  i18n.t("common.createProjectDialog.error.unknown", { ns: "common" });
  i18n.t("common.deepLink.referral.saved.title", { ns: "common" });
  i18n.t("common.app.startup.windows.blockingTitle", { ns: "common" });
  i18n.t("common.updateNotification.version.new", { ns: "common" });
  i18n.t("common.smartInput.status.recording", { ns: "common" });
  i18n.t("common.execution.latestRunStatus.status.success", { ns: "common" });
  i18n.t("common.oemCloudAccess.auth.googleSynced", { ns: "common" });
  i18n.t("common.oemCloudAccess.auth.browserPreopenTitle", { ns: "common" });
  i18n.t("common.oemCloudAccess.auth.systemBrowserOpenFailedWithMessage", {
    ns: "common",
  });
  i18n.t("common.oemCloudAccess.payment.returnSyncing", { ns: "common" });
  i18n.t("common.oemCloudAccess.session.refreshSuccess", { ns: "common" });
  i18n.t("common.oemCloudAccess.emailCode.sent", { ns: "common" });
  i18n.t("common.oemCloudAccess.apiKey.createSuccess", { ns: "common" });
  i18n.t("common.oemCloudAccess.label.accessMode.session", {
    ns: "common",
  });
  i18n.t("common.oemLimeHubProviderSync.managedKeyAlias", { ns: "common" });
  i18n.t("navigation.sidebar.items.homeGeneral", { ns: "navigation" });
  i18n.t("workspace.browserExistingSession.presentation.status.attached.label", {
    ns: "workspace",
  });
  i18n.t("workspace.video.promptInput.title", { ns: "workspace" });
  i18n.t("workspace.video.canvas.sidebar.collapse", { ns: "workspace" });
  i18n.t("workspace.video.workspace.summary.currentModel.label", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.recentTasks.title", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.taskStatus.success", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.taskSync.saved.label", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.session.title", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.session.preview.title", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.focusedTask.title", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.focusedTask.source.label", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.generate.submitted", {
    ns: "workspace",
  });
  i18n.t("workspace.video.workspace.reference.unsupportedFormat", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.intro.title", { ns: "workspace" });
  i18n.t("workspace.video.sidebar.helper.parameterPace.content", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.reference.start.title", { ns: "workspace" });
  i18n.t("workspace.video.sidebar.reference.empty.action", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.controls.seed.placeholder", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.controls.cameraFixed.tipContent", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.model.panel.title", {
    ns: "workspace",
  });
  i18n.t("workspace.video.sidebar.model.meta.sora2Pro.description", {
    ns: "workspace",
  });
  i18n.t("workspace.document.editor.placeholder", { ns: "workspace" });
  i18n.t("workspace.document.editor.slashCommand.items.image.title", {
    ns: "workspace",
  });
  i18n.t("workspace.document.editor.slashCommand.prompt.imageUrl", {
    ns: "workspace",
  });
  i18n.t("workspace.runtimeAgentsGuide.action.initialize", {
    ns: "workspace",
  });
  i18n.t("workspace.runtimeAgentsGuide.initialized.title", {
    ns: "workspace",
  });
  i18n.t("settings.layout.sidebar.experimentalBadge", { ns: "settings" });
  i18n.t("settings.appearance.hero.title", { ns: "settings" });
  i18n.t("settings.appearance.colorScheme.options.lime-classic.label", {
    ns: "settings",
  });
  i18n.t("settings.appearance.language.title", { ns: "settings" });
  i18n.t("settings.experimental.updateCheck.title", { ns: "settings" });
  i18n.t("settings.home.group.tipAria", { ns: "settings" });
  i18n.t("settings.webSearch.providers.googleEngine.label", {
    ns: "settings",
  });
  i18n.t("settings.webSearch.mse.customTemplate.placeholder", {
    ns: "settings",
  });
  i18n.t("settings.automation.tasks.list.badge.serviceSkillLegacyCompat", {
    ns: "settings",
  });
  i18n.t("settings.automation.details.serviceSkill.executionCompatNote", {
    ns: "settings",
  });
  i18n.t("settings.automation.serviceSkill.runner.instant", {
    ns: "settings",
  });
  i18n.t("settings.automation.details.statusDetail.blocking", {
    ns: "settings",
  });
  i18n.t("settings.stats.heatmap.rangeValue", { ns: "settings" });
  i18n.t("settings.userCenterSession.value.expiresAt.unknown", {
    ns: "settings",
  });

  // @ts-expect-error i18next key 必须来自已迁移的 zh-CN source resource。
  i18n.t("common.__missing__", { ns: "common" });
}

describe("i18n type binding", () => {
  it("应把类型断言保留在 tsc 覆盖范围内", () => {
    expect(typeof assertI18nKeyTypes).toBe("function");
  });
});
