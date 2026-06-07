function buildMockSkillInspection(
  options: { content?: string; hasReferences?: boolean } = {},
) {
  return {
    content: options.content ?? "# Mock Skill",
    metadata: {},
    allowedTools: [],
    resourceSummary: {
      hasScripts: false,
      hasReferences: options.hasReferences ?? false,
      hasAssets: false,
    },
    standardCompliance: {
      isStandard: true,
      validationErrors: [],
      deprecatedFields: [],
    },
  };
}

function stripSkillPackageExtension(value: string): string {
  return value.replace(/\.(?:skill|skills)$/i, "");
}

export const skillManagementMocks: Record<string, (args?: any) => any> = {
  get_all_skills: () => [],
  get_skills_for_app: () => [],
  get_local_skills_for_app: () => [],
  get_skill_repos: () => [],
  add_skill_repo: () => ({ success: true }),
  remove_skill_repo: () => ({ success: true }),
  get_installed_lime_skills: () => [],
  refresh_skill_cache: () => true,
  inspect_local_skill_for_app: () => buildMockSkillInspection(),
  inspect_local_skill_detail_for_app: (args: any) => {
    const directory = args?.directory || "mock-skill";
    const content = `# Mock Skill\n\nDetail for ${directory}`;
    return {
      directory,
      inspection: buildMockSkillInspection({
        content,
        hasReferences: true,
      }),
      files: [
        {
          path: "SKILL.md",
          isDirectory: false,
          size: content.length,
          content,
        },
        { path: "references", isDirectory: true, size: 0 },
        {
          path: "references/guide.md",
          isDirectory: false,
          size: 21,
          content: "# Mock Reference Guide",
        },
      ],
    };
  },
  reveal_local_skill_for_app: () => true,
  rename_local_skill_for_app: (args: any) => ({
    directory: args?.newDirectory || args?.new_directory || "renamed-skill",
  }),
  replace_local_skill_package_for_app: (args: any) => ({
    directory: args?.directory || "mock-local-package-skill",
    inspection: buildMockSkillInspection({
      content: "# Mock Replaced Local Skill Package",
      hasReferences: true,
    }),
  }),
  create_skill_scaffold_for_app: () => buildMockSkillInspection(),
  inspect_remote_skill: () => buildMockSkillInspection({ hasReferences: true }),
  install_skill_for_app: () => ({ success: true }),
  uninstall_skill_for_app: () => ({ success: true }),
  import_local_skill_for_app: () => ({ directory: "mock-skill" }),
  inspect_local_skill_package_for_app: (args: any) => ({
    directory: args?.sourcePath
      ? stripSkillPackageExtension(args.sourcePath.split(/[\\/]/).pop() ?? "")
      : args?.source_path
        ? stripSkillPackageExtension(
            args.source_path.split(/[\\/]/).pop() ?? "",
          )
        : "mock-local-package-skill",
    inspection: buildMockSkillInspection({
      content: "# Mock Local Skill Package",
      hasReferences: true,
    }),
    files: [
      {
        path: "SKILL.md",
        isDirectory: false,
        size: 32,
        content: "# Mock Local Skill Package",
      },
      { path: "references", isDirectory: true, size: 0 },
      {
        path: "references/guide.md",
        isDirectory: false,
        size: 16,
        content: "# Guide",
      },
    ],
  }),
  install_local_skill_package_for_app: (args: any) => ({
    directory:
      args?.skillName ||
      args?.skill_name ||
      (args?.sourcePath
        ? stripSkillPackageExtension(args.sourcePath.split(/[\\/]/).pop() ?? "")
        : undefined) ||
      (args?.source_path
        ? stripSkillPackageExtension(
            args.source_path.split(/[\\/]/).pop() ?? "",
          )
        : undefined) ||
      "mock-local-package-skill",
    inspection: buildMockSkillInspection({
      content: "# Mock Installed Local Skill Package",
      hasReferences: true,
    }),
  }),
  export_local_skill_package_for_app: (args: any) => ({
    directory: args?.directory || "mock-local-package-skill",
    outputPath:
      args?.targetPath || args?.target_path || "/mock/path/to/skill.skills",
    fileCount: 2,
    bytesWritten: 512,
  }),
  take_pending_skill_package_open_requests: () => [],
  get_skill_package_file_association_status: () => ({
    platform: "mock",
    extension: "skill",
    extensions: ["skill", "skills"],
    mimeType: "application/vnd.lime.skill+zip",
    appIdentifier: "com.limecloud.lime",
    isDefault: false,
    canSetDefault: true,
    requiresUserConfirmation: false,
    currentHandler: "mock.other",
    settingsUrl: null,
    detail: null,
  }),
  set_skill_package_file_association_default: () => ({
    changed: true,
    message: "Mock .skill association updated",
    status: {
      platform: "mock",
      extension: "skill",
      extensions: ["skill", "skills"],
      mimeType: "application/vnd.lime.skill+zip",
      appIdentifier: "com.limecloud.lime",
      isDefault: true,
      canSetDefault: true,
      requiresUserConfirmation: false,
      currentHandler: "com.limecloud.lime",
      settingsUrl: null,
      detail: null,
    },
  }),
  install_marketplace_skill_for_app: (args: any) => ({
    directory: args?.bundle?.name || "mock-marketplace-skill",
    inspection: buildMockSkillInspection({
      content: "# Mock Marketplace Skill",
    }),
  }),
  install_skill_from_download_url_for_app: (args: any) => ({
    directory: args?.request?.skillName || "mock-downloaded-skill",
    inspection: buildMockSkillInspection({
      content: "# Mock Downloaded Skill",
    }),
  }),
  enable_skill: () => ({ success: true }),
  disable_skill: () => ({ success: true }),
};
