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
  create_skill_scaffold_for_app: () => buildMockSkillInspection(),
  inspect_remote_skill: () => buildMockSkillInspection({ hasReferences: true }),
  install_skill_for_app: () => ({ success: true }),
  uninstall_skill_for_app: () => ({ success: true }),
  import_local_skill_for_app: () => ({ directory: "mock-skill" }),
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
