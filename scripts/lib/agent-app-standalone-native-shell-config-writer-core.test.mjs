import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  writeJsonFile,
  writeStandaloneNativeShellConfigFiles,
} from "./agent-app-standalone-native-shell-config-writer-core.mjs";

function readyPlan(outputRoot) {
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
        kind: "native_shell_config",
        path: path.join(outputRoot, "runtime", "native-shell.config.json"),
        encoding: "utf8",
        content: '{"identifier":"com.limecloud.agentapp.contentfactory"}\n',
        contentHash: "package-fnv1a-config",
        sensitive: false,
      },
      {
        kind: "runtime_env",
        path: path.join(outputRoot, ".env.standalone"),
        encoding: "utf8",
        content: "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n",
        contentHash: "package-fnv1a-env",
        sensitive: false,
      },
    ],
    blockers: [],
  };
}

describe("agent-app standalone native shell config writer core", () => {
  it("旧 standalone artifact config writer 固定为 deprecated blocked", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-"),
    );
    const result = writeStandaloneNativeShellConfigFiles({
      outputRoot,
      plan: readyPlan(outputRoot),
    });

    expect(result).toMatchObject({
      status: "blocked",
      outputRoot,
      filesWritten: [],
      blockers: [
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
      ],
    });
    expect(
      fs.existsSync(path.join(outputRoot, "runtime", "native-shell.config.json")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(outputRoot, ".env.standalone")),
    ).toBe(false);
  });

  it("拒绝写出 output root 外的文件", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-root-"),
    );
    const otherRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-other-"),
    );

    const result = writeStandaloneNativeShellConfigFiles({
      outputRoot,
      plan: readyPlan(otherRoot),
    });

    expect(result).toMatchObject({
      status: "blocked",
      filesWritten: [],
      blockers: [
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
    expect(
      fs.existsSync(path.join(otherRoot, "runtime", "native-shell.config.json")),
    ).toBe(false);
  });

  it("CLI 只输出 deprecated entrypoint 提示", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-cli-"),
    );
    const planPath = path.join(outputRoot, "write-plan.json");
    const evidencePath = path.join(outputRoot, "writer-evidence.json");
    writeJsonFile(planPath, readyPlan(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app/standalone-native-shell-config-writer.mjs"),
        "--plan",
        planPath,
        "--output-root",
        outputRoot,
        "--evidence",
        evidencePath,
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Electron/App Server release pipeline");
    expect(fs.existsSync(evidencePath)).toBe(false);
  });
});
