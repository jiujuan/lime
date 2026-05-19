import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildProductionWebhookDryRun,
  buildProductionWebhookEvidence,
  buildProductionWebhookPayload,
  isProductionWebhookUrl,
  productionPreflightReadyForConnector,
} from "./agent-app-connector-production-webhook-delivery-core.mjs";

describe("agent app connector production webhook delivery", () => {
  it("只接受非本地 https production webhook URL", () => {
    expect(isProductionWebhookUrl("https://hooks.example.com/lime")).toBe(true);
    expect(isProductionWebhookUrl("http://hooks.example.com/lime")).toBe(false);
    expect(isProductionWebhookUrl("https://localhost/lime")).toBe(false);
    expect(isProductionWebhookUrl("http://127.0.0.1:3000/lime")).toBe(false);
  });

  it("构造的发送 payload 只包含非敏感 preview", () => {
    const payload = buildProductionWebhookPayload({
      action: "deliver",
      connector: "webhook",
      deliveryRef: "delivery://connector/webhook/deliver/1",
      inputPreview: { title: "内容计划" },
      mutationId: "mutation-1",
      outboxRef: "outbox://connector/webhook/deliver/1",
    });

    expect(payload).toMatchObject({
      action: "deliver",
      connectorId: "webhook",
      inputPreview: { title: "内容计划" },
      source: "agent_app_connector_production_webhook_delivery_adapter",
    });
  });

  it("delivery evidence 不序列化 webhook URL", () => {
    const targetUrl = "https://hooks.example.com/secret-path";
    const evidence = buildProductionWebhookEvidence({
      action: "deliver",
      connector: "webhook",
      deliveryRef: "delivery://connector/webhook/deliver/1",
      httpStatus: 202,
      mutationId: "mutation-1",
      outboxRef: "outbox://connector/webhook/deliver/1",
      targetUrl,
    });

    expect(evidence).toMatchObject({
      status: "delivered_to_production_platform",
      productionDelivery: {
        proofLevel: "production_connector_delivery_adapter",
        productionPlatformDelivered: true,
        targetExposed: false,
      },
    });
    expect(JSON.stringify(evidence)).not.toContain(targetUrl);
    expect(JSON.stringify(evidence)).not.toContain("secret-path");
  });

  it("dry-run 默认阻塞且不宣称 production delivered", () => {
    const dryRun = buildProductionWebhookDryRun({
      action: "deliver",
      connector: "webhook",
      targetUrl: "https://hooks.example.com/lime",
    });

    expect(dryRun).toMatchObject({
      ready: false,
      sendRequested: false,
      status: "blocked",
      productionDelivery: {
        nextRequired: "operator_confirm_send",
        productionPlatformDelivered: false,
      },
    });
  });

  it("send 前要求 matching connector 的 ready preflight", () => {
    expect(
      productionPreflightReadyForConnector(
        {
          connector: "webhook",
          missingSecrets: [],
          productionPlatformDeliveryReady: true,
          ready: true,
          status: "ready",
        },
        "webhook",
      ),
    ).toBe(true);
    expect(
      productionPreflightReadyForConnector(
        {
          connector: "webhook",
          missingSecrets: [{ key: "LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL" }],
          productionPlatformDeliveryReady: false,
          ready: false,
          status: "blocked",
        },
        "webhook",
      ),
    ).toBe(false);
    expect(
      productionPreflightReadyForConnector(
        {
          connector: "slack",
          missingSecrets: [],
          productionPlatformDeliveryReady: true,
          ready: true,
          status: "ready",
        },
        "webhook",
      ),
    ).toBe(false);
  });

  it("CLI --help 说明 env/file target 与 send preflight gate", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-connector-production-webhook-delivery.mjs"),
        "--help",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--webhook-url-env");
    expect(result.stdout).toContain("--webhook-url-file");
    expect(result.stdout).toContain("--send");
    expect(result.stdout).toContain("Required ready preflight JSON before --send");
    expect(result.stdout).toContain("No CLI URL option is provided");
  });
});
