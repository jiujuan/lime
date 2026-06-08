import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { skillsApi } from "./skills";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("skillsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(safeInvoke).mockResolvedValueOnce([
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
    ]);

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
  });

  it("仓库列表与已安装目录列表缺失时也不应抛错", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(null);

    await expect(skillsApi.getRepos()).resolves.toEqual([]);
    await expect(skillsApi.getInstalledLimeSkills()).resolves.toEqual([]);
  });

  it("本地 Skill 安装包命令应统一走 skills API 网关", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        directory: "article-typesetting-master",
        inspection: {
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
        },
        files: [{ path: "SKILL.md", isDirectory: false, size: 128 }],
      })
      .mockResolvedValueOnce({
        directory: "article-typesetting-master",
        inspection: {
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
        },
      })
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
      })
      .mockResolvedValueOnce({
        directory: "article-typesetting-master",
        outputPath: "/Users/demo/article-typesetting-master.skills",
        fileCount: 2,
        bytesWritten: 512,
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

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "inspect_local_skill_package_for_app",
      {
        app: "lime",
        sourcePath: "/Users/demo/article-typesetting-master.skill",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "install_local_skill_package_for_app",
      {
        app: "lime",
        sourcePath: "/Users/demo/article-typesetting-master.skill",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "take_pending_skill_package_open_requests",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      4,
      "get_skill_package_file_association_status",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      5,
      "set_skill_package_file_association_default",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      6,
      "export_local_skill_package_for_app",
      {
        app: "lime",
        directory: "article-typesetting-master",
        targetPath: "/Users/demo/article-typesetting-master.skills",
      },
    );
  });

  it("本地 Skill 安装包命令遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "install_local_skill_package_for_app",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(
      skillsApi.installLocalSkillPackage(
        "/Users/demo/article-typesetting-master.skill",
      ),
    ).rejects.toThrow(
      "install_local_skill_package_for_app 尚未接入真实 Skill 管理 current 通道，收到 electron-host-diagnostic 诊断返回。",
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
