import fs from "node:fs";
import path from "node:path";

function trimSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function fileName(filePath) {
  return path.basename(String(filePath ?? ""));
}

function artifactKey(artifact) {
  return artifact?.contentHash ?? artifact?.path;
}

function normalizeArtifact(artifact, { appId, channel, endpoint, version }) {
  const name = fileName(artifact.path);
  return {
    kind: artifact.kind,
    path: artifact.path,
    contentHash: artifact.contentHash,
    signature: artifact.updaterSignature,
    size: artifact.size,
    url: `${trimSlash(endpoint)}/${appId}/${channel}/${version}/${encodeURIComponent(name)}`,
  };
}

export function buildStandaloneUpdaterPublishPlan({
  appId = "",
  artifacts = [],
  channel = "stable",
  endpoint = "",
  notes = "",
  outputDir = "",
  previousArtifactRef = "",
  previousManifestRef = "",
  pubkey = "",
  publishedAt = new Date().toISOString(),
  version = "",
}) {
  const blockers = [];
  const normalizedArtifacts = Array.isArray(artifacts) ? artifacts : [];
  if (!String(appId).trim()) {
    blockers.push({
      code: "APP_ID_MISSING",
      message: "Updater publish plan requires appId.",
    });
  }
  if (!String(version).trim()) {
    blockers.push({
      code: "VERSION_MISSING",
      message: "Updater publish plan requires version.",
    });
  }
  if (!String(endpoint).trim()) {
    blockers.push({
      code: "ENDPOINT_MISSING",
      message: "Updater publish plan requires endpoint.",
    });
  }
  if (!String(pubkey).trim()) {
    blockers.push({
      code: "UPDATER_PUBKEY_MISSING",
      message: "Updater publish plan requires updater public key.",
    });
  }
  if (!String(outputDir).trim()) {
    blockers.push({
      code: "OUTPUT_DIR_MISSING",
      message: "Updater publish plan requires outputDir.",
    });
  }
  if (normalizedArtifacts.length === 0) {
    blockers.push({
      code: "ARTIFACTS_MISSING",
      message: "Updater publish plan requires signed artifacts.",
    });
  }

  for (const artifact of normalizedArtifacts) {
    if (!artifact?.path || !artifact?.contentHash) {
      blockers.push({
        code: "ARTIFACT_REF_INCOMPLETE",
        message: "Updater artifact refs require path and contentHash.",
        details: { artifact },
      });
    }
    if (!artifact?.updaterSignature) {
      blockers.push({
        code: "ARTIFACT_UPDATER_SIGNATURE_MISSING",
        message: "Updater artifact refs require updater signature evidence.",
        details: { artifact: artifactKey(artifact) },
      });
    }
    if (artifact?.platform === "macos" && !artifact?.notarized) {
      blockers.push({
        code: "MACOS_NOTARIZATION_EVIDENCE_MISSING",
        message:
          "macOS updater artifacts require notarization evidence before publishing.",
        details: { artifact: artifactKey(artifact) },
      });
    }
  }

  if (channel === "stable" && (!previousArtifactRef || !previousManifestRef)) {
    blockers.push({
      code: "ROLLBACK_REFERENCE_MISSING",
      message:
        "Stable updater publish plan requires previous artifact and manifest refs.",
    });
  }

  if (blockers.length > 0) {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToPublish: false,
      blockers,
      files: [],
    };
  }

  const latest = {
    schemaVersion: 1,
    appId,
    version,
    channel,
    notes,
    pubkey,
    pubDate: publishedAt,
    artifacts: normalizedArtifacts.map((artifact) =>
      normalizeArtifact(artifact, { appId, channel, endpoint, version }),
    ),
  };
  const rollback = {
    schemaVersion: 1,
    appId,
    channel,
    fromVersion: version,
    previousArtifactRef,
    previousManifestRef,
    strategy: "restore_previous_package",
  };
  const latestPath = path.join(outputDir, "latest.json");
  const rollbackPath = path.join(outputDir, "rollback.json");

  return {
    schemaVersion: 1,
    status: "ready",
    readyToPublish: true,
    releaseReadiness: "local_manifest_ready_not_uploaded",
    appId,
    version,
    channel,
    endpoint,
    latest,
    rollback,
    files: [
      {
        kind: "latest_manifest",
        path: latestPath,
        content: `${JSON.stringify(latest, null, 2)}\n`,
      },
      {
        kind: "rollback_manifest",
        path: rollbackPath,
        content: `${JSON.stringify(rollback, null, 2)}\n`,
      },
    ],
    uploadPlan: [
      {
        kind: "latest_manifest",
        path: latestPath,
        url: `${trimSlash(endpoint)}/${appId}/${channel}/latest.json`,
      },
      {
        kind: "rollback_manifest",
        path: rollbackPath,
        url: `${trimSlash(endpoint)}/${appId}/${channel}/rollback.json`,
      },
    ],
    blockers: [],
  };
}

export function writeStandaloneUpdaterPublishFiles(plan) {
  if (!plan || plan.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      filesWritten: [],
      blockers: plan?.blockers ?? [
        {
          code: "PUBLISH_PLAN_NOT_READY",
          message: "Updater publisher requires a ready publish plan.",
        },
      ],
    };
  }
  const filesWritten = [];
  for (const file of plan.files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content, "utf8");
    filesWritten.push({ kind: file.kind, path: file.path });
  }
  return {
    schemaVersion: 1,
    status: "written",
    releaseReadiness: "local_manifest_written_not_uploaded",
    filesWritten,
    uploadPlan: plan.uploadPlan,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
