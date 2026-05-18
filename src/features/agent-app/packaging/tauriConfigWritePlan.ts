import {
  buildAgentAppPackageHash,
  stableStringifyAgentAppValue,
} from "../install/packageIdentity";
import type { AgentAppStandaloneTauriConfigMaterializerResult } from "./tauriConfigMaterializer";

export type AgentAppStandaloneTauriConfigWriteFileKind =
  | "runtime_env"
  | "tauri_config";

export interface AgentAppStandaloneTauriConfigWriteFile {
  kind: AgentAppStandaloneTauriConfigWriteFileKind;
  path: string;
  encoding: "utf8";
  content: string;
  contentHash: string;
  sensitive: false;
}

export type AgentAppStandaloneTauriConfigWriteBlockerCode =
  | "CONFIG_OUTPUT_PATH_MISSING"
  | "ENV_OUTPUT_PATH_MISSING"
  | "RUNTIME_ENV_INVALID"
  | "TAURI_CONFIG_MATERIALIZATION_BLOCKED";

export interface AgentAppStandaloneTauriConfigWriteBlocker {
  code: AgentAppStandaloneTauriConfigWriteBlockerCode;
  message: string;
  details?: unknown;
}

export interface AgentAppStandaloneTauriConfigWritePlanInput {
  materializerResult: AgentAppStandaloneTauriConfigMaterializerResult;
  configOutputPath: string;
  envOutputPath: string;
}

export type AgentAppStandaloneTauriConfigWritePlan =
  | {
      schemaVersion: 1;
      status: "ready";
      readyToWrite: true;
      appId: string;
      entryKey: string;
      deepLinkScheme: string;
      planHash: string;
      files: AgentAppStandaloneTauriConfigWriteFile[];
      blockers: [];
    }
  | {
      schemaVersion: 1;
      status: "blocked";
      readyToWrite: false;
      files: [];
      blockers: AgentAppStandaloneTauriConfigWriteBlocker[];
    };

function fileHash(
  kind: AgentAppStandaloneTauriConfigWriteFileKind,
  path: string,
  content: string,
): string {
  return buildAgentAppPackageHash({
    manifest: { kind, path, content },
    sourceUri: `agent-app-standalone-tauri-config:${kind}`,
  });
}

function buildTauriConfigContent(config: Record<string, unknown>): string {
  return `${stableStringifyAgentAppValue(config)}\n`;
}

function buildRuntimeEnvContent(
  runtimeEnv: Extract<
    AgentAppStandaloneTauriConfigMaterializerResult,
    { status: "ready" }
  >["runtimeEnv"],
): { content?: string; blockers: AgentAppStandaloneTauriConfigWriteBlocker[] } {
  const blockers: AgentAppStandaloneTauriConfigWriteBlocker[] = [];
  const lines = Object.entries(runtimeEnv)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      if (/\r|\n/.test(value)) {
        blockers.push({
          code: "RUNTIME_ENV_INVALID",
          message: "Standalone runtime env values must be single-line strings.",
          details: { key },
        });
      }
      return `${key}=${value}`;
    });

  return {
    content: blockers.length > 0 ? undefined : `${lines.join("\n")}\n`,
    blockers,
  };
}

export function buildStandaloneTauriConfigWritePlan(
  input: AgentAppStandaloneTauriConfigWritePlanInput,
): AgentAppStandaloneTauriConfigWritePlan {
  if (input.materializerResult.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToWrite: false,
      files: [],
      blockers: [
        {
          code: "TAURI_CONFIG_MATERIALIZATION_BLOCKED",
          message:
            "Standalone Tauri config files cannot be planned until config materialization is ready.",
          details: input.materializerResult.blockers,
        },
      ],
    };
  }

  const blockers: AgentAppStandaloneTauriConfigWriteBlocker[] = [];
  const configOutputPath = input.configOutputPath.trim();
  const envOutputPath = input.envOutputPath.trim();
  if (!configOutputPath) {
    blockers.push({
      code: "CONFIG_OUTPUT_PATH_MISSING",
      message:
        "Standalone Tauri config write plan requires a config output path.",
    });
  }
  if (!envOutputPath) {
    blockers.push({
      code: "ENV_OUTPUT_PATH_MISSING",
      message:
        "Standalone Tauri config write plan requires a runtime env output path.",
    });
  }

  const envContent = buildRuntimeEnvContent(
    input.materializerResult.runtimeEnv,
  );
  blockers.push(...envContent.blockers);
  if (blockers.length > 0 || !envContent.content) {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToWrite: false,
      files: [],
      blockers,
    };
  }

  const configContent = buildTauriConfigContent(
    input.materializerResult.config,
  );
  const files: AgentAppStandaloneTauriConfigWriteFile[] = [
    {
      kind: "tauri_config",
      path: configOutputPath,
      encoding: "utf8",
      content: configContent,
      contentHash: fileHash("tauri_config", configOutputPath, configContent),
      sensitive: false,
    },
    {
      kind: "runtime_env",
      path: envOutputPath,
      encoding: "utf8",
      content: envContent.content,
      contentHash: fileHash("runtime_env", envOutputPath, envContent.content),
      sensitive: false,
    },
  ];
  const appId =
    input.materializerResult.runtimeEnv.LIME_AGENT_APP_STANDALONE_APP_ID;
  const entryKey =
    input.materializerResult.runtimeEnv.LIME_AGENT_APP_STANDALONE_ENTRY_KEY;
  const deepLinkScheme =
    input.materializerResult.runtimeEnv
      .LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME;

  return {
    schemaVersion: 1,
    status: "ready",
    readyToWrite: true,
    appId,
    entryKey,
    deepLinkScheme,
    planHash: buildAgentAppPackageHash({
      manifest: {
        appId,
        entryKey,
        deepLinkScheme,
        files: files.map((file) => ({
          kind: file.kind,
          path: file.path,
          contentHash: file.contentHash,
        })),
      },
      sourceUri: `agent-app-standalone-tauri-config-write-plan:${appId}`,
    }),
    files,
    blockers: [],
  };
}
