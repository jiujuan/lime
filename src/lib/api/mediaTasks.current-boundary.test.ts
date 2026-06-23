import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { readAppServerApiSources } from "../../test/appServerApiSources";

const RETIRED_MEDIA_TASK_FACADE_COMMANDS = [
  "create_image_generation_task_artifact",
  "create_audio_generation_task_artifact",
  "complete_audio_generation_task_artifact",
  "get_media_task_artifact",
  "list_media_task_artifacts",
  "cancel_media_task_artifact",
  "create_video_generation_task",
  "get_video_generation_task",
  "list_video_generation_tasks",
  "cancel_video_generation_task",
];

const CURRENT_MEDIA_TASK_METHOD_CONSTANTS = [
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST",
  "APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL",
];

const CURRENT_MEDIA_TASK_CLIENT_HELPERS = [
  "createImageMediaTaskArtifact",
  "createAudioMediaTaskArtifact",
  "createVideoMediaTaskArtifact",
  "completeAudioMediaTaskArtifact",
  "getMediaTaskArtifact",
  "listMediaTaskArtifacts",
  "cancelMediaTaskArtifact",
];

const CURRENT_MEDIA_TASK_METHODS = [
  "mediaTaskArtifact/image/create",
  "mediaTaskArtifact/audio/create",
  "mediaTaskArtifact/video/create",
  "mediaTaskArtifact/audio/complete",
  "mediaTaskArtifact/get",
  "mediaTaskArtifact/list",
  "mediaTaskArtifact/cancel",
];

const RETIRED_MEDIA_TASK_FILES = [
  "lime-rs/src/app/runner.rs",
  "lime-rs/src/dev_bridge/dispatcher.rs",
  "lime-rs/src/commands/mod.rs",
  "lime-rs/src/commands/media_task_cmd.rs",
  "lime-rs/src/commands/aster_agent_cmd/tool_runtime/creation_tools.rs",
  "lime-rs/src/dev_bridge/dispatcher/media_tasks.rs",
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

function readAgentCommandCatalog(): Record<string, unknown> {
  return JSON.parse(
    readRepoFile("src/lib/governance/agentCommandCatalog.json"),
  );
}

function expectCatalogSurfaceAbsent(
  catalog: Record<string, unknown>,
  surface: string,
): void {
  const value = catalog[surface];
  expect(Array.isArray(value), `${surface} should be an array`).toBe(true);
  for (const command of RETIRED_MEDIA_TASK_FACADE_COMMANDS) {
    expect(value).not.toContain(command);
  }
}

describe("mediaTasks current App Server boundary", () => {
  it("mediaTasks API 应固定走 App Server current helper", () => {
    const source = readRepoFile("src/lib/api/mediaTasks.ts");

    expect(source).toContain("createAppServerClient");
    for (const methodConstant of CURRENT_MEDIA_TASK_METHOD_CONSTANTS) {
      expect(source).toContain(methodConstant);
    }
    for (const helper of CURRENT_MEDIA_TASK_CLIENT_HELPERS) {
      expect(source).toContain(`.${helper}(`);
    }
    expectStringLiteralsAbsent(source, RETIRED_MEDIA_TASK_FACADE_COMMANDS);
    expect(source).not.toContain("safeInvoke(");
    expect(source).not.toContain("bridgeInvoke(");
    expect(source).not.toContain("createMediaClient(");
  });

  it("App Server protocol / client 应记录 mediaTaskArtifact current 方法", () => {
    const appServerSource = readAppServerApiSources();
    const clientProtocolSource = readRepoFile(
      "packages/app-server-client/src/protocol.ts",
    );
    const rustProtocolSource = [
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/media.rs",
      ),
    ].join("\n");

    for (const methodConstant of CURRENT_MEDIA_TASK_METHOD_CONSTANTS) {
      expect(appServerSource).toContain(methodConstant);
    }
    for (const helper of CURRENT_MEDIA_TASK_CLIENT_HELPERS) {
      expect(appServerSource).toContain(`${helper}(`);
    }
    for (const method of CURRENT_MEDIA_TASK_METHODS) {
      expect(clientProtocolSource).toContain(`"${method}"`);
      expect(rustProtocolSource).toContain(`"${method}"`);
    }
  });

  it("旧 Media task artifact facade 不应回到治理 surface、DevBridge 或 legacy Rust", () => {
    const catalog = readAgentCommandCatalog();
    const restrictedProductionSources = [
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      ...RETIRED_MEDIA_TASK_FILES.map(readOptionalRepoFile),
    ].join("\n");

    expectCatalogSurfaceAbsent(catalog, "runtimeGatewayCommands");
    expectCatalogSurfaceAbsent(catalog, "capabilityDraftCommands");
    expectStringLiteralsAbsent(
      restrictedProductionSources,
      RETIRED_MEDIA_TASK_FACADE_COMMANDS,
    );
    expect(restrictedProductionSources).not.toContain("media_task_cmd");
    for (const retiredPath of RETIRED_MEDIA_TASK_FILES) {
      expect(existsSync(resolve(cwd(), retiredPath))).toBe(false);
    }
  });
});
