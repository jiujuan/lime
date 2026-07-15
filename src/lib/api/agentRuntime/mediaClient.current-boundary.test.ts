import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const MEDIA_TASK_SYMBOLS = [
  "cancelMediaTaskArtifact",
  "completeAudioGenerationTaskArtifact",
  "completeImageGenerationTaskArtifact",
  "createAudioGenerationTaskArtifact",
  "createImageGenerationTaskArtifact",
  "getMediaTaskArtifact",
  "listMediaTaskArtifacts",
];

const PRODUCT_MEDIA_TASK_SOURCES = [
  "src/components/agent/chat/AgentChatWorkspace.tsx",
  "src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.ts",
  "src/components/agent/chat/workspace/useWorkspaceAudioTaskPreviewRuntime.ts",
  "src/components/agent/chat/workspace/useWorkspaceTranscriptionTaskPreviewRuntime.ts",
  "src/lib/layered-design/imageTasks.ts",
];

const PUBLIC_AGENT_RUNTIME_SURFACES = [
  "src/lib/api/agentRuntime/clientFactory.ts",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function importSpecifiersFrom(source: string, modulePath: string): string[] {
  const specifiers: string[] = [];
  const importPattern = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${modulePath.replaceAll("/", "\\/")}["'];`,
    "g",
  );

  for (const match of source.matchAll(importPattern)) {
    specifiers.push(
      ...match[1]
        .split(",")
        .map((specifier) => specifier.trim())
        .filter(Boolean)
        .map((specifier) => specifier.replace(/^type\s+/, "")),
    );
  }

  return specifiers;
}

describe("agentRuntime mediaClient current boundary", () => {
  it("产品代码中的 Media artifact 调用必须从 App Server current 网关进入", () => {
    for (const filePath of PRODUCT_MEDIA_TASK_SOURCES) {
      const source = readRepoFile(filePath);
      const mediaTaskImports = importSpecifiersFrom(
        source,
        "@/lib/api/mediaTasks",
      );
      const agentRuntimeImports = importSpecifiersFrom(
        source,
        "@/lib/api/agentRuntime",
      );

      for (const symbol of MEDIA_TASK_SYMBOLS) {
        if (source.includes(symbol)) {
          expect(
            mediaTaskImports,
            `${filePath} should import ${symbol} from src/lib/api/mediaTasks.ts`,
          ).toContain(symbol);
          expect(
            agentRuntimeImports,
            `${filePath} must not import ${symbol} from retired agentRuntime mediaClient`,
          ).not.toContain(symbol);
        }
      }
    }
  });

  it("agentRuntime mediaClient 已删除且不得恢复", () => {
    expect(
      existsSync(resolve(cwd(), "src/lib/api/agentRuntime/mediaClient.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(cwd(), "src/lib/api/agentRuntime/mediaClient.d.ts")),
    ).toBe(false);
  });

  it("agentRuntime current client factory 不再暴露 retired mediaClient surface", () => {
    for (const filePath of PUBLIC_AGENT_RUNTIME_SURFACES) {
      const source = readRepoFile(filePath);

      expect(source).not.toContain("./mediaClient");

      for (const symbol of MEDIA_TASK_SYMBOLS) {
        expect(
          source,
          `${filePath} must not expose retired ${symbol}`,
        ).not.toContain(symbol);
      }
    }
  });
});
