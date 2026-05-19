#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  buildProductionWebhookDryRun,
  buildProductionWebhookEvidence,
  buildProductionWebhookPayload,
  isProductionWebhookUrl,
  productionPreflightReadyForConnector,
} from "./lib/agent-app-connector-production-webhook-delivery-core.mjs";

function parseArgs(argv) {
  const options = {
    action: "deliver",
    connector: "webhook",
    deliveryRef: "",
    inputPreviewJson: "{}",
    mutationId: "",
    outboxRef: "",
    output: "",
    preflight:
      ".lime/qc/gui-evidence/agent-apps/p18-7-e-connector-production-preflight-check-20260519-codex.json",
    send: false,
    webhookUrlEnv: "",
    webhookUrlFile: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--send") {
      options.send = true;
    } else if (arg === "--webhook-url-env" && next) {
      options.webhookUrlEnv = next;
      index += 1;
    } else if (arg === "--webhook-url-file" && next) {
      options.webhookUrlFile = next;
      index += 1;
    } else if (arg === "--connector" && next) {
      options.connector = next;
      index += 1;
    } else if (arg === "--action" && next) {
      options.action = next;
      index += 1;
    } else if (arg === "--mutation-id" && next) {
      options.mutationId = next;
      index += 1;
    } else if (arg === "--outbox-ref" && next) {
      options.outboxRef = next;
      index += 1;
    } else if (arg === "--delivery-ref" && next) {
      options.deliveryRef = next;
      index += 1;
    } else if (arg === "--input-preview-json" && next) {
      options.inputPreviewJson = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--preflight" && next) {
      options.preflight = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app-connector-production-webhook-delivery.mjs [options]

Options:
  --webhook-url-env <env>       Read production webhook URL from env.
  --webhook-url-file <path>     Read production webhook URL from file.
  --send                        Actually POST to the webhook. Default is dry-run.
  --connector <id>              Connector id, default webhook.
  --action <name>               Action name, default deliver.
  --mutation-id <id>            Optional mutation id.
  --outbox-ref <ref>            Optional outbox:// ref.
  --delivery-ref <ref>          Optional delivery:// ref.
  --input-preview-json <json>   Non-sensitive input preview JSON.
  --preflight <path>            Required ready preflight JSON before --send.
  --output <path>               Write evidence or dry-run JSON.

No CLI URL option is provided; production targets must come from env/file.`);
}

function readWebhookUrl(options) {
  if (options.webhookUrlEnv && options.webhookUrlFile) {
    throw new Error("--webhook-url-env and --webhook-url-file are mutually exclusive");
  }
  if (options.webhookUrlEnv) {
    const value = process.env[options.webhookUrlEnv]?.trim() || "";
    if (!value) throw new Error(`environment variable ${options.webhookUrlEnv} is required`);
    return value;
  }
  if (options.webhookUrlFile) {
    const value = fs.readFileSync(path.resolve(options.webhookUrlFile), "utf8").trim();
    if (!value) throw new Error("webhook URL file is empty");
    return value;
  }
  throw new Error("--webhook-url-env or --webhook-url-file is required");
}

function parseInputPreview(value) {
  const parsed = JSON.parse(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--input-preview-json must be a JSON object");
  }
  return parsed;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeOutput(outputPath, value) {
  if (!outputPath) return;
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function postWebhook(targetUrl, payload) {
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const targetUrl = readWebhookUrl(options);
  if (!isProductionWebhookUrl(targetUrl)) {
    throw new Error("production webhook URL must be https:// and non-local");
  }
  const inputPreview = parseInputPreview(options.inputPreviewJson);
  const common = {
    ...options,
    inputPreview,
    targetUrl,
  };
  if (!options.send) {
    const dryRun = buildProductionWebhookDryRun(common);
    writeOutput(options.output, dryRun);
    console.log(
      `[agent-app-connector-production-webhook-delivery] status=${dryRun.status} sendRequested=false output=${options.output || ""}`,
    );
    return;
  }

  const preflight = readJsonFile(options.preflight);
  if (!productionPreflightReadyForConnector(preflight, options.connector)) {
    throw new Error("production preflight must be ready before --send");
  }

  const payload = buildProductionWebhookPayload(common);
  const httpStatus = await postWebhook(targetUrl, payload);
  const evidence = buildProductionWebhookEvidence({
    ...common,
    httpStatus,
  });
  writeOutput(options.output, evidence);
  console.log(
    `[agent-app-connector-production-webhook-delivery] status=${evidence.status} httpStatus=${httpStatus} output=${options.output || ""}`,
  );
  if (!evidence.productionDelivery.productionPlatformDelivered) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[agent-app-connector-production-webhook-delivery] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
