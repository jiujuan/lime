import { safeInvoke } from "@/lib/dev-bridge";
import type {
  SkillMarketplaceBundle,
  SkillMarketplaceInstallResult,
} from "./officialSkillMarketplace";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

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
  content?: string;
}

export interface LocalSkillPackageInspectionResult {
  directory: string;
  inspection: SkillInspection;
  files: LocalSkillPackageFileEntry[];
}

export type LocalSkillDetailInspectionResult =
  LocalSkillPackageInspectionResult;

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

async function invokeSkillsCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实 Skill 管理 current 通道");
  return result as T;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isSkillPackageFileAssociationStatus(
  value: unknown,
): value is SkillPackageFileAssociationStatus {
  return (
    isRecord(value) &&
    typeof value.platform === "string" &&
    typeof value.extension === "string" &&
    (value.extensions === undefined ||
      (Array.isArray(value.extensions) &&
        value.extensions.every((item) => typeof item === "string"))) &&
    typeof value.mimeType === "string" &&
    typeof value.appIdentifier === "string" &&
    typeof value.isDefault === "boolean" &&
    typeof value.canSetDefault === "boolean" &&
    typeof value.requiresUserConfirmation === "boolean" &&
    isOptionalString(value.currentHandler) &&
    isOptionalString(value.settingsUrl) &&
    isOptionalString(value.detail)
  );
}

function isSkillPackageFileAssociationApplyResult(
  value: unknown,
): value is SkillPackageFileAssociationApplyResult {
  return (
    isRecord(value) &&
    typeof value.changed === "boolean" &&
    typeof value.message === "string" &&
    isSkillPackageFileAssociationStatus(value.status)
  );
}

export const skillsApi = {
  async getLocal(app: AppType = "lime"): Promise<Skill[]> {
    const skills = await invokeSkillsCommand<Skill[]>(
      "get_local_skills_for_app",
      {
        app,
      },
    );
    return normalizeSkills(skills);
  },

  async getAll(
    app: AppType = "lime",
    options?: { refreshRemote?: boolean },
  ): Promise<Skill[]> {
    const skills = await invokeSkillsCommand<Skill[]>("get_skills_for_app", {
      app,
      refresh_remote: options?.refreshRemote ?? false,
    });
    return normalizeSkills(skills);
  },

  async install(directory: string, app: AppType = "lime"): Promise<boolean> {
    return invokeSkillsCommand("install_skill_for_app", { app, directory });
  },

  async uninstall(directory: string, app: AppType = "lime"): Promise<boolean> {
    return invokeSkillsCommand("uninstall_skill_for_app", { app, directory });
  },

  async getRepos(): Promise<SkillRepo[]> {
    const repos = await invokeSkillsCommand<SkillRepo[]>("get_skill_repos");
    return normalizeSkillRepos(repos);
  },

  async addRepo(repo: SkillRepo): Promise<boolean> {
    return invokeSkillsCommand("add_skill_repo", { repo });
  },

  async removeRepo(owner: string, name: string): Promise<boolean> {
    return invokeSkillsCommand("remove_skill_repo", { owner, name });
  },

  async refreshCache(): Promise<boolean> {
    return invokeSkillsCommand("refresh_skill_cache");
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
    const directories = await invokeSkillsCommand<string[]>(
      "get_installed_lime_skills",
    );
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
    const inspection = await invokeSkillsCommand<SkillInspection>(
      "inspect_local_skill_for_app",
      { app, directory },
    );
    return normalizeInspection(inspection);
  },

  async inspectLocalSkillDetail(
    directory: string,
    app: AppType = "lime",
  ): Promise<LocalSkillDetailInspectionResult> {
    const result = await invokeSkillsCommand<LocalSkillDetailInspectionResult>(
      "inspect_local_skill_detail_for_app",
      { app, directory },
    );
    return {
      ...result,
      inspection: normalizeInspection(result.inspection),
      files: Array.isArray(result.files) ? result.files : [],
    };
  },

  async revealLocalSkill(
    directory: string,
    app: AppType = "lime",
  ): Promise<boolean> {
    return invokeSkillsCommand<boolean>("reveal_local_skill_for_app", {
      app,
      directory,
    });
  },

  async renameLocalSkill(
    directory: string,
    newDirectory: string,
    app: AppType = "lime",
  ): Promise<ImportedSkillResult> {
    return invokeSkillsCommand<ImportedSkillResult>(
      "rename_local_skill_for_app",
      {
        app,
        directory,
        newDirectory,
      },
    );
  },

  async replaceLocalSkillPackage(
    directory: string,
    sourcePath: string,
    app: AppType = "lime",
  ): Promise<SkillMarketplaceInstallResult> {
    const result = await invokeSkillsCommand<SkillMarketplaceInstallResult>(
      "replace_local_skill_package_for_app",
      {
        app,
        directory,
        sourcePath,
      },
    );
    return {
      ...result,
      inspection: normalizeInspection(result.inspection),
    };
  },

  async createSkillScaffold(
    request: CreateSkillScaffoldRequest,
    app: AppType = "lime",
  ): Promise<SkillInspection> {
    const inspection = await invokeSkillsCommand<SkillInspection>(
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
    return invokeSkillsCommand<ImportedSkillResult>(
      "import_local_skill_for_app",
      {
        app,
        sourcePath,
      },
    );
  },

  async inspectLocalSkillPackage(
    sourcePath: string,
    app: AppType = "lime",
  ): Promise<LocalSkillPackageInspectionResult> {
    const result = await invokeSkillsCommand<LocalSkillPackageInspectionResult>(
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
    const result = await invokeSkillsCommand<SkillMarketplaceInstallResult>(
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
    const paths = await invokeSkillsCommand<string[]>(
      "take_pending_skill_package_open_requests",
    );
    return normalizeStringList(paths);
  },

  async getSkillPackageFileAssociationStatus(): Promise<SkillPackageFileAssociationStatus> {
    const result = await invokeSkillsCommand<unknown>(
      "get_skill_package_file_association_status",
    );
    if (!isSkillPackageFileAssociationStatus(result)) {
      throw new Error(
        "get_skill_package_file_association_status did not return file association status",
      );
    }
    return result;
  },

  async setSkillPackageFileAssociationDefault(): Promise<SkillPackageFileAssociationApplyResult> {
    const result = await invokeSkillsCommand<unknown>(
      "set_skill_package_file_association_default",
    );
    if (!isSkillPackageFileAssociationApplyResult(result)) {
      throw new Error(
        "set_skill_package_file_association_default did not return file association apply result",
      );
    }
    return result;
  },

  async exportLocalSkillPackage(
    directory: string,
    targetPath: string,
    app: AppType = "lime",
  ): Promise<SkillPackageExportResult> {
    return invokeSkillsCommand<SkillPackageExportResult>(
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
    return invokeSkillsCommand<SkillMarketplaceInstallResult>(
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
    return invokeSkillsCommand<SkillMarketplaceInstallResult>(
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
    const inspection = await invokeSkillsCommand<SkillInspection>(
      "inspect_remote_skill",
      locator,
    );
    return normalizeInspection(inspection);
  },
};
