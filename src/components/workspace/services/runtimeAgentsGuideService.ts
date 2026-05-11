import { toast } from "sonner";
import i18n from "i18next";
import {
  ensureWorkspaceLocalAgentsGitignore,
  scaffoldRuntimeAgentsTemplate,
} from "@/lib/api/memoryRuntime";
import { initLimeI18n } from "@/i18n/createI18n";
import type { Project } from "@/lib/api/project";

const RUNTIME_AGENTS_GUIDE_STORAGE_KEY =
  "lime.runtime_agents_workspace_guide_seen.v1";

const runtimeAgentsInitializationRoots = new Set<string>();

type RuntimeAgentsGuideProject = Pick<Project, "id" | "rootPath"> &
  Partial<Pick<Project, "name">>;

interface NotifyRuntimeAgentsGuideOptions {
  successMessage: string;
  showSuccessWhenGuideAlreadySeen?: boolean;
}

interface RuntimeAgentsGuideCopy {
  actionLabel: string;
  guideDescription: string;
  initializedTitle: string;
  initializedErrorTitle: string;
  initializedErrorDescription: string;
  sharedTemplateLabel: string;
  localTemplateLabel: string;
  templateExists: (label: string) => string;
  templateCreated: (label: string) => string;
  gitignoreExists: string;
  gitignoreCreated: string;
}

function buildRuntimeAgentsGuideCopy(): RuntimeAgentsGuideCopy {
  const currentI18n = i18n.isInitialized ? i18n : initLimeI18n();
  const t = currentI18n.getFixedT(currentI18n.language, "workspace");

  return {
    actionLabel: t("workspace.runtimeAgentsGuide.action.initialize", {
      defaultValue: "一键初始化",
    }),
    guideDescription: t("workspace.runtimeAgentsGuide.description", {
      defaultValue:
        "建议初始化共享规则 `.lime/AGENTS.md` 与本机私有规则 `.lime/AGENTS.local.md`，后者会自动加入 `.gitignore`。",
    }),
    initializedTitle: t("workspace.runtimeAgentsGuide.initialized.title", {
      defaultValue: "已初始化运行时 AGENTS 模板",
    }),
    initializedErrorTitle: t("workspace.runtimeAgentsGuide.initialized.errorTitle", {
      defaultValue: "初始化运行时 AGENTS 模板失败",
    }),
    initializedErrorDescription: t(
      "workspace.runtimeAgentsGuide.initialized.errorDescription",
      {
        defaultValue: "可以稍后在 设置 → 记忆 中手动生成或补齐。",
      },
    ),
    sharedTemplateLabel: t("workspace.runtimeAgentsGuide.template.shared", {
      defaultValue: "共享",
    }),
    localTemplateLabel: t("workspace.runtimeAgentsGuide.template.local", {
      defaultValue: "本机",
    }),
    templateExists: (label: string) =>
      t("workspace.runtimeAgentsGuide.template.exists", {
        defaultValue: "{{label}}模板已存在",
        label,
      }),
    templateCreated: (label: string) =>
      t("workspace.runtimeAgentsGuide.template.created", {
        defaultValue: "{{label}}模板已生成",
        label,
      }),
    gitignoreExists: t("workspace.runtimeAgentsGuide.gitignore.exists", {
      defaultValue: ".gitignore 已包含本机模板规则",
    }),
    gitignoreCreated: t("workspace.runtimeAgentsGuide.gitignore.created", {
      defaultValue: ".gitignore 已写入本机模板规则",
    }),
  };
}

function buildGuideStorageKey(project: RuntimeAgentsGuideProject): string {
  const projectId = project.id.trim();
  if (projectId) {
    return projectId;
  }
  return project.rootPath.trim();
}

function loadGuideSeenKeys(): Set<string> {
  if (typeof window === "undefined" || !window.localStorage) {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_AGENTS_GUIDE_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(
      parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  } catch {
    return new Set();
  }
}

function saveGuideSeenKeys(keys: Set<string>) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(
    RUNTIME_AGENTS_GUIDE_STORAGE_KEY,
    JSON.stringify(Array.from(keys)),
  );
}

function markGuideAsShown(project: RuntimeAgentsGuideProject): boolean {
  const key = buildGuideStorageKey(project);
  if (!key) {
    return false;
  }

  const keys = loadGuideSeenKeys();
  if (keys.has(key)) {
    return false;
  }

  keys.add(key);
  saveGuideSeenKeys(keys);
  return true;
}

function describeTemplateStatus(
  label: string,
  status: string,
  copy: RuntimeAgentsGuideCopy,
): string {
  if (status === "exists") {
    return copy.templateExists(label);
  }
  return copy.templateCreated(label);
}

function describeGitignoreStatus(
  status: string,
  copy: RuntimeAgentsGuideCopy,
): string {
  if (status === "exists") {
    return copy.gitignoreExists;
  }
  return copy.gitignoreCreated;
}

async function initializeRuntimeAgentsGuide(
  project: RuntimeAgentsGuideProject,
) {
  const rootPath = project.rootPath.trim();
  if (!rootPath || runtimeAgentsInitializationRoots.has(rootPath)) {
    return;
  }

  runtimeAgentsInitializationRoots.add(rootPath);

  try {
    const copy = buildRuntimeAgentsGuideCopy();
    const workspaceTemplate = await scaffoldRuntimeAgentsTemplate(
      "workspace",
      rootPath,
      false,
    );
    const localTemplate = await scaffoldRuntimeAgentsTemplate(
      "workspace_local",
      rootPath,
      false,
    );
    const gitignoreResult = await ensureWorkspaceLocalAgentsGitignore(rootPath);

    toast.success(copy.initializedTitle, {
      description: [
        describeTemplateStatus(
          copy.sharedTemplateLabel,
          workspaceTemplate.status,
          copy,
        ),
        describeTemplateStatus(copy.localTemplateLabel, localTemplate.status, copy),
        describeGitignoreStatus(gitignoreResult.status, copy),
      ].join("；"),
    });
  } catch (error) {
    console.error("初始化运行时 AGENTS 模板失败:", error);
    const copy = buildRuntimeAgentsGuideCopy();
    toast.error(copy.initializedErrorTitle, {
      description: copy.initializedErrorDescription,
    });
  } finally {
    runtimeAgentsInitializationRoots.delete(rootPath);
  }
}

export function notifyProjectRuntimeAgentsGuide(
  project: RuntimeAgentsGuideProject,
  options: NotifyRuntimeAgentsGuideOptions,
) {
  const { successMessage, showSuccessWhenGuideAlreadySeen = true } = options;
  const rootPath = project.rootPath.trim();
  if (!rootPath || !markGuideAsShown(project)) {
    if (showSuccessWhenGuideAlreadySeen) {
      toast.success(successMessage);
    }
    return;
  }

  const copy = buildRuntimeAgentsGuideCopy();
  toast.success(successMessage, {
    description: copy.guideDescription,
    action: {
      label: copy.actionLabel,
      onClick: async () => {
        await initializeRuntimeAgentsGuide(project);
      },
    },
  });
}

export function notifyProjectCreatedWithRuntimeAgentsGuide(
  project: RuntimeAgentsGuideProject,
  successMessage: string,
) {
  notifyProjectRuntimeAgentsGuide(project, {
    successMessage,
    showSuccessWhenGuideAlreadySeen: true,
  });
}
