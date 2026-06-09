import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { skillsApi } from "./skills";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const validInspection = {
  content: "# Article Typesetting",
  metadata: {},
  allowedTools: [],
  resourceSummary: {
    hasScripts: false,
    hasReferences: true,
    hasAssets: false,
  },
  standardCompliance: {
    isStandard: true,
  },
};

describe("skillsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("浏览器 fallback 未返回本地技能数组时应回退为空列表", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(skillsApi.getLocal("lime")).resolves.toEqual([]);
    expect(safeInvoke).toHaveBeenCalledWith("get_local_skills_for_app", {
      app: "lime",
    });
  });

  it("本地技能列表遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "get_local_skills_for_app",
        source: "electron-empty-diagnostic",
        status: "degraded",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(skillsApi.getLocal("lime")).rejects.toThrow(
      "get_local_skills_for_app 尚未接入真实 Skill 管理 current 通道，收到 electron-empty-diagnostic 诊断返回。",
    );
  });

  it("远端技能列表应继续归一化标准检查字段", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        skills: [
          {
            key: "local:writer",
            name: "写作助手",
            description: "测试技能",
            directory: "writer",
            installed: true,
            sourceKind: "other",
            standardCompliance: {
              isStandard: true,
            },
          },
        ],
      },
    });

    await expect(skillsApi.getAll("lime")).resolves.toEqual([
      expect.objectContaining({
        key: "local:writer",
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      }),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledWith("skillManagement/list", {
      app: "lime",
      refreshRemote: false,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "get_skills_for_app",
      expect.anything(),
    );
  });

  it("仓库列表与已安装目录列表应走 App Server current 网关", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({ result: { repos: [] } })
      .mockResolvedValueOnce({ result: { directories: [] } });

    await expect(skillsApi.getRepos()).resolves.toEqual([]);
    await expect(skillsApi.getInstalledLimeSkills()).resolves.toEqual([]);
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "skillRepository/list",
      {},
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "skillInstalledDirectories/list",
      {},
    );
    expect(safeInvoke).not.toHaveBeenCalledWith("get_skill_repos");
    expect(safeInvoke).not.toHaveBeenCalledWith("get_installed_lime_skills");
  });

  it("Skill 管理写链、脚手架、导入与远程检查应走 App Server current 网关", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { inspection: validInspection } })
      .mockResolvedValueOnce({ result: { inspection: validInspection } })
      .mockResolvedValueOnce({
        result: { directory: "article-typesetting-master" },
      })
      .mockResolvedValueOnce({ result: { inspection: validInspection } });

    await expect(
      skillsApi.install("article-typesetting-master"),
    ).resolves.toBe(true);
    await expect(
      skillsApi.uninstall("article-typesetting-master"),
    ).resolves.toBe(true);
    await expect(
      skillsApi.addRepo({
        owner: "anthropics",
        name: "skills",
        branch: "main",
        enabled: true,
      }),
    ).resolves.toBe(true);
    await expect(
      skillsApi.removeRepo("anthropics", "skills"),
    ).resolves.toBe(true);
    await expect(skillsApi.refreshCache()).resolves.toBe(true);
    await expect(
      skillsApi.inspectLocalSkill("article-typesetting-master"),
    ).resolves.toEqual(
      expect.objectContaining({
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      }),
    );
    await expect(
      skillsApi.createSkillScaffold({
        target: "user",
        directory: "article-typesetting-master",
        name: "Article Typesetting",
        description: "Format articles",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      }),
    );
    await expect(
      skillsApi.importLocalSkill("/Users/demo/article-typesetting-master"),
    ).resolves.toEqual({ directory: "article-typesetting-master" });
    await expect(
      skillsApi.inspectRemoteSkill({
        owner: "anthropics",
        name: "skills",
        branch: "main",
        directory: "skills/docx",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      }),
    );

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "skillManagement/install",
      { app: "lime", directory: "article-typesetting-master" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "skillManagement/uninstall",
      { app: "lime", directory: "article-typesetting-master" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      "skillRepository/save",
      {
        repo: {
          owner: "anthropics",
          name: "skills",
          branch: "main",
          enabled: true,
        },
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      4,
      "skillRepository/delete",
      { owner: "anthropics", name: "skills" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      5,
      "skillCache/refresh",
      {},
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      6,
      "skillLocal/inspect",
      { app: "lime", directory: "article-typesetting-master" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      7,
      "skillLocal/scaffold/create",
      {
        app: "lime",
        request: {
          target: "user",
          directory: "article-typesetting-master",
          name: "Article Typesetting",
          description: "Format articles",
        },
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      8,
      "skillLocal/import",
      {
        app: "lime",
        sourcePath: "/Users/demo/article-typesetting-master",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      9,
      "skillRemote/inspect",
      {
        owner: "anthropics",
        name: "skills",
        branch: "main",
        directory: "skills/docx",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_skill_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "inspect_remote_skill",
      expect.anything(),
    );
  });

  it("本地 Skill detail/rename/package inspect/install/replace/export 应统一走 App Server current 网关", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
          files: [{ path: "SKILL.md", isDirectory: false, size: 128 }],
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting",
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
          files: [{ path: "SKILL.md", isDirectory: false, size: 128 }],
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          outputPath: "/Users/demo/article-typesetting-master.skills",
          fileCount: 2,
          bytesWritten: 512,
        },
      });
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(["/Users/demo/article-typesetting-master.skill"])
      .mockResolvedValueOnce({
        platform: "macos",
        extension: "skill",
        mimeType: "application/vnd.lime.skill+zip",
        appIdentifier: "com.limecloud.lime",
        isDefault: false,
        canSetDefault: true,
        requiresUserConfirmation: false,
        currentHandler: "com.anthropic.claude",
        settingsUrl: null,
        detail: null,
      })
      .mockResolvedValueOnce({
        changed: true,
        message: "updated",
        status: {
          platform: "macos",
          extension: "skill",
          mimeType: "application/vnd.lime.skill+zip",
          appIdentifier: "com.limecloud.lime",
          isDefault: true,
          canSetDefault: true,
          requiresUserConfirmation: false,
          currentHandler: "com.limecloud.lime",
          settingsUrl: null,
          detail: null,
        },
      });

    await expect(
      skillsApi.inspectLocalSkillDetail("article-typesetting-master"),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        files: [{ path: "SKILL.md", isDirectory: false, size: 128 }],
      }),
    );
    await expect(
      skillsApi.renameLocalSkill(
        "article-typesetting-master",
        "article-typesetting",
      ),
    ).resolves.toEqual({
      directory: "article-typesetting",
    });
    await expect(
      skillsApi.inspectLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        files: [{ path: "SKILL.md", isDirectory: false, size: 128 }],
        inspection: expect.objectContaining({
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    );
    await expect(
      skillsApi.installLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        inspection: expect.objectContaining({
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    );
    await expect(
      skillsApi.replaceLocalSkillPackage(
        "article-typesetting-master",
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        inspection: expect.objectContaining({
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    );
    await expect(
      skillsApi.takePendingSkillPackageOpenRequests(),
    ).resolves.toEqual(["/Users/demo/article-typesetting-master.skill"]);
    await expect(
      skillsApi.getSkillPackageFileAssociationStatus(),
    ).resolves.toEqual(
      expect.objectContaining({
        isDefault: false,
        currentHandler: "com.anthropic.claude",
      }),
    );
    await expect(
      skillsApi.setSkillPackageFileAssociationDefault(),
    ).resolves.toEqual(
      expect.objectContaining({
        changed: true,
        status: expect.objectContaining({
          isDefault: true,
        }),
      }),
    );
    await expect(
      skillsApi.exportLocalSkillPackage(
        "article-typesetting-master",
        "/Users/demo/article-typesetting-master.skills",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        outputPath: "/Users/demo/article-typesetting-master.skills",
        fileCount: 2,
      }),
    );

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "skillLocal/detail/inspect",
      {
        app: "lime",
        directory: "article-typesetting-master",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "skillLocal/rename",
      {
        app: "lime",
        directory: "article-typesetting-master",
        newDirectory: "article-typesetting",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      "skillPackage/local/inspect",
      {
        app: "lime",
        sourcePath: "/Users/demo/article-typesetting-master.skill",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      4,
      "skillPackage/local/install",
      {
        app: "lime",
        sourcePath: "/Users/demo/article-typesetting-master.skill",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      5,
      "skillPackage/local/replace",
      {
        app: "lime",
        directory: "article-typesetting-master",
        sourcePath: "/Users/demo/article-typesetting-master.skill",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      6,
      "skillPackage/export",
      {
        app: "lime",
        directory: "article-typesetting-master",
        targetPath: "/Users/demo/article-typesetting-master.skills",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "take_pending_skill_package_open_requests",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "get_skill_package_file_association_status",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "set_skill_package_file_association_default",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "inspect_local_skill_package_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_local_skill_package_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "export_local_skill_package_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "inspect_local_skill_detail_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "rename_local_skill_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "replace_local_skill_package_for_app",
      expect.anything(),
    );
  });

  it("官方 marketplace bundle 与下载 URL 安装应统一走 App Server current 网关", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
        },
      })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          inspection: validInspection,
        },
      });

    await expect(
      skillsApi.installMarketplaceBundle({
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
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        inspection: expect.objectContaining({
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    );

    await expect(
      skillsApi.installFromDownloadUrl({
        skillName: "article-typesetting-master",
        downloadUrl: "https://example.com/article-typesetting-master.skill",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        directory: "article-typesetting-master",
        inspection: expect.objectContaining({
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    );

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "skillMarketplace/install",
      {
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
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "skillPackage/download/install",
      {
        app: "lime",
        skillName: "article-typesetting-master",
        downloadUrl: "https://example.com/article-typesetting-master.skill",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_marketplace_skill_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_skill_from_download_url_for_app",
      expect.anything(),
    );
  });

  it("打开本地 Skill 目录应走 skill/list 路径投影和 Electron 文件壳", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          key: "local:article-typesetting-master",
          name: "写作排版",
          description: "测试技能",
          directory: "article-typesetting-master",
          localDirectoryPath:
            "  /Users/demo/.agents/skills/article-typesetting-master  ",
          installed: true,
          sourceKind: "other",
          standardCompliance: {
            isStandard: true,
          },
        },
      ])
      .mockResolvedValueOnce(undefined);

    await expect(
      skillsApi.revealLocalSkill("article-typesetting-master"),
    ).resolves.toBe(true);

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_local_skills_for_app", {
      app: "lime",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "reveal_in_finder", {
      path: "/Users/demo/.agents/skills/article-typesetting-master",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "reveal_local_skill_for_app",
      expect.anything(),
    );
  });

  it("打开本地 Skill 目录缺少 current 本地路径投影时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        key: "local:article-typesetting-master",
        name: "写作排版",
        description: "测试技能",
        directory: "article-typesetting-master",
        installed: true,
        sourceKind: "other",
      },
    ]);

    await expect(
      skillsApi.revealLocalSkill("article-typesetting-master"),
    ).rejects.toThrow(
      "skill/list did not return localDirectoryPath for article-typesetting-master",
    );

    expect(safeInvoke).toHaveBeenCalledTimes(1);
    expect(safeInvoke).toHaveBeenCalledWith("get_local_skills_for_app", {
      app: "lime",
    });
  });

  it("本地 Skill 安装包 App Server current 缺少 result 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        directory: "article-typesetting-master",
      },
    });

    await expect(
      skillsApi.installLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).rejects.toThrow(
      "skillPackage/local/install did not return skill install result",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_local_skill_package_for_app",
      expect.anything(),
    );
  });

  it("Skill 管理布尔写命令遇到 mock-like payload 时应 fail closed", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({ result: { ok: true } })
      .mockResolvedValueOnce({ result: { ok: true } });

    await expect(
      skillsApi.install("article-typesetting-master"),
    ).rejects.toThrow("skillManagement/install did not return success result");
    await expect(skillsApi.refreshCache()).rejects.toThrow(
      "skillCache/refresh did not return success result",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "install_skill_for_app",
      expect.anything(),
    );
  });

  it("Skill inspection 命令缺少核心字段时应 fail closed", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({
        result: {
          inspection: {
            ...validInspection,
            resourceSummary: { hasScripts: false },
          },
        },
      });

    await expect(
      skillsApi.inspectLocalSkill("article-typesetting-master"),
    ).rejects.toThrow(
      "skillLocal/inspect did not return skill inspection result",
    );
    await expect(
      skillsApi.createSkillScaffold({
        target: "user",
        directory: "article-typesetting-master",
        name: "Article Typesetting",
        description: "Format articles",
      }),
    ).rejects.toThrow(
      "skillLocal/scaffold/create did not return skill inspection result",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "inspect_local_skill_for_app",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "create_skill_scaffold_for_app",
      expect.anything(),
    );
  });

  it("本地 Skill package 结构化结果遇到 mock-like payload 时应 fail closed", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({
        result: { directory: "article-typesetting-master" },
      })
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({
        result: {
          directory: "article-typesetting-master",
          outputPath: "/Users/demo/article-typesetting-master.skills",
          fileCount: 2,
        },
      });
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      skillsApi.inspectLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).rejects.toThrow(
      "skillPackage/local/inspect did not return local skill package inspection",
    );
    await expect(
      skillsApi.installLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).rejects.toThrow(
      "skillPackage/local/install did not return skill install result",
    );
    await expect(
      skillsApi.importLocalSkill("/Users/demo/article-typesetting-master"),
    ).rejects.toThrow(
      "skillLocal/import did not return imported skill result",
    );
    await expect(
      skillsApi.exportLocalSkillPackage(
        "article-typesetting-master",
        "/Users/demo/article-typesetting-master.skills",
      ),
    ).rejects.toThrow(
      "skillPackage/export did not return skill package export result",
    );
  });

  it("Skill package 文件关联状态遇到假成功或缺字段时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        platform: "macos",
        extension: "skill",
        mimeType: "application/vnd.lime.skill+zip",
        appIdentifier: "com.limecloud.lime",
        isDefault: false,
        canSetDefault: true,
      });

    await expect(
      skillsApi.getSkillPackageFileAssociationStatus(),
    ).rejects.toThrow(
      "get_skill_package_file_association_status did not return file association status",
    );
    await expect(
      skillsApi.getSkillPackageFileAssociationStatus(),
    ).rejects.toThrow(
      "get_skill_package_file_association_status did not return file association status",
    );
  });

  it("Skill package 文件关联设置结果缺少状态时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      changed: true,
      message: "updated",
    });

    await expect(
      skillsApi.setSkillPackageFileAssociationDefault(),
    ).rejects.toThrow(
      "set_skill_package_file_association_default did not return file association apply result",
    );
  });
});
