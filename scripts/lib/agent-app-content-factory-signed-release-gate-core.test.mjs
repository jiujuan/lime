import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildContentFactorySignedReleaseGate,
  writeJsonFile,
} from "./agent-app-content-factory-signed-release-gate-core.mjs";

const SIGNATURE_PROOF = {
  algorithm: "Ed25519",
  payloadHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  publicKeyId: "content-factory-prod-root-2026",
  signature: "base64-signature",
  signedAt: "2026-07-03T00:00:00.000Z",
};

const READY_CATALOG = {
  apps: [
    {
      appId: "content-factory-app",
      appVersion: "2.2.2",
      identity: {
        manifestHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        packageHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        signatureRef: "sigstore:content-factory-app@2.2.2:prod",
        sourceKind: "cloud_release",
        sourceUri:
          "https://updates.limeai.run/agent-apps/content-factory-app/prod/content-factory-app-2.2.2.lapp",
      },
      signatureProof: SIGNATURE_PROOF,
    },
  ],
};

const READY_BOOTSTRAP = {
  agentAppSignatureTrustRoots: [
    {
      algorithm: "Ed25519",
      appIds: ["content-factory-app"],
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
      publicKeyId: "content-factory-prod-root-2026",
      revoked: false,
    },
  ],
};

const READY_FETCH_CLOUD = {
  manifestHashMatched: true,
  packageHashMatched: true,
  packageVerificationStatus: "verified",
  signatureVerificationStatus: "verified",
  sourceKind: "cloud_release",
  status: "ready",
};

const READY_GUI_EVIDENCE = {
  assertions: {
    articleDraftDocumentPresent: true,
    contentFactoryArticleWorkspaceWorkflowFactsHidden: true,
    liveProviderUsed: true,
  },
  eventLogs: {
    workflowJsonl:
      "/tmp/lime-runtime/events/sessions/session_prod/workflow-events.jsonl",
  },
  installedState: {
    sourceKind: "cloud_release",
  },
  providerEvidence: {
    liveProviderUsed: true,
    productionRoute: true,
  },
  readModel: {
    hostManagedGenerationStatus: "completed",
  },
  signatureVerificationStatus: "verified",
  status: "passed",
};

describe("content factory signed release gate", () => {
  it("缺少 production evidence 时 blocked", () => {
    const result = buildContentFactorySignedReleaseGate({
      expectedVersion: "2.2.2",
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({ code: "production_catalog_missing" }),
        expect.objectContaining({ code: "production_trust_roots_missing" }),
        expect.objectContaining({
          code: "production_fetch_cloud_evidence_missing",
        }),
        expect.objectContaining({ code: "production_gui_evidence_missing" }),
      ]),
    });
  });

  it("拒绝 fixture cloud release 和 localhost host generation evidence", () => {
    const result = buildContentFactorySignedReleaseGate({
      bootstrap: READY_BOOTSTRAP,
      catalog: {
        apps: [
          {
            ...READY_CATALOG.apps[0],
            identity: {
              ...READY_CATALOG.apps[0].identity,
              signatureRef: "sigstore:content-factory-app@2.2.2:fixture",
              sourceUri:
                "https://updates.limeai.run/agent-apps/content-factory-app/fixture/content-factory-app-2.2.2.lapp",
            },
            releaseId: "content-factory-fixture-2.2.2",
          },
        ],
      },
      expectedVersion: "2.2.2",
      fetchCloud: {
        ...READY_FETCH_CLOUD,
        cloudReleaseFixture: { channel: "fixture" },
      },
      guiEvidence: {
        ...READY_GUI_EVIDENCE,
        hostGenerationFixture: {
          baseUrl: "http://127.0.0.1:48999",
          requestCount: 1,
        },
      },
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({ code: "production_package_url_not_https" }),
        expect.objectContaining({ code: "fixture_cloud_release_not_allowed" }),
        expect.objectContaining({
          code: "production_host_generation_not_live",
        }),
      ]),
    });
  });

  it("接受 production signed release + trust root + live Provider GUI evidence", () => {
    const result = buildContentFactorySignedReleaseGate({
      bootstrap: READY_BOOTSTRAP,
      catalog: READY_CATALOG,
      expectedVersion: "2.2.2",
      fetchCloud: READY_FETCH_CLOUD,
      guiEvidence: READY_GUI_EVIDENCE,
    });

    expect(result).toMatchObject({
      ready: true,
      status: "ready",
      bootstrap: {
        matchingTrustRoot: true,
      },
      fetchCloud: {
        ready: true,
      },
      guiEvidence: {
        liveProviderUsed: true,
        ready: true,
      },
      missingRequirements: [],
    });
  });

  it("CLI --check 写入 blocked gate JSON 并返回非零", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-signed-release-gate-"),
    );
    const outputPath = path.join(outputDir, "gate.json");

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          "scripts/agent-app/content-factory-signed-release-gate.mjs",
        ),
        "--expected-version",
        "2.2.2",
        "--output",
        outputPath,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("missingCodes=");
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toMatchObject({
      ready: false,
      status: "blocked",
    });
  });

  it("CLI --check 在全部 production evidence ready 时返回 0", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-signed-release-gate-ready-"),
    );
    const catalogPath = path.join(outputDir, "catalog.json");
    const bootstrapPath = path.join(outputDir, "bootstrap.json");
    const fetchCloudPath = path.join(outputDir, "fetch-cloud.json");
    const guiEvidencePath = path.join(outputDir, "gui.json");
    const outputPath = path.join(outputDir, "gate.json");
    writeJsonFile(catalogPath, READY_CATALOG);
    writeJsonFile(bootstrapPath, READY_BOOTSTRAP);
    writeJsonFile(fetchCloudPath, READY_FETCH_CLOUD);
    writeJsonFile(guiEvidencePath, READY_GUI_EVIDENCE);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          "scripts/agent-app/content-factory-signed-release-gate.mjs",
        ),
        "--catalog",
        catalogPath,
        "--bootstrap",
        bootstrapPath,
        "--fetch-cloud",
        fetchCloudPath,
        "--gui-evidence",
        guiEvidencePath,
        "--expected-version",
        "2.2.2",
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
});
