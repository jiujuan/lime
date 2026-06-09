import assert from "node:assert/strict";
import { test } from "vitest";
import {
  AppServerClient,
  METHOD_SKILL_CACHE_REFRESH,
  METHOD_SKILL_INSTALLED_DIRECTORIES_LIST,
  METHOD_SKILL_LOCAL_IMPORT,
  METHOD_SKILL_LOCAL_INSPECT,
  METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL,
  METHOD_SKILL_LOCAL_DETAIL_INSPECT,
  METHOD_SKILL_LOCAL_RENAME,
  METHOD_SKILL_LOCAL_SCAFFOLD_CREATE,
  METHOD_SKILL_MANAGEMENT_INSTALL,
  METHOD_SKILL_MANAGEMENT_LIST,
  METHOD_SKILL_MANAGEMENT_UNINSTALL,
  METHOD_SKILL_MARKETPLACE_INSTALL,
  METHOD_SKILL_PACKAGE_EXPORT,
  METHOD_SKILL_PACKAGE_LOCAL_INSPECT,
  METHOD_SKILL_PACKAGE_LOCAL_INSTALL,
  METHOD_SKILL_PACKAGE_LOCAL_REPLACE,
  METHOD_SKILL_REMOTE_INSPECT,
  METHOD_SKILL_REPOSITORY_DELETE,
  METHOD_SKILL_REPOSITORY_LIST,
  METHOD_SKILL_REPOSITORY_SAVE,
} from "../dist/index.js";

test("builds skill management requests with current methods", () => {
  const client = new AppServerClient();

  const list = client.listManagementSkills({
    app: "lime",
    refreshRemote: true,
  });
  const install = client.installManagementSkill({
    app: "lime",
    directory: "article-typesetting-master",
  });
  const uninstall = client.uninstallManagementSkill({
    app: "lime",
    directory: "article-typesetting-master",
  });
  const repos = client.listSkillRepositories();
  const saveRepo = client.saveSkillRepository({
    repo: {
      owner: "anthropics",
      name: "skills",
      branch: "main",
      enabled: true,
    },
  });
  const deleteRepo = client.deleteSkillRepository({
    owner: "anthropics",
    name: "skills",
  });
  const refresh = client.refreshSkillCache();
  const installed = client.listInstalledSkillDirectories();
  const inspectLocal = client.inspectLocalSkill({
    app: "lime",
    directory: "article-typesetting-master",
  });
  const scaffold = client.createSkillScaffold({
    app: "lime",
    request: {
      target: "user",
      directory: "article-typesetting-master",
      name: "Article Typesetting",
      description: "Format articles",
    },
  });
  const imported = client.importLocalSkill({
    app: "lime",
    sourcePath: "/Users/demo/article-typesetting-master",
  });
  const remote = client.inspectRemoteSkill({
    owner: "anthropics",
    name: "skills",
    branch: "main",
    directory: "skills/docx",
  });

  assert.equal(list.id, 1);
  assert.equal(list.method, METHOD_SKILL_MANAGEMENT_LIST);
  assert.deepEqual(list.params, { app: "lime", refreshRemote: true });
  assert.equal(install.id, 2);
  assert.equal(install.method, METHOD_SKILL_MANAGEMENT_INSTALL);
  assert.equal(uninstall.id, 3);
  assert.equal(uninstall.method, METHOD_SKILL_MANAGEMENT_UNINSTALL);
  assert.equal(repos.id, 4);
  assert.equal(repos.method, METHOD_SKILL_REPOSITORY_LIST);
  assert.equal(saveRepo.id, 5);
  assert.equal(saveRepo.method, METHOD_SKILL_REPOSITORY_SAVE);
  assert.equal(deleteRepo.id, 6);
  assert.equal(deleteRepo.method, METHOD_SKILL_REPOSITORY_DELETE);
  assert.equal(refresh.id, 7);
  assert.equal(refresh.method, METHOD_SKILL_CACHE_REFRESH);
  assert.equal(installed.id, 8);
  assert.equal(installed.method, METHOD_SKILL_INSTALLED_DIRECTORIES_LIST);
  assert.equal(inspectLocal.id, 9);
  assert.equal(inspectLocal.method, METHOD_SKILL_LOCAL_INSPECT);
  assert.equal(scaffold.id, 10);
  assert.equal(scaffold.method, METHOD_SKILL_LOCAL_SCAFFOLD_CREATE);
  assert.equal(imported.id, 11);
  assert.equal(imported.method, METHOD_SKILL_LOCAL_IMPORT);
  assert.equal(remote.id, 12);
  assert.equal(remote.method, METHOD_SKILL_REMOTE_INSPECT);
});

