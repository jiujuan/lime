import i18n from "i18next";
import { describe, expect, it } from "vitest";

function assertI18nKeyTypes() {
  i18n.t("common.save", { ns: "common" });
  i18n.t("common.cancel", { ns: "common" });
  i18n.t("common.confirm", { ns: "common" });
  i18n.t("common.app.loadingPage", { ns: "common" });
  i18n.t("common.splashScreen.slogan", { ns: "common" });
  i18n.t("common.splashScreen.subtitle", { ns: "common" });
  i18n.t("common.startupLoading.title", { ns: "common", brand: "Lime" });
  i18n.t("common.startupLoading.description", { ns: "common" });
  i18n.t("common.confirmDialog.title", { ns: "common" });
  i18n.t("common.projectSelector.placeholder.project", { ns: "common" });
  i18n.t("common.projectSelector.management.title.workspace", {
    ns: "common",
  });
  i18n.t("common.projectSelector.toast.renameFailed", {
    ns: "common",
    message: "name exists",
  });
  i18n.t("common.projectSelector.delete.dangerDescription", { ns: "common" });
  i18n.t("common.createProjectDialog.title", { ns: "common" });
  i18n.t("common.projects.rename.nameRequired", { ns: "common" });
  i18n.t("common.createProjectDialog.error.unknown", { ns: "common" });
  i18n.t("common.deepLink.referral.saved.title", { ns: "common" });
  i18n.t("common.app.startup.windows.blockingTitle", { ns: "common" });
  i18n.t("common.updateNotification.version.new", { ns: "common" });
  i18n.t("common.smartInput.status.recording", { ns: "common" });
  i18n.t("common.shortcutSettings.label", { ns: "common" });
  i18n.t("common.shortcutSettings.error.invalid", { ns: "common" });
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
  i18n.t("skills.contentDialog.loading", { ns: "agent" });
  i18n.t("skills.contentDialog.section.metadata", { ns: "agent" });
  i18n.t("skills.contentDialog.emptyInspection", { ns: "agent" });
  i18n.t("skills.repoManager.title", { ns: "agent" });
  i18n.t("skills.repoManager.action.add", { ns: "agent" });
  i18n.t("skills.repoManager.message.addFailed", {
    ns: "agent",
    message: "network down",
  });
  i18n.t("skills.skillCard.source.builtin", { ns: "agent" });
  i18n.t("skills.skillCard.action.install", { ns: "agent" });
  i18n.t("skills.skillCard.compliance.standard", { ns: "agent" });
  i18n.t("skills.workflowProgress.empty", { ns: "agent" });
  i18n.t("skills.workflowProgress.status.retrying", { ns: "agent" });
  i18n.t("skills.workflowProgress.summary.running", {
    ns: "agent",
    current: 1,
    total: 3,
  });
  i18n.t("skills.page.title", { ns: "agent" });
  i18n.t("skills.page.action.refresh", { ns: "agent" });
  i18n.t("skills.page.sections.remote.empty", { ns: "agent" });
  i18n.t("skills.scaffoldDialog.title", { ns: "agent" });
  i18n.t("skills.scaffoldDialog.action.create", { ns: "agent" });
  i18n.t("skills.scaffoldDialog.sourceHint", {
    ns: "agent",
    hint: "research result",
  });
  i18n.t("skills.scaffoldDialog.validation.directory", { ns: "agent" });
  i18n.t("skills.executionDialog.mode.workflow", { ns: "agent" });
  i18n.t("skills.executionDialog.argumentHint", {
    ns: "agent",
    hint: "topic",
  });
  i18n.t("skills.executionDialog.loadFailed.title", { ns: "agent" });
  i18n.t("capabilityDraft.panel.title", { ns: "agent" });
  i18n.t("capabilityDraft.panel.action.verify", { ns: "agent" });
  i18n.t("capabilityDraft.panel.feedback.registered", {
    ns: "agent",
    directory: "capability-register",
  });
  i18n.t("capabilityDraft.panel.summary.filesWithMore", {
    ns: "agent",
    files: "SKILL.md",
    total: 4,
  });
  i18n.t("agentChat.sessionOverview.panel.title", { ns: "agent" });
  i18n.t("agentChat.sessionOverview.status.turn.running", { ns: "agent" });
  i18n.t("agentChat.sessionOverview.timeline.empty", { ns: "agent" });
  i18n.t("agentChat.sessionOverview.queue.imageCount", {
    ns: "agent",
    countLabel: "2",
  });
  i18n.t("agentChat.searchResultPreview.expandMore", {
    ns: "agent",
    countLabel: "2",
  });
  i18n.t("agentChat.searchResultPreview.previewAria", {
    ns: "agent",
    title: "Example",
  });
  i18n.t("agentChat.harnessVerification.section.title", { ns: "agent" });
  i18n.t("agentChat.harnessVerification.artifact.description", {
    ns: "agent",
    fallbackCount: "0",
    issueCount: "2",
    recordCount: "1",
    repairedCount: "1",
  });
  i18n.t("agentChat.incidentPanel.empty", { ns: "agent" });
  i18n.t("agentChat.incidentPanel.priorityBadge", {
    ns: "agent",
    severity: "High",
  });
  i18n.t("navigation.sidebar.items.homeGeneral", { ns: "navigation" });
  i18n.t(
    "workspace.browserExistingSession.presentation.status.attached.label",
    {
      ns: "workspace",
    },
  );
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
  i18n.t("workspace.artifactToolbar.type.code", { ns: "workspace" });
  i18n.t("workspace.artifactToolbar.writePhase.streaming", {
    ns: "workspace",
  });
  i18n.t("workspace.artifactToolbar.action.copyContent", { ns: "workspace" });
  i18n.t("workspace.artifactRenderer.empty.failed.title", {
    ns: "workspace",
  });
  i18n.t("workspace.artifactRenderer.fallback.unknownType", {
    ns: "workspace",
  });
  i18n.t("workspace.canvasAdapter.action.openFullEditor", {
    ns: "workspace",
  });
  i18n.t("workspace.canvasBreadcrumb.backHome", { ns: "workspace" });
  i18n.t("workspace.canvasAdapter.designPreview.visibleLayers", {
    ns: "workspace",
  });
  i18n.t("workspace.browserAssistRenderer.launching.title", {
    ns: "workspace",
  });
  i18n.t("workspace.browserAssistRenderer.replay.title", {
    ns: "workspace",
  });
  i18n.t("workspace.artifactDocument.kind.report", { ns: "workspace" });
  i18n.t("workspace.artifactDocument.stats.blocks.label", {
    ns: "workspace",
  });
  i18n.t("workspace.artifactDocumentBlock.citation.titleFallback", {
    ns: "workspace",
  });
  i18n.t("workspace.a2uiSubmissionNotice.action.expand", {
    ns: "workspace",
  });
  i18n.t("workspace.pendingA2UI.status.progressStep", {
    ns: "workspace",
  });
  i18n.t("workspace.resourceManager.pdf.missingTitle", { ns: "workspace" });
  i18n.t("workspace.resourceManager.pdf.frameTitle", { ns: "workspace" });
  i18n.t("workspace.resourceManager.media.titleFallback", {
    ns: "workspace",
  });
  i18n.t("workspace.resourceManager.media.error.description", {
    ns: "workspace",
  });
  i18n.t("workspace.resourceManager.unsupported.title", {
    ns: "workspace",
  });
  i18n.t("workspace.resourceManager.unsupported.mimeType", {
    ns: "workspace",
    mimeType: "application/octet-stream",
  });
  i18n.t("settings.layout.sidebar.experimentalBadge", { ns: "settings" });
  i18n.t("settings.layout.action.backHome", { ns: "settings" });
  i18n.t("settings.layout.loading.profile", { ns: "settings" });
  i18n.t("settings.layout.placeholder.notFound", { ns: "settings" });
  i18n.t("settings.layout.sidebar.floatingNav.openAria", { ns: "settings" });
  i18n.t("settings.about.version.label", {
    ns: "settings",
    version: "1.10.0",
    build: "1.10.0",
  });
  i18n.t("settings.about.update.errorDownload", { ns: "settings" });
  i18n.t("settings.chromeRelay.guide.header.extension.title", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.guide.action.openRemoteDebugging", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.guide.message.copySuccess", {
    ns: "settings",
    label: "URL",
  });
  i18n.t("settings.chromeRelay.main.engine.xiaohongshu.label", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.main.profile.title", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.main.profile.status.running", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.main.action.openAdvancedTools", {
    ns: "settings",
  });
  i18n.t("settings.chromeRelay.main.message.copyConfigSuccess", {
    ns: "settings",
    label: "Default Browser Connector",
  });
  i18n.t("settings.group.system", { ns: "settings" });
  i18n.t("settings.tab.developerLab", { ns: "settings" });
  i18n.t("settings.developerLab.title", { ns: "settings" });
  i18n.t("settings.developerLab.tabs.experimental", { ns: "settings" });
  i18n.t("settings.developer.title", { ns: "settings" });
  i18n.t("settings.developer.serviceSkill.title", { ns: "settings" });
  i18n.t("settings.developer.siteAdapterCatalog.message.injected", {
    ns: "settings",
    count: 2,
  });
  i18n.t("settings.appearance.hero.title", { ns: "settings" });
  i18n.t("settings.appearance.colorScheme.options.lime-classic.label", {
    ns: "settings",
  });
  i18n.t("settings.appearance.language.title", { ns: "settings" });
  i18n.t("settings.experimental.updateCheck.title", { ns: "settings" });
  i18n.t("settings.experimental.updateCheck.autoCheck.title", {
    ns: "settings",
  });
  i18n.t("settings.experimental.updateCheck.metrics.updateNow", {
    ns: "settings",
    shown: "20",
    updateNow: "3",
    rate: "15",
  });
  i18n.t("settings.experimental.updateCheck.remindLaterUntil", {
    ns: "settings",
    time: "Oct 9, 2025, 4:53 PM",
  });
  i18n.t("settings.experimental.title", { ns: "settings" });
  i18n.t("settings.experimental.webMcp.title", { ns: "settings" });
  i18n.t("settings.experimental.message.webMcpEnabled", { ns: "settings" });
  i18n.t("settings.experimental.crashReporting.environment.label", {
    ns: "settings",
  });
  i18n.t("settings.environment.hero.title", { ns: "settings" });
  i18n.t("settings.environment.summary.shellImport", {
    ns: "settings",
    status: "Imported",
  });
  i18n.t("settings.environment.preview.overriddenSources", {
    ns: "settings",
    sources: "Shell environment import",
  });
  i18n.t("settings.home.group.tipAria", { ns: "settings" });
  i18n.t("settings.home.title", { ns: "settings" });
  i18n.t("settings.home.summary.groups", { ns: "settings" });
  i18n.t("settings.home.quickAccess.cardTipAria", { ns: "settings" });
  i18n.t("settings.home.current.title", { ns: "settings" });
  i18n.t("settings.hotkeys.title", { ns: "settings" });
  i18n.t("settings.hotkeys.summary.globalReady", { ns: "settings" });
  i18n.t("settings.hotkeys.catalog.scene.global.title", { ns: "settings" });
  i18n.t("settings.hotkeys.catalog.status.voiceTranslate.ready.source", {
    ns: "settings",
  });
  i18n.t("settings.memory.title", { ns: "settings" });
  i18n.t("settings.memory.hero.profileCompletion", {
    ns: "settings",
    percent: 75,
  });
  i18n.t("settings.memory.memdir.message.emptyNote", { ns: "settings" });
  i18n.t("settings.memory.source.detail.followImports", {
    ns: "settings",
    value: "Yes",
  });
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
  i18n.t("settings.automation.details.title", { ns: "settings" });
  i18n.t("settings.automation.details.badge.workspace", {
    ns: "settings",
    workspace: "Default Workspace",
  });
  i18n.t("settings.automation.details.legacy.message", { ns: "settings" });
  i18n.t("settings.automation.history.action.refresh", { ns: "settings" });
  i18n.t("settings.automation.serviceSkill.runner.instant", {
    ns: "settings",
  });
  i18n.t("settings.automation.jobDialog.title.create", { ns: "settings" });
  i18n.t("settings.automation.jobDialog.badge.startMethod", {
    ns: "settings",
    method: "Agent Conversation",
  });
  i18n.t("settings.automation.jobDialog.legacy.title", { ns: "settings" });
  i18n.t("settings.automation.jobDialog.footer.create", { ns: "settings" });
  i18n.t("settings.automation.details.statusDetail.blocking", {
    ns: "settings",
  });
  i18n.t("settings.automation.focus.label", { ns: "settings" });
  i18n.t("settings.automation.focus.title", { ns: "settings" });
  i18n.t("settings.automation.focus.action.openDetail", { ns: "settings" });
  i18n.t("settings.automation.focus.strip.recentResult", { ns: "settings" });
  i18n.t("settings.automation.health.title", { ns: "settings" });
  i18n.t("settings.automation.health.status.waitingForHuman", {
    ns: "settings",
  });
  i18n.t("settings.stats.heatmap.rangeValue", { ns: "settings" });
  i18n.t("settings.stats.range.week.label", { ns: "settings" });
  i18n.t("settings.stats.segment.messages", { ns: "settings" });
  i18n.t("settings.channels.logTail.title", { ns: "settings" });
  i18n.t("settings.channels.logTail.error.invalidRegex", { ns: "settings" });
  i18n.t("settings.system.clipboardPermission.macos.title", {
    ns: "settings",
  });
  i18n.t(
    "settings.system.clipboardPermission.message.openSettingsFailedWithMessage",
    {
      ns: "settings",
    },
  );
  i18n.t("settings.system.workspaceRepair.title", { ns: "settings" });
  i18n.t("settings.system.workspaceRepair.message.copiedAll", {
    ns: "settings",
  });
  i18n.t("settings.mediaServices.title", { ns: "settings" });
  i18n.t("settings.mediaServices.sections.responsiveChat.title", {
    ns: "settings",
  });
  i18n.t("settings.mediaServices.card.tipAria", {
    ns: "settings",
    title: "Fast Response Chat Assistant",
  });
  i18n.t("settings.providers.importExport.title", { ns: "settings" });
  i18n.t("settings.providers.importExport.export.action.generate", {
    ns: "settings",
  });
  i18n.t("settings.providers.importExport.import.result.importedProviders", {
    ns: "settings",
    count: 2,
  });
  i18n.t("settings.providers.importExport.import.result.errors", {
    ns: "settings",
    errors: "OpenAI exists",
  });
  i18n.t("settings.mediaGeneration.image.title", { ns: "settings" });
  i18n.t("settings.mediaGeneration.video.hint.ready", { ns: "settings" });
  i18n.t("settings.userCenterSession.value.expiresAt.unknown", {
    ns: "settings",
  });
  i18n.t("settings.userCenterSession.title", { ns: "settings" });
  i18n.t("settings.userCenterSession.login.google.title", { ns: "settings" });
  i18n.t("settings.agent.skills.advancedEntry.title", { ns: "settings" });
  i18n.t("settings.agent.skills.advancedEntry.tipAria", { ns: "settings" });
  i18n.t("settings.voice.input.title", { ns: "settings" });
  i18n.t("settings.voice.model.action.download", { ns: "settings" });
  i18n.t("settings.voice.shortcut.status.fnUnsupported", {
    ns: "settings",
  });
  i18n.t("settings.voice.processing.title", { ns: "settings" });
  i18n.t("settings.voice.media.title", { ns: "settings" });
  i18n.t("settings.voice.model.message.downloaded", {
    ns: "settings",
    model: "SenseVoice Small",
  });
  i18n.t("errors.artifactFallback.title.renderFailed", { ns: "errors" });
  i18n.t("errors.artifactFallback.action.copyErrorReport", { ns: "errors" });
  i18n.t("errors.svgRenderer.error.renderFailed", { ns: "errors" });
  i18n.t("errors.codeRenderer.action.copyCode", { ns: "errors" });
  i18n.t("errors.codeRenderer.error.emptyContent", { ns: "errors" });
  i18n.t("errors.htmlRenderer.error.renderFailed", { ns: "errors" });
  i18n.t("errors.htmlRenderer.action.refreshPreview", { ns: "errors" });
  i18n.t("errors.mermaidRenderer.error.syntax", { ns: "errors" });
  i18n.t("errors.mermaidRenderer.action.exportDiagram", { ns: "errors" });
  i18n.t("errors.crashRecovery.title", { ns: "errors" });
  i18n.t("errors.crashRecovery.action.forceReload", { ns: "errors" });
  i18n.t("errors.crashRecovery.action.retryOnly", { ns: "errors" });
  i18n.t("errors.crashRecovery.message.diagnosticExportedAndOpened", {
    ns: "errors",
    fileName: "diagnostic.json",
    path: "/tmp",
  });
  i18n.t("errors.crashRecovery.moduleImportFailure.prefix", { ns: "errors" });

  // @ts-expect-error i18next key 必须来自已迁移的 zh-CN source resource。
  i18n.t("common.__missing__", { ns: "common" });
}

describe("i18n type binding", () => {
  it("应把类型断言保留在 tsc 覆盖范围内", () => {
    expect(typeof assertI18nKeyTypes).toBe("function");
  });
});
