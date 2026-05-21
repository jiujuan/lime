import { safeInvoke } from "@/lib/dev-bridge";
import type {
  SkillMarketplaceBundle,
  SkillMarketplaceInstallResult,
} from "./officialSkillMarketplace";

export type SkillSourceKind = "builtin" | "other";
export type SkillCatalogSource = "project" | "user" | "remote";
export type SkillScaffoldTarget = "project" | "user";

export interface SkillResourceSummary {
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
}

export interface SkillStandardCompliance {
  isStandard: boolean;
  validationErrors: string[];
  deprecatedFields: string[];
}

export interface SkillInspection {
  content: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools: string[];
  resourceSummary: SkillResourceSummary;
  standardCompliance: SkillStandardCompliance;
}

export type LocalSkillInspection = SkillInspection;

export interface RemoteSkillLocator extends Record<string, unknown> {
  owner: string;
  name: string;
  branch: string;
  directory: string;
}

export interface CreateSkillScaffoldRequest extends Record<string, unknown> {
  target: SkillScaffoldTarget;
  directory: string;
  name: string;
  description: string;
  whenToUse?: string[];
  inputs?: string[];
  outputs?: string[];
  steps?: string[];
  fallbackStrategy?: string[];
}

export interface Skill {
  key: string;
  name: string;
  description: string;
  directory: string;
  readmeUrl?: string;
  installed: boolean;
  sourceKind: SkillSourceKind;
  catalogSource?: SkillCatalogSource;
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
  resourceSummary?: SkillResourceSummary;
  standardCompliance?: SkillStandardCompliance;
}

export interface SkillRepo {
  owner: string;
  name: string;
  branch: string;
  enabled: boolean;
}

export interface ImportedSkillResult {
  directory: string;
}

export interface LocalSkillPackageFileEntry {
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface LocalSkillPackageInspectionResult {
  directory: string;
  inspection: SkillInspection;
  files: LocalSkillPackageFileEntry[];
}

export interface SkillPackageFileAssociationStatus {
  platform: string;
  extension: string;
  extensions?: string[];
  mimeType: string;
  appIdentifier: string;
  isDefault: boolean;
  canSetDefault: boolean;
  requiresUserConfirmation: boolean;
  currentHandler?: string | null;
  settingsUrl?: string | null;
  detail?: string | null;
}

export interface SkillPackageFileAssociationApplyResult {
  changed: boolean;
  message: string;
  status: SkillPackageFileAssociationStatus;
}

export interface SkillPackageExportResult {
  directory: string;
  outputPath: string;
  fileCount: number;
  bytesWritten: number;
}

export interface SkillDownloadInstallRequest extends Record<string, unknown> {
  skillName: string;
  downloadUrl: string;
}

export type AppType = "claude" | "codex" | "gemini" | "lime";

export const SKILL_PACKAGE_OPEN_EVENT = "skill-package://open";

function normalizeStandardCompliance(
  compliance?: Partial<SkillStandardCompliance> | null,
): SkillStandardCompliance | undefined {
  if (!compliance) {
    return undefined;
  }

  return {
    isStandard: Boolean(compliance.isStandard),
    validationErrors: Array.isArray(compliance.validationErrors)
      ? compliance.validationErrors
      : [],
    deprecatedFields: Array.isArray(compliance.deprecatedFields)
      ? compliance.deprecatedFields
      : [],
  };
}

function normalizeSkill(skill: Skill): Skill {
  return {
    ...skill,
    standardCompliance: normalizeStandardCompliance(skill.standardCompliance),
  };
}

function normalizeInspection(inspection: SkillInspection): SkillInspection {
  return {
    ...inspection,
    standardCompliance: normalizeStandardCompliance(
      inspection.standardCompliance,
    ) ?? {
      isStandard: false,
      validationErrors: [],
      deprecatedFields: [],
    },
  };
}

function normalizeSkills(value: Skill[] | null | undefined): Skill[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeSkill);
}

