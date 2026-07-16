import fs from "node:fs";
import path from "node:path";

import { PROJECT_GATE_PROOF_LEVELS } from "./project-gate-candidate-core.mjs";

const SURFACE_STATUSES = new Set([
  "unstarted",
  "gate-a-only",
  "gate-b-only",
  "complete",
  "blocked",
]);
const EVIDENCE_RESULTS = new Set(["pass", "fail", "blocked"]);

export function readProjectGateSurfaceManifest(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (value?.schemaVersion !== 1 || !Array.isArray(value.surfaces)) {
    throw new Error("project Gate surface manifest schema 非法");
  }
  const seen = new Set();
  for (const surface of value.surfaces) {
    if (
      typeof surface?.id !== "string" ||
      seen.has(surface.id) ||
      !["P0", "P1"].includes(surface.priority) ||
      !Array.isArray(surface.requiredProofs) ||
      surface.requiredProofs.length === 0 ||
      !surface.requiredProofs.every((proof) =>
        PROJECT_GATE_PROOF_LEVELS.has(proof),
      )
    ) {
      throw new Error("project Gate surface manifest 内容非法");
    }
    seen.add(surface.id);
  }
  return value;
}

export function collectProjectGateEvidence({
  evidenceRoot,
  outputPath = null,
}) {
  const root = fs.realpathSync(path.resolve(evidenceRoot));
  const ignored = new Set(outputPath ? [path.resolve(outputPath)] : []);
  const files = [];
  walkJsonFiles(root, files, ignored);
  return files.flatMap((filePath) => {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || !value.surfaceProof) {
      return [];
    }
    return [
      {
        file: path.relative(root, filePath).replaceAll("\\", "/"),
        value,
      },
    ];
  });
}

export function buildProjectGateCoverage({
  candidateRunId,
  manifest,
  evidenceRecords,
}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(candidateRunId ?? "")) {
    throw new Error("candidate run-id 非法");
  }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.surfaces)) {
    throw new Error("project Gate surface manifest schema 非法");
  }

  const surfacesById = new Map(
    manifest.surfaces.map((surface) => [surface.id, surface]),
  );
  const normalizedEvidence = evidenceRecords.map((record) =>
    normalizeEvidenceRecord(record, candidateRunId, surfacesById),
  );
  const surfaceResults = manifest.surfaces.map((surface) =>
    buildSurfaceCoverage(surface, normalizedEvidence),
  );
  for (const surface of surfaceResults) {
    if (!SURFACE_STATUSES.has(surface.status)) {
      throw new Error(`surface ${surface.id} status 非法`);
    }
  }
  const complete = surfaceResults.filter(
    (surface) => surface.status === "complete",
  ).length;
  const priorityCounts = { P0: 0, P1: 0 };
  const completeByPriority = { P0: 0, P1: 0 };
  for (const surface of surfaceResults) {
    priorityCounts[surface.priority] += 1;
    if (surface.status === "complete") {
      completeByPriority[surface.priority] += 1;
    }
  }

  return {
    schemaVersion: 1,
    candidateRunId,
    status: complete === surfaceResults.length ? "complete" : "incomplete",
    completion: {
      complete,
      total: surfaceResults.length,
      percent:
        surfaceResults.length === 0
          ? 0
          : Math.floor((complete * 10000) / surfaceResults.length) / 100,
      priorityCounts,
      completeByPriority,
    },
    evidence: {
      recognized: normalizedEvidence.length,
      counting: normalizedEvidence.filter((entry) => entry.counts).length,
      failed: normalizedEvidence.filter((entry) => entry.failed).length,
    },
    surfaces: surfaceResults,
  };
}

function normalizeEvidenceRecord(record, candidateRunId, surfacesById) {
  const value = record?.value ?? record;
  const sourceFile =
    typeof record?.file === "string" ? record.file : "<in-memory>";
  if (value?.schemaVersion !== 1) {
    throw new Error(`${sourceFile}: surface evidence schemaVersion 非法`);
  }
  if (value.candidateRunId !== candidateRunId) {
    throw new Error(`${sourceFile}: surface evidence candidateRunId 不匹配`);
  }
  const proof = value.surfaceProof;
  const surface = surfacesById.get(proof?.surfaceId);
  if (!surface) {
    throw new Error(`${sourceFile}: surface evidence surfaceId 非法`);
  }
  if (!PROJECT_GATE_PROOF_LEVELS.has(proof?.proof)) {
    throw new Error(`${sourceFile}: surface evidence proof 非法`);
  }
  if (typeof proof.complete !== "boolean") {
    throw new Error(`${sourceFile}: surface evidence complete marker 缺失`);
  }
  if (!EVIDENCE_RESULTS.has(value.result)) {
    throw new Error(`${sourceFile}: surface evidence result 非法`);
  }
  if (
    !value.assertions ||
    !Number.isInteger(value.assertions.total) ||
    !Number.isInteger(value.assertions.passed) ||
    !Array.isArray(value.assertions.failed)
  ) {
    throw new Error(`${sourceFile}: surface evidence assertions 非法`);
  }
  const assertionsPass =
    value.assertions.total > 0 &&
    value.assertions.passed === value.assertions.total &&
    value.assertions.failed.length === 0;
  if (value.result === "pass" && !assertionsPass) {
    throw new Error(`${sourceFile}: pass evidence 必须全部 assertions 通过`);
  }
  if (value.result !== "pass") {
    if (
      proof.complete ||
      typeof value.failureClass !== "string" ||
      !value.failureClass.trim() ||
      typeof value.nextAction !== "string" ||
      !value.nextAction.trim()
    ) {
      throw new Error(
        `${sourceFile}: failed/blocked evidence 必须声明 failureClass、nextAction 且 complete=false`,
      );
    }
  }

  return {
    file: sourceFile,
    surfaceId: surface.id,
    proof: proof.proof,
    required: surface.requiredProofs.includes(proof.proof),
    counts: value.result === "pass" && proof.complete && assertionsPass,
    failed: value.result !== "pass",
    result: value.result,
  };
}

function buildSurfaceCoverage(surface, evidence) {
  const entries = evidence.filter((entry) => entry.surfaceId === surface.id);
  const completedProofs = Array.from(
    new Set(
      entries
        .filter((entry) => entry.counts && entry.required)
        .map((entry) => entry.proof),
    ),
  ).sort();
  const missingProofs = surface.requiredProofs.filter(
    (proof) => !completedProofs.includes(proof),
  );
  const failedEvidence = entries
    .filter((entry) => entry.failed)
    .map((entry) => ({
      file: entry.file,
      proof: entry.proof,
      result: entry.result,
    }));
  let status = "unstarted";
  if (missingProofs.length === 0) {
    status = "complete";
  } else if (failedEvidence.length > 0) {
    status = "blocked";
  } else if (completedProofs.includes("gate-a")) {
    status = "gate-a-only";
  } else if (completedProofs.some((proof) => proof.startsWith("gate-b-"))) {
    status = "gate-b-only";
  }

  return {
    id: surface.id,
    priority: surface.priority,
    owners: surface.owners,
    status,
    requiredProofs: surface.requiredProofs,
    completedProofs,
    missingProofs,
    failedEvidence,
    evidenceFiles: Array.from(
      new Set(entries.map((entry) => entry.file)),
    ).sort(),
  };
}

function walkJsonFiles(directory, files, ignored) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`evidence 目录禁止符号链接: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      walkJsonFiles(absolutePath, files, ignored);
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      !ignored.has(absolutePath)
    ) {
      files.push(absolutePath);
    }
  }
}
