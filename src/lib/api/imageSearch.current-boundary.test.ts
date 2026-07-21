import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const RETIRED_IMAGE_SEARCH_COMMANDS = [
  "search_pixabay_images",
  "search_web_images",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

describe("image search current boundary", () => {
  it("前端 imageSearch 空壳不得恢复", () => {
    expect(existsSync(resolve(cwd(), "src/lib/api/imageSearch.ts"))).toBe(
      false,
    );
  });

  it("旧图片搜索命令不应回到 Electron Host、DevBridge、mock 或 legacy Rust 注册", () => {
    const restrictedSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readRepoFile("src/lib/desktop-host/core.ts"),
      readOptionalRepoFile("lime-rs/src/app/runner.rs"),
      readOptionalRepoFile("lime-rs/src/commands/mod.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher.rs"),
    ].join("\n");

    expectStringLiteralsAbsent(
      restrictedSources,
      RETIRED_IMAGE_SEARCH_COMMANDS,
    );
    expect(restrictedSources).not.toContain("commands::image_search_cmd::");
    expect(restrictedSources).not.toContain("pub mod image_search_cmd;");
    expect(existsSync(resolve(cwd(), "lime-rs/src/app/runner.rs"))).toBe(
      false,
    );
    expect(existsSync(resolve(cwd(), "lime-rs/src/commands/mod.rs"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/dev_bridge/dispatcher.rs")),
    ).toBe(false);
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/commands/image_search_cmd.rs")),
    ).toBe(false);
  });

  it("文档画布不应重新接回缺失 current owner 的自动联网配图入口", () => {
    const documentCanvasSource = readRepoFile(
      "src/components/workspace/document/DocumentCanvas.tsx",
    );
    const documentToolbarSource = readRepoFile(
      "src/components/workspace/document/DocumentToolbar.tsx",
    );
    const canvasFactorySource = readRepoFile(
      "src/components/workspace/canvas/CanvasFactory.tsx",
    );
    const sceneRuntimeSource = readRepoFile(
      "src/components/agent/chat/workspace/useWorkspaceCanvasSceneRuntime.tsx",
    );
    const guiSources = [
      documentCanvasSource,
      documentToolbarSource,
      canvasFactorySource,
      sceneRuntimeSource,
    ].join("\n");

    expect(documentCanvasSource).not.toContain("@/lib/api/imageSearch");
    expect(documentCanvasSource).not.toContain("searchWebImages");
    expect(documentCanvasSource).not.toContain("searchPixabayImages");
    expect(guiSources).not.toContain("onAutoInsertImages");
    expect(guiSources).not.toContain("autoImageTopic");
    expect(guiSources).not.toContain("自动配图");
  });
});