test("builds local skill detail and package requests with current methods", () => {
  const client = new AppServerClient();

  const detail = client.inspectLocalSkillDetail({
    app: "lime",
    directory: "article-typesetting-master",
  });
  const rename = client.renameLocalSkill({
    app: "lime",
    directory: "article-typesetting-master",
    newDirectory: "article-typesetting",
  });
  const inspect = client.inspectLocalSkillPackage({
    app: "lime",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });
  const install = client.installLocalSkillPackage({
    app: "lime",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });
  const exported = client.exportSkillPackage({
    app: "lime",
    directory: "article-typesetting-master",
    targetPath: "/Users/demo/article-typesetting-master.skills",
  });
  const replace = client.replaceLocalSkillPackage({
    app: "lime",
    directory: "article-typesetting-master",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });
  const marketplace = client.installMarketplaceSkill({
    app: "lime",
    manifestVersion: "agentskills.v1",
    name: "article-typesetting-master",
    aliases: ["article-typesetting"],
    version: "1.0.0",
    contentHash: "sha256-demo",
    fileCount: 1,
    files: [
      {
        path: "SKILL.md",
        content: "# Article Typesetting",
        sha256:
          "ea853736ae4bbce7ed060c41a1642b1fa722893b06c2930418ee9a0c6fa4cff7",
      },
    ],
  });
  const download = client.installSkillFromDownload({
    app: "lime",
    skillName: "article-typesetting-master",
    downloadUrl: "https://example.com/article-typesetting-master.skill",
  });

  assert.equal(detail.id, 1);
  assert.equal(detail.method, METHOD_SKILL_LOCAL_DETAIL_INSPECT);
  assert.deepEqual(detail.params, {
    app: "lime",
    directory: "article-typesetting-master",
  });

  assert.equal(rename.id, 2);
  assert.equal(rename.method, METHOD_SKILL_LOCAL_RENAME);
  assert.deepEqual(rename.params, {
    app: "lime",
    directory: "article-typesetting-master",
    newDirectory: "article-typesetting",
  });

  assert.equal(inspect.id, 3);
  assert.equal(inspect.method, METHOD_SKILL_PACKAGE_LOCAL_INSPECT);
  assert.deepEqual(inspect.params, {
    app: "lime",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });

  assert.equal(install.id, 4);
  assert.equal(install.method, METHOD_SKILL_PACKAGE_LOCAL_INSTALL);
  assert.deepEqual(install.params, {
    app: "lime",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });

  assert.equal(exported.id, 5);
  assert.equal(exported.method, METHOD_SKILL_PACKAGE_EXPORT);
  assert.deepEqual(exported.params, {
    app: "lime",
    directory: "article-typesetting-master",
    targetPath: "/Users/demo/article-typesetting-master.skills",
  });

  assert.equal(replace.id, 6);
  assert.equal(replace.method, METHOD_SKILL_PACKAGE_LOCAL_REPLACE);
  assert.deepEqual(replace.params, {
    app: "lime",
    directory: "article-typesetting-master",
    sourcePath: "/Users/demo/article-typesetting-master.skill",
  });

  assert.equal(marketplace.id, 7);
  assert.equal(marketplace.method, METHOD_SKILL_MARKETPLACE_INSTALL);
  assert.deepEqual(marketplace.params, {
    app: "lime",
    manifestVersion: "agentskills.v1",
    name: "article-typesetting-master",
    aliases: ["article-typesetting"],
    version: "1.0.0",
    contentHash: "sha256-demo",
    fileCount: 1,
    files: [
      {
        path: "SKILL.md",
        content: "# Article Typesetting",
        sha256:
          "ea853736ae4bbce7ed060c41a1642b1fa722893b06c2930418ee9a0c6fa4cff7",
      },
    ],
  });

  assert.equal(download.id, 8);
  assert.equal(download.method, METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL);
  assert.deepEqual(download.params, {
    app: "lime",
    skillName: "article-typesetting-master",
    downloadUrl: "https://example.com/article-typesetting-master.skill",
  });
});
