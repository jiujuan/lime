import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildConnectorProductionPreflight,
  writeJsonFile,
} from "./agent-app-connector-production-preflight-core.mjs";

describe("agent app connector production preflight", () => {
  it("缺少 production connector secret 时 blocked 且不泄露值", () => {
    const result = buildConnectorProductionPreflight({ connector: "notion", env: {} });

    expect(result).toMatchObject({
      connector: "notion",
      ready: false,
      status: "blocked",
      productionPlatformDeliveryReady: false,
      missingSecrets: expect.arrayContaining([
        expect.objectContaining({ key: "LIME_AGENT_APP_NOTION_OAUTH_CLIENT_ID" }),
        expect.objectContaining({ key: "LIME_AGENT_APP_NOTION_OAUTH_CLIENT_SECRET" }),
        expect.objectContaining({ key: "LIME_AGENT_APP_NOTION_WORKSPACE_ID" }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("接受 connector-specific alias 但只输出 secret 名称", () => {
    const result = buildConnectorProductionPreflight({
      connector: "slack",
      env: {
        SLACK_BOT_TOKEN: "secret-value",
        SLACK_CLIENT_ID: "client-id",
        SLACK_CLIENT_SECRET: "secret-value",
      },
    });

    expect(result).toMatchObject({
      ready: true,
      status: "ready",
      missingSecrets: [],
      presentSecretKeys: expect.arrayContaining([
        expect.objectContaining({
          key: "SLACK_BOT_TOKEN",
          canonicalKey: "LIME_AGENT_APP_SLACK_BOT_TOKEN",
        }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(JSON.stringify(result)).not.toContain("client-id");
  });

  it("all connector mode 会汇总每个 connector 的 presence", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-connector-production-source-"),
    );
    const webhookUrlFile = path.join(outputDir, "webhook-url.txt");
    fs.writeFileSync(webhookUrlFile, "https://hooks.example.com/lime\n", "utf8");
    const result = buildConnectorProductionPreflight({
      connector: "all",
      env: {
        LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE: webhookUrlFile,
      },
    });

    expect(result.connectorSummary.webhook).toEqual({ present: 1, missing: 0 });
    expect(result.connectorSummary.notion.missing).toBeGreaterThan(0);
    expect(result.ready).toBe(false);
  });

  it("remote webhook source 必须是 https 且不能指向本地或不可读文件", () => {
    const localUrl = "http://127.0.0.1:3000/webhook";
    const localResult = buildConnectorProductionPreflight({
      connector: "webhook",
      env: {
        LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL: localUrl,
      },
    });

    expect(localResult).toMatchObject({
      ready: false,
      status: "blocked",
      missingSecrets: [
        expect.objectContaining({
          invalidSources: [
            expect.objectContaining({
              key: "LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL",
              reason: "remote_webhook_url_must_be_https_and_non_local",
              sourceType: "env",
            }),
          ],
        }),
      ],
    });
    expect(JSON.stringify(localResult)).not.toContain(localUrl);

    const missingFile = buildConnectorProductionPreflight({
      connector: "webhook",
      env: {
        LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE: path.join(
          os.tmpdir(),
          "lime-missing-webhook-url.txt",
        ),
      },
    });

    expect(missingFile.ready).toBe(false);
    expect(missingFile.missingSecrets[0].invalidSources).toEqual([
      expect.objectContaining({
        key: "LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE",
        reason: "file_source_unreadable",
        sourceType: "file",
      }),
    ]);
  });

  it("CLI --check 根据 readiness 返回退出码并写非敏感 JSON", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-connector-production-preflight-"),
    );
    const blockedPath = path.join(outputDir, "blocked.json");
    const blocked = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-connector-production-preflight.mjs"),
        "--connector",
        "notion",
        "--output",
        blockedPath,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(blocked.status).toBe(1);
    expect(JSON.parse(fs.readFileSync(blockedPath, "utf8"))).toMatchObject({
      ready: false,
      status: "blocked",
    });

    const readyPath = path.join(outputDir, "ready.json");
    const ready = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-connector-production-preflight.mjs"),
        "--connector",
        "webhook",
        "--output",
        readyPath,
        "--check",
      ],
      {
        encoding: "utf8",
        env: {
          LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL: "https://hooks.example.com/lime",
          PATH: process.env.PATH,
        },
      },
    );

    expect(ready.status).toBe(0);
    const readyJson = JSON.parse(fs.readFileSync(readyPath, "utf8"));
    expect(readyJson).toMatchObject({ ready: true, status: "ready" });
    expect(JSON.stringify(readyJson)).not.toContain("https://hooks.example.com/lime");
  });

  it("CLI blocked 输出包含可用 alias 名称但不包含 secret 值", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-connector-production-preflight.mjs"),
        "--connector",
        "webhook",
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL");
    expect(result.stdout).toContain("aliases:LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE");
    expect(result.stdout).not.toContain("https://");
  });

  it("CLI --help 描述 webhook env/file secret source", () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/agent-app-connector-production-preflight.mjs"), "--help"],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL");
    expect(result.stdout).toContain("LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE");
    expect(result.stdout).toContain("non-local https URL");
  });

  it("writeJsonFile 会创建父目录", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-connector-production-write-"),
    );
    const output = path.join(outputDir, "nested", "preflight.json");
    writeJsonFile(output, { status: "ready" });

    expect(JSON.parse(fs.readFileSync(output, "utf8"))).toEqual({ status: "ready" });
  });
});
