import { describe, expect, it } from "vitest";
import {
  executeStandaloneTauriConfigWritePlan,
  type AgentAppStandaloneTauriConfigFileSystemPort,
  type AgentAppStandaloneTauriConfigWritePlan,
} from "./index";

function buildReadyPlan(outputRoot = "/tmp/lime-agent-apps/content-factory") {
  return {
    schemaVersion: 1,
    status: "ready",
    readyToWrite: true,
    appId: "content-factory-app",
    entryKey: "dashboard",
    deepLinkScheme: "lime-agent-content-factory-app",
    planHash: "package-fnv1a-plan",
    files: [
      {
        kind: "tauri_config",
        path: `${outputRoot}/src-tauri/tauri.conf.json`,
        encoding: "utf8",
        content: '{"identifier":"com.limecloud.agentapp.contentfactory"}\n',
        contentHash: "package-fnv1a-config",
        sensitive: false,
      },
      {
        kind: "runtime_env",
        path: `${outputRoot}/.env.standalone`,
        encoding: "utf8",
        content: "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n",
        contentHash: "package-fnv1a-env",
        sensitive: false,
      },
    ],
    blockers: [],
  } satisfies AgentAppStandaloneTauriConfigWritePlan;
}

function buildMemoryFileSystem(failOnWritePath?: string) {
  const directories: string[] = [];
  const files = new Map<string, string>();
  const port: AgentAppStandaloneTauriConfigFileSystemPort = {
    async ensureDirectory(directoryPath) {
      directories.push(directoryPath);
    },
    async writeTextFile(filePath, content) {
      if (filePath === failOnWritePath) {
        throw new Error("disk full");
      }
      files.set(filePath, content);
    },
  };
  return { directories, files, port };
}

describe("Agent App standalone Tauri config writer", () => {
  it("应只在 output root 内写入 config/env 文件并返回非敏感 evidence", async () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const plan = buildReadyPlan(outputRoot);
    const memory = buildMemoryFileSystem();

    const result = await executeStandaloneTauriConfigWritePlan({
      outputRoot,
      plan,
      fileSystem: memory.port,
    });

    expect(result).toEqual({
      schemaVersion: 1,
      status: "written",
      outputRoot,
      planHash: "package-fnv1a-plan",
      filesWritten: [
        {
          kind: "tauri_config",
          path: `${outputRoot}/src-tauri/tauri.conf.json`,
          contentHash: "package-fnv1a-config",
        },
        {
          kind: "runtime_env",
          path: `${outputRoot}/.env.standalone`,
          contentHash: "package-fnv1a-env",
        },
      ],
      blockers: [],
    });
    expect(memory.directories).toEqual([`${outputRoot}/src-tauri`, outputRoot]);
    expect(memory.files.get(`${outputRoot}/src-tauri/tauri.conf.json`)).toBe(
      '{"identifier":"com.limecloud.agentapp.contentfactory"}\n',
    );
    expect(memory.files.get(`${outputRoot}/.env.standalone`)).toBe(
      "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n",
    );
  });

  it("应拒绝写出 output root 外的文件", async () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const plan = buildReadyPlan("/tmp/lime-agent-apps/other-app");
    const memory = buildMemoryFileSystem();

    const result = await executeStandaloneTauriConfigWritePlan({
      outputRoot,
      plan,
      fileSystem: memory.port,
    });

    expect(result).toMatchObject({
      status: "blocked",
      filesWritten: [],
      blockers: [
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
    expect(memory.directories).toEqual([]);
    expect(memory.files.size).toBe(0);
  });

  it("应拒绝 blocked write plan", async () => {
    const memory = buildMemoryFileSystem();
    const plan: AgentAppStandaloneTauriConfigWritePlan = {
      schemaVersion: 1,
      status: "blocked",
      readyToWrite: false,
      files: [],
      blockers: [
        {
          code: "CONFIG_OUTPUT_PATH_MISSING",
          message: "missing config path",
        },
      ],
    };

    const result = await executeStandaloneTauriConfigWritePlan({
      outputRoot: "/tmp/lime-agent-apps/content-factory",
      plan,
      fileSystem: memory.port,
    });

    expect(result).toMatchObject({
      status: "blocked",
      filesWritten: [],
      blockers: [expect.objectContaining({ code: "WRITE_PLAN_NOT_READY" })],
    });
    expect(memory.files.size).toBe(0);
  });

  it("写入失败时应返回已写文件和失败原因", async () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const plan = buildReadyPlan(outputRoot);
    const memory = buildMemoryFileSystem(`${outputRoot}/.env.standalone`);

    const result = await executeStandaloneTauriConfigWritePlan({
      outputRoot,
      plan,
      fileSystem: memory.port,
    });

    expect(result).toMatchObject({
      status: "failed",
      outputRoot,
      planHash: "package-fnv1a-plan",
      filesWritten: [
        {
          kind: "tauri_config",
          path: `${outputRoot}/src-tauri/tauri.conf.json`,
          contentHash: "package-fnv1a-config",
        },
      ],
      failure: {
        code: "FILE_WRITE_FAILED",
        details: {
          path: `${outputRoot}/.env.standalone`,
          error: "disk full",
        },
      },
    });
  });
});
