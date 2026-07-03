import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildContentFactorySignedReleaseGate,
  buildContentFactorySignedReleaseEvidenceTemplate,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
  writeJsonFile,
} from "./plugin-content-factory-signed-release-gate-core.mjs";

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
          "https://updates.limeai.run/plugins/content-factory-app/prod/content-factory-app-2.2.2.lapp",
      },
      signatureProof: SIGNATURE_PROOF,
    },
  ],
};

const READY_BOOTSTRAP = {
  pluginSignatureTrustRoots: [
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
                "https://updates.limeai.run/plugins/content-factory-app/fixture/content-factory-app-2.2.2.lapp",
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

  it("拒绝 production evidence 模板占位值", () => {
    const placeholderProof = {
      ...SIGNATURE_PROOF,
      publicKeyId: "REPLACE_WITH_PRODUCTION_TRUST_ROOT_PUBLIC_KEY_ID",
      signature: "REPLACE_WITH_BASE64_SIGNATURE",
    };
    const result = buildContentFactorySignedReleaseGate({
      bootstrap: {
        pluginSignatureTrustRoots: [
          {
            ...READY_BOOTSTRAP.pluginSignatureTrustRoots[0],
            publicKeyId: placeholderProof.publicKeyId,
            publicKeyPem:
              "-----BEGIN PUBLIC KEY-----\\nREPLACE_WITH_PUBLIC_KEY\\n-----END PUBLIC KEY-----",
          },
        ],
      },
      catalog: {
        apps: [
          {
            ...READY_CATALOG.apps[0],
            signatureProof: placeholderProof,
          },
        ],
      },
      expectedVersion: "2.2.2",
      fetchCloud: READY_FETCH_CLOUD,
      guiEvidence: READY_GUI_EVIDENCE,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_placeholder_values_present",
        }),
      ]),
      placeholders: {
        bootstrap: expect.arrayContaining([
          expect.stringContaining("REPLACE_WITH_PUBLIC_KEY"),
        ]),
        catalog: expect.arrayContaining([
          "REPLACE_WITH_PRODUCTION_TRUST_ROOT_PUBLIC_KEY_ID",
          "REPLACE_WITH_BASE64_SIGNATURE",
        ]),
      },
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

  it("生成 production evidence 模板时覆盖 gate 所需四类输入", () => {
    const template = buildContentFactorySignedReleaseEvidenceTemplate({
      expectedVersion: "2.2.2",
    });

    expect(template).toMatchObject({
      appId: "content-factory-app",
      expectedVersion: "2.2.2",
      catalog: {
        apps: [
          expect.objectContaining({
            appId: "content-factory-app",
            appVersion: "2.2.2",
            signatureProof: expect.objectContaining({
              publicKeyId: expect.any(String),
            }),
          }),
        ],
      },
      fetchCloud: {
        sourceKind: "cloud_release",
        signatureVerificationStatus: "verified",
      },
      guiEvidence: {
        assertions: {
          contentFactoryArticleWorkspaceWorkflowFactsHidden: true,
          liveProviderUsed: true,
        },
      },
    });
    expect(template.command).toContain("--evidence-dir .");
    expect(template.forbiddenMarkers).toContain("hostGenerationFixture");
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
          "scripts/plugin/content-factory-signed-release-gate.mjs",
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

  it("CLI --write-template-dir 写入 production evidence 模板文件", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-signed-release-template-"),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          "scripts/plugin/content-factory-signed-release-gate.mjs",
        ),
        "--expected-version",
        "2.2.2",
        "--write-template-dir",
        outputDir,
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("templateDir=");
    for (const fileName of [
      "content-factory-production-catalog.template.json",
      "content-factory-production-bootstrap.template.json",
      "content-factory-fetch-cloud-evidence.template.json",
      "content-factory-gui-evidence.template.json",
      "content-factory-signed-release-gate.template.json",
    ]) {
      expect(fs.existsSync(path.join(outputDir, fileName))).toBe(true);
    }
    const command = JSON.parse(
      fs.readFileSync(
        path.join(
          outputDir,
          "content-factory-signed-release-gate.template.json",
        ),
        "utf8",
      ),
    ).command;
    expect(command).toContain("--check");
    expect(command).toContain("--evidence-dir");
    expect(command).toContain(outputDir);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            outputDir,
            "content-factory-signed-release-gate.template.json",
          ),
          "utf8",
        ),
      ).resultFile,
    ).toBe(CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME);
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
          "scripts/plugin/content-factory-signed-release-gate.mjs",
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

  it("CLI --evidence-dir 读取模板目录并默认写入 result JSON", () => {
    const outputDir = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "content-factory-signed-release-gate-evidence-dir-",
      ),
    );
    writeJsonFile(
      path.join(
        outputDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.catalog,
      ),
      READY_CATALOG,
    );
    writeJsonFile(
      path.join(
        outputDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.bootstrap,
      ),
      READY_BOOTSTRAP,
    );
    writeJsonFile(
      path.join(
        outputDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.fetchCloud,
      ),
      READY_FETCH_CLOUD,
    );
    writeJsonFile(
      path.join(
        outputDir,
        CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.guiEvidence,
      ),
      READY_GUI_EVIDENCE,
    );

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          "scripts/plugin/content-factory-signed-release-gate.mjs",
        ),
        "--evidence-dir",
        outputDir,
        "--expected-version",
        "2.2.2",
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    const resultPath = path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`evidenceDir=${outputDir}`);
    expect(result.stdout).toContain(`output=${resultPath}`);
    expect(JSON.parse(fs.readFileSync(resultPath, "utf8"))).toMatchObject({
      ready: true,
      status: "ready",
      missingRequirements: [],
    });
  });
});
