import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  writeJsonFile,
  writeStandaloneTauriConfigFiles,
} from "./agent-app-standalone-tauri-config-writer-core.mjs";

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
        kind: "tauri_config",
        path: path.join(outputRoot, "src-tauri", "tauri.conf.json"),
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

describe("agent-app standalone tauri config writer core", () => {
  it("真实 Node filesystem port 能写入受控 output root", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-"),
    );
    const result = writeStandaloneTauriConfigFiles({
      outputRoot,
      plan: readyPlan(outputRoot),
    });

    expect(result).toMatchObject({
      status: "written",
      outputRoot,
      planHash: "package-fnv1a-plan",
      filesWritten: [
        expect.objectContaining({ kind: "tauri_config" }),
        expect.objectContaining({ kind: "runtime_env" }),
      ],
    });
    expect(
      fs.readFileSync(
        path.join(outputRoot, "src-tauri", "tauri.conf.json"),
        "utf8",
      ),
    ).toBe('{"identifier":"com.limecloud.agentapp.contentfactory"}\n');
    expect(
      fs.readFileSync(path.join(outputRoot, ".env.standalone"), "utf8"),
    ).toBe("LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n");
  });

  it("拒绝写出 output root 外的文件", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-root-"),
    );
    const otherRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-other-"),
    );

    const result = writeStandaloneTauriConfigFiles({
      outputRoot,
      plan: readyPlan(otherRoot),
    });

    expect(result).toMatchObject({
      status: "blocked",
      filesWritten: [],
      blockers: [
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "FILE_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
    expect(
      fs.existsSync(path.join(otherRoot, "src-tauri", "tauri.conf.json")),
    ).toBe(false);
  });

  it("CLI 能写出 evidence 并在 --check 下要求写入成功", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-config-writer-cli-"),
    );
    const planPath = path.join(outputRoot, "write-plan.json");
    const evidencePath = path.join(outputRoot, "writer-evidence.json");
    writeJsonFile(planPath, readyPlan(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-tauri-config-writer.mjs"),
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

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(evidencePath, "utf8"))).toMatchObject({
      status: "written",
      planHash: "package-fnv1a-plan",
    });
  });
});