function normalizeSkillRepos(
  value: SkillRepo[] | null | undefined,
): SkillRepo[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export const skillsApi = {
  async getLocal(app: AppType = "lime"): Promise<Skill[]> {
    const skills = await safeInvoke<Skill[]>("get_local_skills_for_app", {
      app,
    });
    return normalizeSkills(skills);
  },

  async getAll(
    app: AppType = "lime",
    options?: { refreshRemote?: boolean },
  ): Promise<Skill[]> {
    const skills = await safeInvoke<Skill[]>("get_skills_for_app", {
      app,
      refresh_remote: options?.refreshRemote ?? false,
    });
    return normalizeSkills(skills);
  },

  async install(directory: string, app: AppType = "lime"): Promise<boolean> {
    return safeInvoke("install_skill_for_app", { app, directory });
  },

  async uninstall(directory: string, app: AppType = "lime"): Promise<boolean> {
    return safeInvoke("uninstall_skill_for_app", { app, directory });
  },

  async getRepos(): Promise<SkillRepo[]> {
    const repos = await safeInvoke<SkillRepo[]>("get_skill_repos");
    return normalizeSkillRepos(repos);
  },

  async addRepo(repo: SkillRepo): Promise<boolean> {
    return safeInvoke("add_skill_repo", { repo });
  },

  async removeRepo(owner: string, name: string): Promise<boolean> {
    return safeInvoke("remove_skill_repo", { owner, name });
  },

  async refreshCache(): Promise<boolean> {
    return safeInvoke("refresh_skill_cache");
  },

  /**
   * 获取已安装的 Lime Skills 目录列表
   *
   * 扫描 Lime 可发现的 provider Skills 根目录，返回包含 SKILL.md 的子目录名列表。
   * 这些 Skills 将被传递给 aster 用于 AI Agent 功能。
   *
   * @returns 已安装的 Skill 目录名列表
   */
  async getInstalledLimeSkills(): Promise<string[]> {
    const directories = await safeInvoke<string[]>("get_installed_lime_skills");
    return normalizeStringList(directories);
  },

  /**
   * 获取本地已安装 Skill 的标准检查结果
   *
   * @param directory Skill 目录名
   * @param app 应用类型
   * @returns 标准检查结果与原始 SKILL.md 内容
   */
  async inspectLocalSkill(
    directory: string,
    app: AppType = "lime",
  ): Promise<SkillInspection> {
    const inspection = await safeInvoke<SkillInspection>(
      "inspect_local_skill_for_app",
      { app, directory },
    );
    return normalizeInspection(inspection);
  },

  async createSkillScaffold(
    request: CreateSkillScaffoldRequest,
    app: AppType = "lime",
  ): Promise<SkillInspection> {
    const inspection = await safeInvoke<SkillInspection>(
      "create_skill_scaffold_for_app",
      {
        app,
        request,
      },
    );
    return normalizeInspection(inspection);
  },

  async importLocalSkill(
    sourcePath: string,
    app: AppType = "lime",
  ): Promise<ImportedSkillResult> {
    return safeInvoke<ImportedSkillResult>("import_local_skill_for_app", {
      app,
      sourcePath,
    });
  },

  async inspectLocalSkillPackage(
    sourcePath: string,
    app: AppType = "lime",
  ): Promise<LocalSkillPackageInspectionResult> {
    const result = await safeInvoke<LocalSkillPackageInspectionResult>(
      "inspect_local_skill_package_for_app",
      {
        app,
        sourcePath,
      },
    );
    return {
      ...result,
      inspection: normalizeInspection(result.inspection),
      files: Array.isArray(result.files) ? result.files : [],
    };
  },

  async installLocalSkillPackage(
    sourcePath: string,
    app: AppType = "lime",
  ): Promise<SkillMarketplaceInstallResult> {
    const result = await safeInvoke<SkillMarketplaceInstallResult>(
      "install_local_skill_package_for_app",
      {
        app,
        sourcePath,
      },
    );
    return {
      ...result,
      inspection: normalizeInspection(result.inspection),
    };
  },

  async takePendingSkillPackageOpenRequests(): Promise<string[]> {
    const paths = await safeInvoke<string[]>(
      "take_pending_skill_package_open_requests",
    );
    return normalizeStringList(paths);
  },

  async getSkillPackageFileAssociationStatus(): Promise<SkillPackageFileAssociationStatus> {
    return safeInvoke<SkillPackageFileAssociationStatus>(
      "get_skill_package_file_association_status",
    );
  },

  async setSkillPackageFileAssociationDefault(): Promise<SkillPackageFileAssociationApplyResult> {
    return safeInvoke<SkillPackageFileAssociationApplyResult>(
      "set_skill_package_file_association_default",
    );
  },

  async exportLocalSkillPackage(
    directory: string,
    targetPath: string,
    app: AppType = "lime",
  ): Promise<SkillPackageExportResult> {
    return safeInvoke<SkillPackageExportResult>(
      "export_local_skill_package_for_app",
      {
        app,
        directory,
        targetPath,
      },
    );
  },

  async installMarketplaceBundle(
    bundle: SkillMarketplaceBundle,
    app: AppType = "lime",
  ): Promise<SkillMarketplaceInstallResult> {
    return safeInvoke<SkillMarketplaceInstallResult>(
      "install_marketplace_skill_for_app",
      {
        app,
        bundle,
      },
    );
  },

  async installFromDownloadUrl(
    request: SkillDownloadInstallRequest,
    app: AppType = "lime",
  ): Promise<SkillMarketplaceInstallResult> {
    return safeInvoke<SkillMarketplaceInstallResult>(
      "install_skill_from_download_url_for_app",
      {
        app,
        request,
      },
    );
  },

  async inspectRemoteSkill(
    locator: RemoteSkillLocator,
  ): Promise<SkillInspection> {
    const inspection = await safeInvoke<SkillInspection>(
      "inspect_remote_skill",
      locator,
    );
    return normalizeInspection(inspection);
  },
};
