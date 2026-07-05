import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import {
  APP_ID,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
} from "./plugin-content-factory-signed-release-gate-constants.mjs";
import {
  buildContentFactorySignedReleaseGate,
  writeJsonFile,
} from "./plugin-content-factory-signed-release-gate-core.mjs";

export const CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME =
  "content-factory-production-evidence-bundle.json";

const EVIDENCE_SLOTS = [
  ["preflight", "preflightPath"],
  ["catalog", "catalogPath"],
  ["bootstrap", "bootstrapPath"],
  ["fetchCloud", "fetchCloudPath"],
  ["guiEvidence", "guiEvidencePath"],
];

function readRequiredJson(filePath, label) {
  if (!filePath) return null;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} evidence file missing: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return {
    path: resolvedPath,
    sha256: sha256String(raw),
    size: Buffer.byteLength(raw, "utf8"),
    value: JSON.parse(raw),
  };
}

function sha256String(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function sha256Json(value) {
  return sha256String(JSON.stringify(value));
}

function gateSummary(gate) {
  return {
    missingCodes: gate.missingRequirements.map((item) => item.code),
    ready: gate.ready === true,
    status: gate.status || "blocked",
  };
}

function removeStaleFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
}

function sourceSummary(record) {
  return record
    ? {
        basename: path.basename(record.path),
        path: record.path,
        present: true,
        sha256: record.sha256,
        size: record.size,
      }
    : {
        basename: null,
        path: null,
        present: false,
        sha256: null,
        size: 0,
      };
}

export function buildContentFactoryProductionEvidenceBundle(input = {}) {
  const appId = input.appId || APP_ID;
  const expectedVersion = input.expectedVersion || "";
  const outputDir = path.resolve(process.cwd(), input.outputDir || "");
  if (!input.outputDir) {
    throw new Error("outputDir is required");
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const records = Object.fromEntries(
    EVIDENCE_SLOTS.map(([slot, inputKey]) => [
      slot,
      readRequiredJson(input[inputKey], slot),
    ]),
  );
  const files = {
    bootstrap: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.bootstrap,
    ),
    catalog: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.catalog,
    ),
    fetchCloud: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.fetchCloud,
    ),
    guiEvidence: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.guiEvidence,
    ),
    preflight: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.preflight,
    ),
    result: path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
    ),
    bundle: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
    ),
  };

  for (const [slot] of EVIDENCE_SLOTS) {
    if (records[slot]) {
      writeJsonFile(files[slot], records[slot].value);
    } else {
      removeStaleFile(files[slot]);
    }
  }

  const gate = buildContentFactorySignedReleaseGate({
    appId,
    bootstrap: records.bootstrap?.value,
    catalog: records.catalog?.value,
    expectedVersion,
    fetchCloud: records.fetchCloud?.value,
    guiEvidence: records.guiEvidence?.value,
    preflight: records.preflight?.value,
  });
  writeJsonFile(files.result, gate);
  const gateResultSha256 = sha256String(`${JSON.stringify(gate, null, 2)}\n`);
  const gateDigest = sha256Json(gateSummary(gate));
  const inputSlots = Object.fromEntries(
    EVIDENCE_SLOTS.map(([slot]) => [
      slot,
      records[slot]
        ? {
            present: true,
            sha256: records[slot].sha256,
          }
        : {
            present: false,
            sha256: null,
          },
    ]),
  );
  const inputDigest = sha256Json({
    appId,
    expectedVersion: expectedVersion || null,
    slots: inputSlots,
  });

  const bundle = {
    schemaVersion: "content-factory-production-evidence-bundle.v1",
    appId,
    expectedVersion: expectedVersion || null,
    generatedAt: new Date().toISOString(),
    dir: outputDir,
    files,
    sources: Object.fromEntries(
      EVIDENCE_SLOTS.map(([slot]) => [slot, sourceSummary(records[slot])]),
    ),
    inputs: {
      digest: inputDigest,
      slots: inputSlots,
    },
    gate: {
      digest: gateDigest,
      missingCodes: gate.missingRequirements.map((item) => item.code),
      ready: gate.ready,
      resultSha256: gateResultSha256,
      status: gate.status,
    },
    note: "This bundle only copies non-secret evidence JSON into the signed release gate filenames and runs the gate locally. It does not sign, upload, install, call a Provider, or call production APIs.",
  };
  writeJsonFile(files.bundle, bundle);

  return { bundle, dir: outputDir, files, gate };
}
