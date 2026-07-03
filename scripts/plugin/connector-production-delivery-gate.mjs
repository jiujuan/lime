#!/usr/bin/env node
import {
  buildConnectorProductionDeliveryGate,
  readOptionalJsonFile,
  writeJsonFile,
} from "../lib/plugin-connector-production-delivery-gate-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    delivery: "",
    guiEvidence: "",
    output: "",
    preflight:
      ".lime/qc/gui-evidence/plugins/p18-7-e-connector-production-preflight-check-20260519-codex.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--preflight" && next) {
      options.preflight = next;
      index += 1;
    } else if (arg === "--delivery" && next) {
      options.delivery = next;
      index += 1;
    } else if (arg === "--gui-evidence" && next) {
      options.guiEvidence = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/connector-production-delivery-gate.mjs [options]

Options:
  --preflight <path>  Production preflight JSON.
  --delivery <path>   Production delivery evidence JSON.
  --gui-evidence <path>
                      GUI evidence proving delivery is visible to Plugin UI/task events.
  --output <path>     Write gate JSON.
  --check             Exit non-zero unless production delivery is complete.

Ready requires matching connector ids across preflight, delivery, and GUI evidence;
productionPlatformDelivered=true; nextRequired=production_connector_delivery_complete;
production proofLevel; GUI projection; and target/credential/token redaction.
This gate refuses local worker receipts, Host-managed webhook-only receipts, mismatched connector evidence, incomplete next actions, exposed secret material, and delivery evidence that never surfaces back to the GUI.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = buildConnectorProductionDeliveryGate({
    delivery: readOptionalJsonFile(options.delivery),
    guiEvidence: readOptionalJsonFile(options.guiEvidence),
    preflight: readOptionalJsonFile(options.preflight),
  });
  if (options.output) {
    writeJsonFile(options.output, result);
  }

  console.log(
    `[plugin-connector-production-delivery-gate] status=${result.status} preflight=${result.preflight.status} deliveryProof=${result.delivery.proofLevel || "missing"} missing=${result.missingRequirements.length}`,
  );
  if (result.missingRequirements.length > 0) {
    console.log(
      `[plugin-connector-production-delivery-gate] missingCodes=${result.missingRequirements
        .map((item) => item.code)
        .join(",")}`,
    );
  }
  if (options.output) {
    console.log(`[plugin-connector-production-delivery-gate] output=${options.output}`);
  }
  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[plugin-connector-production-delivery-gate] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
