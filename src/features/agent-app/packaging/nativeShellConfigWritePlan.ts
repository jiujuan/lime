import {
  buildAgentAppPackageHash,
  stableStringifyAgentAppValue,
} from "../install/packageIdentity";
import type { AgentAppStandaloneNativeShellConfigMaterializerResult } from "./nativeShellConfigMaterializer";

export type AgentAppStandaloneNativeShellConfigWriteFileKind =
  | "native_shell_config"
  | "runtime_env";

export interface AgentAppStandaloneNativeShellConfigWriteFile {
  kind: AgentAppStandaloneNativeShellConfigWriteFileKind;
  path: string;
  encoding: "utf8";
  content: string;
  contentHash: string;
  sensitive: false;
}

export type AgentAppStandaloneNativeShellConfigWriteBlockerCode =
  | "CONFIG_OUTPUT_PATH_MISSING"
  | "ENV_OUTPUT_PATH_MISSING"
  | "NATIVE_SHELL_CONFIG_MATERIALIZATION_BLOCKED"
  | "RUNTIME_ENV_INVALID";

export interface AgentAppStandaloneNativeShellConfigWriteBlocker {
  code: AgentAppStandaloneNativeShellConfigWriteBlockerCode;
  message: string;
  details?: unknown;
}

export interface AgentAppStandaloneNativeShellConfigWritePlanInput {
  materializerResult: AgentAppStandaloneNativeShellConfigMaterializerResult;
  configOutputPath: string;
  envOutputPath: string;
}

export type AgentAppStandaloneNativeShellConfigWritePlan =
  | {
      schemaVersion: 1;
      status: "ready";
      readyToWrite: true;
      appId: string;
      entryKey: string;
      deepLinkScheme: string;
      planHash: string;
      files: AgentAppStandaloneNativeShellConfigWriteFile[];
      blockers: [];
    }
  | {
      schemaVersion: 1;
      status: "blocked";
      readyToWrite: false;
      files: [];
      blockers: AgentAppStandaloneNativeShellConfigWriteBlocker[];
    };

function fileHash(
  kind: AgentAppStandaloneNativeShellConfigWriteFileKind,
  path: string,
  content: string,
): string {
  return buildAgentAppPackageHash({
    manifest: { kind, path, content },
    sourceUri: `agent-app-standalone-native-shell-config:${kind}`,
  });
}

function buildNativeShellConfigContent(config: Record<string, unknown>): string {
  return `${stableStringifyAgentAppValue(config)}\n`;
}

function buildRuntimeEnvContent(
  runtimeEnv: Extract<
    AgentAppStandaloneNativeShellConfigMaterializerResult,
    { status: "ready" }
  >["runtimeEnv"],
): {
  content?: string;
  blockers: AgentAppStandaloneNativeShellConfigWriteBlocker[];
} {
  const blockers: AgentAppStandaloneNativeShellConfigWriteBlocker[] = [];
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

export function buildStandaloneNativeShellConfigWritePlan(
  input: AgentAppStandaloneNativeShellConfigWritePlanInput,
): AgentAppStandaloneNativeShellConfigWritePlan {
  if (input.materializerResult.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToWrite: false,
      files: [],
      blockers: [
        {
          code: "NATIVE_SHELL_CONFIG_MATERIALIZATION_BLOCKED",
          message:
            "Standalone native shell config files cannot be planned until config materialization is ready.",
          details: input.materializerResult.blockers,
        },
      ],
    };
  }

  const blockers: AgentAppStandaloneNativeShellConfigWriteBlocker[] = [];
  const configOutputPath = input.configOutputPath.trim();
  const envOutputPath = input.envOutputPath.trim();
  if (!configOutputPath) {
    blockers.push({
      code: "CONFIG_OUTPUT_PATH_MISSING",
      message:
        "Standalone native shell config write plan requires a config output path.",
    });
  }
  if (!envOutputPath) {
    blockers.push({
      code: "ENV_OUTPUT_PATH_MISSING",
      message:
        "Standalone native shell config write plan requires a runtime env output path.",
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

  const configContent = buildNativeShellConfigContent(
    input.materializerResult.config,
  );
  const files: AgentAppStandaloneNativeShellConfigWriteFile[] = [
    {
      kind: "native_shell_config",
      path: configOutputPath,
      encoding: "utf8",
      content: configContent,
      contentHash: fileHash(
        "native_shell_config",
        configOutputPath,
        configContent,
      ),
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
      sourceUri: `agent-app-standalone-native-shell-config-write-plan:${appId}`,
    }),
    files,
    blockers: [],
  };
}
