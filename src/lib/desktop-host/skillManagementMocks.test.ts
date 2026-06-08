import { describe, expect, it } from "vitest";

import { skillManagementMocks } from "./skillManagementMocks";

describe("skillManagementMocks", () => {
  it("Skill 管理 / package / marketplace 不再注册 desktop-host 默认 mock", () => {
    const removedSkillManagementMockCommands = [
      "get_skills_for_app",
      "get_local_skills_for_app",
      "get_skill_repos",
      "add_skill_repo",
      "remove_skill_repo",
      "get_installed_lime_skills",
      "refresh_skill_cache",
      "inspect_local_skill_for_app",
      "inspect_local_skill_detail_for_app",
      "reveal_local_skill_for_app",
      "rename_local_skill_for_app",
      "replace_local_skill_package_for_app",
      "create_skill_scaffold_for_app",
      "inspect_remote_skill",
      "install_skill_for_app",
      "uninstall_skill_for_app",
      "import_local_skill_for_app",
      "inspect_local_skill_package_for_app",
      "install_local_skill_package_for_app",
      "export_local_skill_package_for_app",
      "take_pending_skill_package_open_requests",
      "get_skill_package_file_association_status",
      "set_skill_package_file_association_default",
      "install_marketplace_skill_for_app",
      "install_skill_from_download_url_for_app",
    ];

    expect(skillManagementMocks).toEqual({});

    for (const command of removedSkillManagementMockCommands) {
      expect(skillManagementMocks).not.toHaveProperty(command);
    }
  });
});
