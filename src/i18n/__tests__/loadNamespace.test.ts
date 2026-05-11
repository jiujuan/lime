import { describe, expect, it } from "vitest";

import {
  CORE_NAMESPACES,
  hasBundledNamespace,
  loadBundledI18nResources,
  loadNamespaceResource,
} from "../loadNamespace";
import { SUPPORTED_LOCALES } from "../locales";

describe("i18n namespace loader", () => {
  it("应为每个支持 locale 内联核心 namespace", () => {
    const resources = loadBundledI18nResources();

    expect(Object.keys(resources).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(resources[locale]).sort()).toEqual(
        [...CORE_NAMESPACES].sort(),
      );
      expect(resources[locale].common).toHaveProperty("common.save");
      expect(resources[locale].common).toHaveProperty(
        "common.app.loadingPage",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.confirmDialog.title",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.projectSelector.placeholder.project",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.createProjectDialog.title",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.projects.rename.nameRequired",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.createProjectDialog.error.unknown",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.deepLink.referral.saved.title",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.app.startup.windows.blockingTitle",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.updateNotification.version.new",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.smartInput.status.recording",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.execution.latestRunStatus.status.success",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.auth.googleSynced",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.auth.browserPreopenTitle",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.auth.systemBrowserOpenFailedWithMessage",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.payment.returnSyncing",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.session.refreshSuccess",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.emailCode.sent",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.apiKey.createSuccess",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemCloudAccess.label.accessMode.session",
      );
      expect(resources[locale].common).toHaveProperty(
        "common.oemLimeHubProviderSync.managedKeyAlias",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.browserExistingSession.presentation.status.attached.label",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.promptInput.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.canvas.sidebar.collapse",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.summary.currentModel.label",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.recentTasks.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.taskStatus.success",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.taskSync.saved.label",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.session.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.session.preview.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.focusedTask.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.focusedTask.source.label",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.generate.submitted",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.workspace.reference.unsupportedFormat",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.intro.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.helper.parameterPace.content",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.reference.start.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.reference.empty.action",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.controls.seed.placeholder",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.controls.cameraFixed.tipContent",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.model.panel.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.video.sidebar.model.meta.sora2Pro.description",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.document.editor.placeholder",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.document.editor.slashCommand.items.image.title",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.document.editor.slashCommand.prompt.imageUrl",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.runtimeAgentsGuide.action.initialize",
      );
      expect(resources[locale].workspace).toHaveProperty(
        "workspace.runtimeAgentsGuide.initialized.title",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.layout.sidebar.experimentalBadge",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.appearance.hero.title",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.appearance.colorScheme.options.lime-classic.label",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.experimental.updateCheck.title",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.home.group.tipAria",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.webSearch.providers.googleEngine.label",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.webSearch.mse.customTemplate.placeholder",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.automation.tasks.list.badge.serviceSkillLegacyCompat",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.automation.details.serviceSkill.executionCompatNote",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.automation.serviceSkill.runner.instant",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.automation.details.statusDetail.blocking",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.stats.heatmap.rangeValue",
      );
      expect(resources[locale].settings).toHaveProperty(
        "settings.userCenterSession.value.expiresAt.unknown",
      );
    }
  });

  it("应能检测已打包 namespace，并把旧 locale 归一后查询", () => {
    expect(hasBundledNamespace("en", "settings")).toBe(true);
    expect(hasBundledNamespace("zh-Hant", "common")).toBe(true);
  });

  it("应在 locale 不支持时回落到 zh-CN resource", () => {
    expect(loadNamespaceResource("fr-FR", "common")["common.save"]).toBe(
      "保存",
    );
    expect(
      loadNamespaceResource("fr-FR", "common")["common.app.loadingPage"],
    ).toBe("页面加载中...");
    expect(
      loadNamespaceResource("fr-FR", "common")["common.confirmDialog.title"],
    ).toBe("确认操作");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.projectSelector.placeholder.project"
      ],
    ).toBe("选择项目");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.createProjectDialog.title"
      ],
    ).toBe("新建项目");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.projects.rename.nameRequired"
      ],
    ).toBe("项目名称不能为空");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.createProjectDialog.error.unknown"
      ],
    ).toBe("未知错误");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.deepLink.referral.saved.title"
      ],
    ).toBe("邀请码已保存");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.app.startup.windows.blockingTitle"
      ],
    ).toBe("Windows 启动自检发现阻塞问题");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.updateNotification.version.new"
      ],
    ).toBe("发现新版本 {{version}}");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.smartInput.status.recording"
      ],
    ).toBe("录音中");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.execution.latestRunStatus.status.success"
      ],
    ).toBe("成功");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.auth.googleSynced"
      ],
    ).toBe("Google 登录成功，已同步云端目录。");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.auth.browserPreopenTitle"
      ],
    ).toBe("正在打开登录页...");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.auth.systemBrowserOpenFailedWithMessage"
      ],
    ).toBe("系统浏览器打开失败：{{message}}");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.payment.returnSyncing"
      ],
    ).toBe("已回到 Lime，正在同步支付状态、权益与账本。");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.session.refreshSuccess"
      ],
    ).toBe("已同步最新云端会话、服务目录与服务技能快照。");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.emailCode.sent"
      ],
    ).toBe("验证码已发送至 {{maskedEmail}}，有效期约 {{minutes}} 分钟。");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.apiKey.createSuccess"
      ],
    ).toBe("已创建 Lime API Key，明文只会在当前页面显示一次。");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemCloudAccess.label.accessMode.session"
      ],
    ).toBe("登录会话");
    expect(
      loadNamespaceResource("fr-FR", "common")[
        "common.oemLimeHubProviderSync.managedKeyAlias"
      ],
    ).toBe("Lime 云端模型");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.browserExistingSession.presentation.status.attached.label"
      ],
    ).toBe("附着当前 Chrome");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.promptInput.title"
      ],
    ).toBe("描述你想生成的画面、镜头与节奏");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.canvas.sidebar.collapse"
      ],
    ).toBe("收起侧栏");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.summary.currentModel.label"
      ],
    ).toBe("当前模型");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.recentTasks.title"
      ],
    ).toBe("最近任务");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.taskStatus.success"
      ],
    ).toBe("已完成");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.taskSync.saved.label"
      ],
    ).toBe("已同步到项目资料");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.session.title"
      ],
    ).toBe("继续调整提示词并追踪最新结果");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.session.preview.title"
      ],
    ).toBe("主预览");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.focusedTask.title"
      ],
    ).toBe("当前查看任务");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.focusedTask.source.label"
      ],
    ).toBe("模型链路");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.generate.submitted"
      ],
    ).toBe("视频任务已提交，正在生成");
    expect(
      loadNamespaceResource("fr-FR", "workspace")[
        "workspace.video.workspace.reference.unsupportedFormat"
      ],
    ).toBe("参考图格式不支持，请重新上传图片");
    expect(
      loadNamespaceResource("fr-FR", "settings")[
        "settings.layout.sidebar.experimentalBadge"
      ],
    ).toBe("实验");
    expect(
      loadNamespaceResource("fr-FR", "settings")[
        "settings.appearance.hero.title"
      ],
    ).toBe("外观");
    expect(
      loadNamespaceResource("fr-FR", "settings")[
        "settings.appearance.colorScheme.options.lime-classic.label"
      ],
    ).toBe("墨绿");
    expect(
      loadNamespaceResource("fr-FR", "settings")[
        "settings.experimental.updateCheck.title"
      ],
    ).toBe("自动更新检查");
  });

  it("应内联主导航 namespace 的首屏文案", () => {
    expect(
      loadNamespaceResource("en-US", "navigation")[
        "navigation.sidebar.items.homeGeneral"
      ],
    ).toBe("New Task");
    expect(
      loadNamespaceResource("zh-CN", "navigation")[
        "navigation.sidebar.items.knowledge"
      ],
    ).toBe("项目资料");
  });
});
