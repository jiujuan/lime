import { describe, expect, it } from "vitest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  buildAgentAppIntentRequestMetadata,
  buildAgentAppIntentSystemPrompt,
  resolveWorkspaceAgentAppIntent,
} from "./workspaceAgentAppIntentRouting";

function createInstalledApp(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
  return {
    appId: "creator-workbench",
    disabled: false,
    manifest: {
      appId: "creator-workbench",
      displayName: "创作工作台",
      manifestVersion: "0.11",
      version: "1.0.0",
      status: "ready",
      appType: "domain-app",
      description: "创作业务应用",
      runtimeTargets: ["local"],
      requires: {
        appRuntime: "0.11",
        capabilities: {},
      },
      runtimePackage: {
        worker: {
          outputArtifactKind: "creator.workspace_patch",
        },
      },
      permissions: [],
      entries: [
        {
          key: "creator",
          kind: "workflow",
          title: "创作工作台",
          requiredCapabilities: [],
          permissions: [],
          enabledByDefault: true,
        },
      ],
      knowledgeTemplates: [],
      artifacts: [],
      policies: [],
      services: [],
      workflows: [],
      skillRefs: [],
      toolRefs: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
      lifecycle: {
        install: [],
        activate: [],
        deactivate: [],
        uninstall: [],
      },
      install: {
        schemaVersion: 1,
        supportedModes: ["runtime_backed"],
        preferredMode: "runtime_backed",
        runtime: {
          standalone: {
            embedRuntime: false,
          },
          runtimeBacked: {
            requires: "lime",
          },
        },
        branding: {
          name: "创作工作台",
          windowTitle: "创作工作台",
        },
        compatibility: {},
      },
      profiles: [],
      agentRuntime: {
        tasks: [{ kind: "creator.generate" }],
        intents: [
          {
            key: "creator_generate",
            mode: "natural_language",
            taskKind: "creator.generate",
            outputArtifactKind: "creator.workspace_patch",
            rightSurface: "productProfile",
            triggerPhrases: {
              "zh-CN": ["创作工作台", "用创作工作台生成"],
              "en-US": ["creator workbench"],
            },
            expectedObjects: ["articleDraft", "imageSet"],
          },
        ],
      },
    },
    ...overrides,
  } as InstalledAgentAppState;
}

describe("workspaceAgentAppIntentRouting", () => {
  it("应从已安装 Agent App manifest intents 匹配自然语言触发", () => {
    const match = resolveWorkspaceAgentAppIntent(
      "帮我用创作工作台生成一篇文章和配图",
      [createInstalledApp()],
    );

    expect(match).toMatchObject({
      appId: "creator-workbench",
      appName: "创作工作台",
      intentKey: "creator_generate",
      taskKind: "creator.generate",
      outputArtifactKind: "creator.workspace_patch",
      rightSurface: "productProfile",
      expectedObjects: ["articleDraft", "imageSet"],
      source: "agent_app_manifest_intent",
    });
  });

  it("禁用的 Agent App 不应命中 intent", () => {
    expect(
      resolveWorkspaceAgentAppIntent("用创作工作台生成文章", [
        createInstalledApp({ disabled: true }),
      ]),
    ).toBeNull();
  });

  it("旧 installed state 没有 intents 时应按已点名 App 的默认 task runtime 命中", () => {
    const app = createInstalledApp();
    app.manifest.agentRuntime = {
      tasks: [{ kind: "creator.generate" }],
      worker: {
        outputArtifactKind: "creator.workspace_patch",
      },
    };
    app.manifest.workbench = {
      profile: "production",
      productWorkspace: {
        primaryObjectKinds: ["articleDraft", "imageSet"],
      },
    };

    const match = resolveWorkspaceAgentAppIntent(
      "帮我用创作工作台生成一篇文章和配图",
      [app],
    );

    expect(match).toMatchObject({
      appId: "creator-workbench",
      intentKey: "default",
      taskKind: "creator.generate",
      outputArtifactKind: "creator.workspace_patch",
      rightSurface: "productProfile",
      expectedObjects: ["articleDraft", "imageSet"],
      source: "agent_app_manifest_default",
    });
  });

  it("应构造通用 harness metadata 和系统提示，阻断 Skill 搜索替代 App", () => {
    const match = resolveWorkspaceAgentAppIntent("creator workbench plan", [
      createInstalledApp(),
    ]);
    expect(match).not.toBeNull();

    const metadata = buildAgentAppIntentRequestMetadata(match!);
    expect(metadata).toMatchObject({
      agent_app_intent: {
        app_id: "creator-workbench",
        intent_key: "creator_generate",
        task_kind: "creator.generate",
        output_artifact_kind: "creator.workspace_patch",
        right_surface: "productProfile",
      },
      right_surface: {
        surface_kind: "productProfile",
        target: "productProfile",
      },
    });
    expect(buildAgentAppIntentSystemPrompt(match!)).toContain("skill_search");
  });

  it("未声明 rightSurface 时不应写入空的 right_surface metadata", () => {
    const metadata = buildAgentAppIntentRequestMetadata({
      appId: "minimal-app",
      appName: "Minimal App",
      intentKey: "default",
      expectedObjects: [],
      matchedPhrase: "Minimal App",
      source: "agent_app_manifest_default",
    });

    expect(metadata).toEqual({
      agent_app_intent: {
        source: "agent_app_manifest_default",
        app_id: "minimal-app",
        app_name: "Minimal App",
        intent_key: "default",
        expected_objects: [],
        matched_phrase: "Minimal App",
      },
    });
  });
});
