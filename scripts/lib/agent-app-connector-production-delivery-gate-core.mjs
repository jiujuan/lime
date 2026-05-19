import fs from "node:fs";
import path from "node:path";

const ACCEPTED_PRODUCTION_PROOF_LEVELS = new Set([
  "production_connector_delivery_adapter",
  "production_platform_delivery_receipt",
  "external_platform_delivery_receipt",
]);

const PROXY_ONLY_PROOF_LEVELS = new Set([
  "host_managed_webhook_receipt",
  "local_cloud_overlay_worker_receipt",
  "not_configured",
]);

function valueAtPath(root, pathParts) {
  let current = root;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function firstStringAtPaths(root, paths) {
  for (const pathParts of paths) {
    const value = valueAtPath(root, pathParts);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstBoolAtPaths(root, paths) {
  for (const pathParts of paths) {
    const value = valueAtPath(root, pathParts);
    if (typeof value === "boolean") return value;
  }
  return false;
}

function firstOptionalBoolAtPaths(root, paths) {
  for (const pathParts of paths) {
    const value = valueAtPath(root, pathParts);
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function redactionPassed(root, exposedPaths, notExposedPaths) {
  const exposed = firstOptionalBoolAtPaths(root, exposedPaths);
  if (exposed === false) return true;
  if (exposed === true) return false;
  const notExposed = firstOptionalBoolAtPaths(root, notExposedPaths);
  return notExposed === true;
}

function preflightReady(preflight) {
  return (
    preflight?.status === "ready" &&
    preflight?.ready === true &&
    preflight?.productionPlatformDeliveryReady === true &&
    (preflight?.missingSecrets?.length || 0) === 0
  );
}

function preflightCoversConnector(preflightConnector, deliveryConnector) {
  if (!preflightConnector || !deliveryConnector) return false;
  return preflightConnector === "all" || preflightConnector === deliveryConnector;
}

function summarizeDeliveryEvidence(delivery) {
  const productionPlatformDelivered = firstBoolAtPaths(delivery, [
    ["threadRead", "productionPlatformDelivered"],
    ["threadRead", "productionDelivery", "productionPlatformDelivered"],
    ["productionDelivery", "productionPlatformDelivered"],
    ["delivery", "productionDelivery", "productionPlatformDelivered"],
  ]);
  const proofLevel = firstStringAtPaths(delivery, [
    ["threadRead", "productionDeliveryProofLevel"],
    ["threadRead", "productionDelivery", "proofLevel"],
    ["productionDelivery", "proofLevel"],
    ["delivery", "productionDelivery", "proofLevel"],
  ]);
  const nextRequired = firstStringAtPaths(delivery, [
    ["threadRead", "productionDeliveryNextRequired"],
    ["threadRead", "productionDelivery", "nextRequired"],
    ["productionDelivery", "nextRequired"],
    ["delivery", "productionDelivery", "nextRequired"],
  ]);
  const connector = firstStringAtPaths(delivery, [
    ["connector"],
    ["connectorId"],
    ["threadRead", "connectorId"],
  ]);
  const evidencePath = firstStringAtPaths(delivery, [["path"], ["evidencePath"]]);
  const acceptedProofLevel = ACCEPTED_PRODUCTION_PROOF_LEVELS.has(proofLevel);
  const proxyOnlyProofLevel = PROXY_ONLY_PROOF_LEVELS.has(proofLevel);
  const nextRequiredComplete =
    nextRequired === "production_connector_delivery_complete";
  const targetNotExposed = redactionPassed(
    delivery,
    [
      ["targetExposed"],
      ["productionDelivery", "targetExposed"],
      ["delivery", "productionDelivery", "targetExposed"],
      ["threadRead", "productionDelivery", "targetExposed"],
    ],
    [["targetNotExposed"], ["assertions", "targetNotExposed"]],
  );
  const credentialMaterialNotExposed = redactionPassed(
    delivery,
    [
      ["credentialMaterialExposed"],
      ["productionDelivery", "credentialMaterialExposed"],
      ["delivery", "productionDelivery", "credentialMaterialExposed"],
      ["threadRead", "productionDelivery", "credentialMaterialExposed"],
    ],
    [
      ["credentialMaterialNotExposed"],
      ["assertions", "credentialMaterialNotExposed"],
    ],
  );
  const tokenNotExposed = redactionPassed(
    delivery,
    [
      ["tokenExposed"],
      ["productionDelivery", "tokenExposed"],
      ["delivery", "productionDelivery", "tokenExposed"],
      ["threadRead", "productionDelivery", "tokenExposed"],
    ],
    [["tokenNotExposed"], ["assertions", "tokenNotExposed"]],
  );

  return {
    acceptedProofLevel,
    connector: connector || null,
    evidencePath: evidencePath || null,
    nextRequired: nextRequired || null,
    nextRequiredComplete,
    productionPlatformDelivered,
    proofLevel: proofLevel || null,
    proxyOnlyProofLevel,
    redaction: {
      credentialMaterialNotExposed,
      ready: targetNotExposed && credentialMaterialNotExposed && tokenNotExposed,
      targetNotExposed,
      tokenNotExposed,
    },
    ready:
      productionPlatformDelivered &&
      acceptedProofLevel &&
      nextRequiredComplete &&
      targetNotExposed &&
      credentialMaterialNotExposed &&
      tokenNotExposed,
  };
}

function acceptedGuiStatus(status) {
  return new Set(["ready", "passed", "success", "ok", "completed"]).has(status);
}

function summarizeGuiEvidence(guiEvidence) {
  const status = firstStringAtPaths(guiEvidence, [
    ["status"],
    ["gui", "status"],
  ]);
  const productionPlatformDelivered = firstBoolAtPaths(guiEvidence, [
    ["productionPlatformDelivered"],
    ["productionDelivery", "productionPlatformDelivered"],
    ["delivery", "productionDelivery", "productionPlatformDelivered"],
    ["assertions", "productionPlatformDelivered"],
  ]);
  const productionDeliveryVisible = firstBoolAtPaths(guiEvidence, [
    ["productionDeliveryVisible"],
    ["taskEventProductionDeliveryProjected"],
    ["gui", "productionDeliveryVisible"],
    ["assertions", "productionDeliveryVisible"],
    ["assertions", "productionConnectorDeliveryVisible"],
    ["assertions", "taskEventProductionDeliveryProjected"],
  ]);
  const proofLevel = firstStringAtPaths(guiEvidence, [
    ["productionDeliveryProofLevel"],
    ["productionDelivery", "proofLevel"],
    ["delivery", "productionDelivery", "proofLevel"],
    ["threadRead", "productionDeliveryProofLevel"],
  ]);
  const connector = firstStringAtPaths(guiEvidence, [
    ["connector"],
    ["connectorId"],
    ["threadRead", "connectorId"],
    ["productionDelivery", "connector"],
    ["delivery", "connector"],
  ]);
  const acceptedProofLevel =
    !proofLevel || ACCEPTED_PRODUCTION_PROOF_LEVELS.has(proofLevel);
  const statusReady = acceptedGuiStatus(status);
  const targetNotExposed = redactionPassed(
    guiEvidence,
    [
      ["targetExposed"],
      ["productionDelivery", "targetExposed"],
      ["delivery", "productionDelivery", "targetExposed"],
    ],
    [
      ["targetNotExposed"],
      ["externalDeliveryTargetNotExposed"],
      ["assertions", "targetNotExposed"],
      ["assertions", "externalDeliveryTargetNotExposed"],
    ],
  );
  const credentialMaterialNotExposed = redactionPassed(
    guiEvidence,
    [
      ["credentialMaterialExposed"],
      ["productionDelivery", "credentialMaterialExposed"],
      ["delivery", "productionDelivery", "credentialMaterialExposed"],
    ],
    [
      ["credentialMaterialNotExposed"],
      ["assertions", "credentialMaterialNotExposed"],
    ],
  );
  const tokenNotExposed = redactionPassed(
    guiEvidence,
    [
      ["tokenExposed"],
      ["productionDelivery", "tokenExposed"],
      ["delivery", "productionDelivery", "tokenExposed"],
    ],
    [["tokenNotExposed"], ["assertions", "tokenNotExposed"]],
  );

  return {
    acceptedProofLevel,
    connector: connector || null,
    productionDeliveryVisible,
    productionPlatformDelivered,
    proofLevel: proofLevel || null,
    redaction: {
      credentialMaterialNotExposed,
      ready: targetNotExposed && credentialMaterialNotExposed && tokenNotExposed,
      targetNotExposed,
      tokenNotExposed,
    },
    ready:
      statusReady &&
      productionPlatformDelivered &&
      productionDeliveryVisible &&
      acceptedProofLevel &&
      targetNotExposed &&
      credentialMaterialNotExposed &&
      tokenNotExposed,
    status: status || "missing",
    statusReady,
  };
}

export function buildConnectorProductionDeliveryGate(input = {}) {
  const preflight = input.preflight || null;
  const delivery = input.delivery || null;
  const guiEvidence = input.guiEvidence || null;
  const preflightIsReady = preflightReady(preflight);
  const preflightConnector = firstStringAtPaths(preflight || {}, [["connector"]]);
  const deliveryEvidence = summarizeDeliveryEvidence(delivery || {});
  const gui = summarizeGuiEvidence(guiEvidence || {});
  const connectorCoveredByPreflight = preflightCoversConnector(
    preflightConnector,
    deliveryEvidence.connector,
  );
  const connectorMatchesGui =
    Boolean(deliveryEvidence.connector) && gui.connector === deliveryEvidence.connector;
  const missingRequirements = [];

  if (!preflightIsReady) {
    missingRequirements.push({
      code: "production_connector_preflight_not_ready",
      detail:
        "Production connector secrets are missing or not validated by the preflight gate.",
    });
  }
  if (!delivery) {
    missingRequirements.push({
      code: "production_delivery_evidence_missing",
      detail:
        "A production delivery evidence artifact is required; local webhook or outbox receipts are not enough.",
    });
  } else {
    if (!deliveryEvidence.productionPlatformDelivered) {
      missingRequirements.push({
        code: "production_platform_delivered_false",
        detail: "Evidence does not prove productionPlatformDelivered=true.",
      });
    }
    if (!deliveryEvidence.acceptedProofLevel) {
      missingRequirements.push({
        code: deliveryEvidence.proxyOnlyProofLevel
          ? "proxy_only_delivery_proof_level"
          : "production_delivery_proof_level_missing",
        detail:
          "Evidence proofLevel must come from a production connector delivery adapter, not a local/webhook proxy receipt.",
      });
    }
    if (!deliveryEvidence.nextRequiredComplete) {
      missingRequirements.push({
        code: "production_delivery_next_required_not_complete",
        detail:
          "Delivery evidence nextRequired must be production_connector_delivery_complete.",
      });
    }
    if (!deliveryEvidence.redaction.targetNotExposed) {
      missingRequirements.push({
        code: "production_delivery_target_redaction_not_proven",
        detail: "Delivery evidence must prove the target URL is not exposed.",
      });
    }
    if (!deliveryEvidence.redaction.credentialMaterialNotExposed) {
      missingRequirements.push({
        code: "production_delivery_credential_redaction_not_proven",
        detail:
          "Delivery evidence must prove credential material is not exposed.",
      });
    }
    if (!deliveryEvidence.redaction.tokenNotExposed) {
      missingRequirements.push({
        code: "production_delivery_token_redaction_not_proven",
        detail: "Delivery evidence must prove tokens are not exposed.",
      });
    }
    if (!deliveryEvidence.connector) {
      missingRequirements.push({
        code: "production_delivery_connector_missing",
        detail:
          "Delivery evidence must identify the connector id so it can be matched with preflight and GUI evidence.",
      });
    } else if (preflightIsReady && !connectorCoveredByPreflight) {
      missingRequirements.push({
        code: "production_preflight_connector_mismatch",
        detail:
          "Production preflight connector scope must be 'all' or match the delivered connector id.",
      });
    }
  }
  if (!guiEvidence) {
    missingRequirements.push({
      code: "production_gui_evidence_missing",
      detail:
        "A GUI evidence artifact is required to prove the production delivery surfaced back to Agent App task events or UI.",
    });
  } else {
    if (!gui.statusReady) {
      missingRequirements.push({
        code: "production_gui_evidence_not_ready",
        detail: "GUI evidence status must be ready/passed/success/ok/completed.",
      });
    }
    if (!gui.productionPlatformDelivered) {
      missingRequirements.push({
        code: "production_gui_platform_delivery_false",
        detail:
          "GUI evidence must carry productionPlatformDelivered=true for the delivered connector action.",
      });
    }
    if (!gui.productionDeliveryVisible) {
      missingRequirements.push({
        code: "production_gui_delivery_not_visible",
        detail:
          "GUI evidence must prove the production delivery was projected to Agent App UI or task events.",
      });
    }
    if (!gui.acceptedProofLevel) {
      missingRequirements.push({
        code: "production_gui_proof_level_not_production",
        detail:
          "GUI evidence proofLevel must match a production connector adapter or platform receipt.",
      });
    }
    if (!gui.redaction.targetNotExposed) {
      missingRequirements.push({
        code: "production_gui_target_redaction_not_proven",
        detail: "GUI evidence must prove the target URL is not exposed.",
      });
    }
    if (!gui.redaction.credentialMaterialNotExposed) {
      missingRequirements.push({
        code: "production_gui_credential_redaction_not_proven",
        detail: "GUI evidence must prove credential material is not exposed.",
      });
    }
    if (!gui.redaction.tokenNotExposed) {
      missingRequirements.push({
        code: "production_gui_token_redaction_not_proven",
        detail: "GUI evidence must prove tokens are not exposed.",
      });
    }
    if (!gui.connector) {
      missingRequirements.push({
        code: "production_gui_connector_missing",
        detail:
          "GUI evidence must identify the same connector id as the production delivery evidence.",
      });
    } else if (deliveryEvidence.connector && !connectorMatchesGui) {
      missingRequirements.push({
        code: "production_gui_connector_mismatch",
        detail:
          "GUI evidence connector id must match the production delivery evidence connector id.",
      });
    }
  }

  const connectorReady =
    connectorCoveredByPreflight && connectorMatchesGui && Boolean(gui.connector);
  const ready = preflightIsReady && deliveryEvidence.ready && gui.ready && connectorReady;
  return {
    schemaVersion: 1,
    status: ready ? "ready" : "blocked",
    ready,
    preflight: {
      checkedSecretCount: preflight?.checkedSecretCount ?? 0,
      connector: preflightConnector || null,
      missingSecretCount: preflight?.missingSecrets?.length ?? 0,
      productionPlatformDeliveryReady:
        preflight?.productionPlatformDeliveryReady === true,
      ready: preflightIsReady,
      status: preflight?.status || "missing",
    },
    connector: {
      preflightCoversDelivery: connectorCoveredByPreflight,
      ready: connectorReady,
      sameGuiConnector: connectorMatchesGui,
    },
    delivery: deliveryEvidence,
    guiEvidence: gui,
    missingRequirements,
    note:
      "This gate accepts only production connector delivery evidence plus GUI projection evidence. Host-managed webhook or local worker receipts stay blocked.",
  };
}

export function readOptionalJsonFile(filePath) {
  if (!filePath) return null;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) return null;
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
