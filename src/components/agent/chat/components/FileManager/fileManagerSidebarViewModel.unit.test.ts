import { describe, expect, it } from "vitest";
import type { FileEntry } from "@/lib/api/fileBrowser";
import {
  asPinnedLocation,
  buildContextMenuActionDescriptors,
  isApplicationEntry,
  isSkillPackageEntry,
  resolveContextMenuPosition,
  type FileManagerActionLabels,
} from "./fileManagerSidebarViewModel";

const labels: FileManagerActionLabels = {
  open: "打开",
  reveal: "显示位置",
  addToChat: "加入对话",
  preview: "预览",
  importKnowledge: "设为资料",
  importKnowledgeTitle: "整理为资料",
  copyPath: "复制路径",
  copyName: "复制名称",
  pin: "固定",
  refresh: "刷新",
  installPackage: "安装",
  installPackageTitle: "安装 Skill 包",
};

function fileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name: "brief.txt",
    path: "/Users/demo/brief.txt",
    isDir: false,
    size: 128,
    modifiedAt: 0,
    ...overrides,
  };
}

describe("fileManagerSidebarViewModel", () => {
  it("应解析有效固定位置并拒绝畸形输入", () => {
    expect(
      asPinnedLocation({
        id: "pinned:/repo",
        label: "Repo",
        path: "/repo",
        kind: "pinned",
      }),
    ).toEqual({
      id: "pinned:/repo",
      label: "Repo",
      path: "/repo",
      kind: "pinned",
    });
    expect(asPinnedLocation(null)).toBeNull();
    expect(asPinnedLocation({ id: "bad", label: "Bad" })).toBeNull();
  });

  it("应识别应用入口和 Skill 包入口", () => {
    expect(isApplicationEntry(fileEntry({ name: "Lime.app" }), "")).toBe(
      true,
    );
    expect(isApplicationEntry(fileEntry({ name: "Preview", isDir: false }), "applications"))
      .toBe(true);
    expect(isApplicationEntry(fileEntry({ name: "brief.txt" }), "")).toBe(
      false,
    );
    expect(isSkillPackageEntry(fileEntry({ name: "writer.skill" }))).toBe(
      true,
    );
    expect(isSkillPackageEntry(fileEntry({ name: "bundle.skills" }))).toBe(
      true,
    );
    expect(isSkillPackageEntry(fileEntry({ name: "bundle.skill", isDir: true })))
      .toBe(false);
  });

  it("应把右键菜单限制在侧栏和视口范围内", () => {
    expect(
      resolveContextMenuPosition({
        clientX: 390,
        clientY: 80,
        sidebarRect: {
          left: 20,
          top: 0,
          right: 420,
          bottom: 700,
          width: 400,
        },
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({ x: 204, y: 80 });

    expect(
      resolveContextMenuPosition({
        clientX: 1,
        clientY: 1,
        sidebarRect: null,
        viewportWidth: 320,
        viewportHeight: 240,
      }),
    ).toEqual({ x: 8, y: 8 });
  });

  it("应规划普通文件的预览和资料动作", () => {
    const actions = buildContextMenuActionDescriptors({
      entry: fileEntry(),
      knowledgeImportEnabled: true,
      workspacePreviewEnabled: true,
      skillPackageInstallEnabled: true,
      labels,
    });

    expect(actions.map((item) => item.action)).toEqual([
      "open",
      "reveal",
      "add",
      "preview-workspace",
      "import-knowledge",
      "copy-path",
      "copy-name",
      "pin",
      "refresh",
    ]);
  });

  it("Skill 包应展示安装入口并跳过预览和资料动作", () => {
    const actions = buildContextMenuActionDescriptors({
      entry: fileEntry({ name: "writer.skill" }),
      knowledgeImportEnabled: true,
      workspacePreviewEnabled: true,
      skillPackageInstallEnabled: true,
      labels,
    });

    expect(actions.map((item) => item.action)).toEqual([
      "open",
      "reveal",
      "install-skill-package",
      "copy-path",
      "copy-name",
      "pin",
      "refresh",
    ]);
  });

  it("不支持资料整理的文件应禁用资料动作并显示原因", () => {
    const actions = buildContextMenuActionDescriptors({
      entry: fileEntry({ name: "contract.pdf" }),
      knowledgeImportEnabled: true,
      workspacePreviewEnabled: false,
      skillPackageInstallEnabled: false,
      labels,
      knowledgeUnsupportedMessage: "暂不支持",
    });

    expect(actions.find((item) => item.action === "import-knowledge"))
      .toMatchObject({
        disabled: true,
        title: "暂不支持",
      });
  });
});
