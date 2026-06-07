import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildConnectorProductionDeliveryGate,
  writeJsonFile,
} from "./agent-app-connector-production-delivery-gate-core.mjs";

const READY_PREFLIGHT = {
  checkedSecretCount: 1,
  connector: "webhook",
  missingSecrets: [],
  productionPlatformDeliveryReady: true,
  ready: true,
  status: "ready",
};

const READY_DELIVERY = {
  connector: "webhook",
  productionDelivery: {
    credentialMaterialExposed: false,
    targetExposed: false,
    tokenExposed: false,
  },
  threadRead: {
    productionDeliveryNextRequired: "production_connector_delivery_complete",
    productionDeliveryProofLevel: "production_connector_delivery_adapter",
    productionPlatformDelivered: true,
  },
};

const READY_GUI_EVIDENCE = {
  assertions: {
    credentialMaterialNotExposed: true,
    externalDeliveryTargetNotExposed: true,
    productionConnectorDeliveryVisible: true,
    tokenNotExposed: true,
  },
  connector: "webhook",
  productionDelivery: {
    productionPlatformDelivered: true,
    proofLevel: "production_connector_delivery_adapter",
  },
  status: "passed",
};

describe("agent app connector production delivery gate", () => {
  it("缺少 preflight 和 delivery evidence 时 blocked", () => {
    const result = buildConnectorProductionDeliveryGate({});

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_connector_preflight_not_ready",
        }),
        expect.objectContaining({
          code: "production_delivery_evidence_missing",
        }),
        expect.objectContaining({
          code: "production_gui_evidence_missing",
        }),
      ]),
    });
  });

  it("拒绝 local/webhook proxy-only proof level", () => {
    const result = buildConnectorProductionDeliveryGate({
      preflight: READY_PREFLIGHT,
      delivery: {
        threadRead: {
          productionDeliveryProofLevel: "host_managed_webhook_receipt",
          productionPlatformDelivered: false,
        },
      },
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({ code: "production_platform_delivered_false" }),
        expect.objectContaining({ code: "proxy_only_delivery_proof_level" }),
      ]),
    });
  });

  it("没有 GUI evidence 时不接受 production connector adapter proof", () => {
    const result = buildConnectorProductionDeliveryGate({
      preflight: READY_PREFLIGHT,
      delivery: READY_DELIVERY,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      delivery: {
        proofLevel: "production_connector_delivery_adapter",
        productionPlatformDelivered: true,
      },
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({ code: "production_gui_evidence_missing" }),
      ]),
    });
  });

  it("接受 production connector adapter proof 和 GUI projection evidence", () => {
    const result = buildConnectorProductionDeliveryGate({
      delivery: READY_DELIVERY,
      guiEvidence: READY_GUI_EVIDENCE,
      preflight: READY_PREFLIGHT,
    });

    expect(result).toMatchObject({
      ready: true,
      status: "ready",
      guiEvidence: {
        connector: "webhook",
        productionDeliveryVisible: true,
        productionPlatformDelivered: true,
        redaction: {
          credentialMaterialNotExposed: true,
          targetNotExposed: true,
          tokenNotExposed: true,
        },
      },
      missingRequirements: [],
    });
  });

  it("拒绝 preflight / delivery / GUI connector 不一致的假组合", () => {
    const result = buildConnectorProductionDeliveryGate({
      delivery: { ...READY_DELIVERY, connector: "slack" },
      guiEvidence: READY_GUI_EVIDENCE,
      preflight: READY_PREFLIGHT,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      connector: {
        preflightCoversDelivery: false,
        sameGuiConnector: false,
      },
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_preflight_connector_mismatch",
        }),
        expect.objectContaining({
          code: "production_gui_connector_mismatch",
        }),
      ]),
    });
  });

  it("拒绝 production delivered 但 nextRequired 未完成的证据", () => {
    const result = buildConnectorProductionDeliveryGate({
      delivery: {
        ...READY_DELIVERY,
        productionDelivery: {
          nextRequired: "operator_confirm_send",
          productionPlatformDelivered: true,
          proofLevel: "production_connector_delivery_adapter",
        },
        threadRead: undefined,
      },
      guiEvidence: READY_GUI_EVIDENCE,
      preflight: READY_PREFLIGHT,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_delivery_next_required_not_complete",
        }),
      ]),
    });
  });

  it("拒绝 target 或 credential material 外露的 production 证据", () => {
    const result = buildConnectorProductionDeliveryGate({
      delivery: {
        ...READY_DELIVERY,
        productionDelivery: {
          credentialMaterialExposed: true,
          targetExposed: true,
          tokenExposed: false,
        },
      },
      guiEvidence: {
        ...READY_GUI_EVIDENCE,
        assertions: {
          ...READY_GUI_EVIDENCE.assertions,
          credentialMaterialNotExposed: false,
          externalDeliveryTargetNotExposed: false,
        },
      },
      preflight: READY_PREFLIGHT,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_delivery_target_redaction_not_proven",
        }),
        expect.objectContaining({
          code: "production_delivery_credential_redaction_not_proven",
        }),
        expect.objectContaining({
          code: "production_gui_target_redaction_not_proven",
        }),
        expect.objectContaining({
          code: "production_gui_credential_redaction_not_proven",
        }),
      ]),
    });
  });

  it("CLI --check 写入 blocked gate JSON 并返回非零", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-production-delivery-gate-"),
    );
    const preflightPath = path.join(outputDir, "preflight.json");
    const deliveryPath = path.join(outputDir, "delivery.json");
    const outputPath = path.join(outputDir, "gate.json");
    writeJsonFile(preflightPath, READY_PREFLIGHT);
    writeJsonFile(deliveryPath, {
      productionDelivery: {
        productionPlatformDelivered: false,
        proofLevel: "local_cloud_overlay_worker_receipt",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app/connector-production-delivery-gate.mjs"),
        "--preflight",
        preflightPath,
        "--delivery",
        deliveryPath,
        "--output",
        outputPath,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("missingCodes=");
    expect(result.stdout).toContain("proxy_only_delivery_proof_level");
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toMatchObject({
      ready: false,
      status: "blocked",
    });
  });

  it("CLI --check 在 delivery 与 GUI evidence 都 ready 时返回 0", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-production-delivery-gate-ready-"),
    );
    const preflightPath = path.join(outputDir, "preflight.json");
    const deliveryPath = path.join(outputDir, "delivery.json");
    const guiEvidencePath = path.join(outputDir, "gui-evidence.json");
    const outputPath = path.join(outputDir, "gate.json");
    writeJsonFile(preflightPath, READY_PREFLIGHT);
    writeJsonFile(deliveryPath, READY_DELIVERY);
    writeJsonFile(guiEvidencePath, READY_GUI_EVIDENCE);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app/connector-production-delivery-gate.mjs"),
        "--preflight",
        preflightPath,
        "--delivery",
        deliveryPath,
        "--gui-evidence",
        guiEvidencePath,
        "--output",
        outputPath,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toMatchObject({
      ready: true,
      status: "ready",
      missingRequirements: [],
    });
  });

  it("CLI --help 描述 GUI / redaction / nextRequired 门禁", () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/agent-app/connector-production-delivery-gate.mjs"), "--help"],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--gui-evidence");
    expect(result.stdout).toContain("nextRequired=production_connector_delivery_complete");
    expect(result.stdout).toContain("target/credential/token redaction");
  });
});
