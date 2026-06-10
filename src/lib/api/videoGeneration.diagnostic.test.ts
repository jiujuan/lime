import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const RETIRED_VIDEO_GENERATION_COMMANDS = [
  "create_video_generation_task",
  "get_video_generation_task",
  "list_video_generation_tasks",
  "cancel_video_generation_task",
];

const RETIRED_VIDEO_GENERATION_FILES = [
  "lime-rs/src/app/runner.rs",
  "lime-rs/src/dev_bridge/dispatcher.rs",
  "lime-rs/src/commands/mod.rs",
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

describe("videoGeneration current boundary", () => {
  it("videoGeneration API 应走 App Server mediaTaskArtifact current helper", () => {
    const source = readRepoFile("src/lib/api/videoGeneration.ts");

    expect(source).toContain("createVideoGenerationTaskArtifact");
    expect(source).toContain("getMediaTaskArtifact");
    expect(source).toContain("listMediaTaskArtifacts");
    expect(source).toContain("cancelMediaTaskArtifact");
    expect(source).toContain("video_generation");
    expect(source).toContain("video_generation_model");
    expectStringLiteralsAbsent(source, RETIRED_VIDEO_GENERATION_COMMANDS);
    expect(source).not.toContain("safeInvoke(");
    expect(source).not.toContain("bridgeInvoke(");
  });

  it("旧视频 native 命令不得回到生产命令 surface", () => {
    const restrictedProductionSources = [
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      ...RETIRED_VIDEO_GENERATION_FILES.map(readOptionalRepoFile),
    ].join("\n");

    expectStringLiteralsAbsent(
      restrictedProductionSources,
      RETIRED_VIDEO_GENERATION_COMMANDS,
    );
    expect(restrictedProductionSources).not.toContain("video_generation_cmd");
    for (const retiredPath of RETIRED_VIDEO_GENERATION_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });
});
