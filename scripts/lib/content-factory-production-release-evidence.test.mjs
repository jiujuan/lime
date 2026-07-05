import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildContentFactoryProductionReleaseEvidencePlan,
  fetchContentFactoryProductionReleaseEvidence,
  normalizeBootstrapTrustRootEvidence,
  normalizeMarketplaceCatalogEvidence,
  productionReleaseEvidenceMissingRequirementBlockers,
} from "./content-factory-production-release-evidence.mjs";

const PACKAGE_URL =
  "https://packages.example.com/content-factory-app-2.2.2.lapp";
const SECRET_TOKEN = "secret-token-should-not-leak";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
}

function jsonResponse(payload, status = 200) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : "";
      },
    },
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
  };
}

function marketplacePayload() {
  return {
    data: {
      items: [
        {
          appId: "other-app",
          package: {},
          pluginName: "other-app",
        },
        {
          appId: "content-factory-app",
          enabled: true,
          installState: "available",
          package: {
            manifestHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            packageHash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            packageUrl: PACKAGE_URL,
            releaseId: "release_2026_07_06",
            signatureProof: {
              algorithm: "Ed25519",
              payloadHash:
                "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
              publicKeyId: "content-factory-prod-root-2026",
              signature: "base64-signature",
              signedAt: "2026-07-06T00:00:00.000Z",
            },
            signatureRef:
              "sigstore:content-factory-app@2.2.2:release_2026_07_06",
          },
          pluginName: "content-factory-app",
          sourceKind: "plugin_catalog",
          version: "2.2.2",
        },
      ],
    },
  };
}

function bootstrapPayload() {
  return {
    data: {
      accessTokens: {
        latestCreatedAt: "2026-07-06T00:00:00.000Z",
      },
      session: {
        user: {
          email: "user@example.com",
        },
      },
      pluginSignatureTrustRoots: [
        {
          algorithm: "Ed25519",
          publicKey: "public-key",
          publicKeyId: "content-factory-prod-root-2026",
        },
      ],
    },
  };
}

describe("content factory production release evidence", () => {
  it("normalizes marketplace package refs into signed gate catalog evidence", () => {
    const catalog = normalizeMarketplaceCatalogEvidence({
      appId: "content-factory-app",
      marketplace: marketplacePayload().data,
    });

    expect(catalog.apps).toHaveLength(1);
    expect(catalog.apps[0]).toMatchObject({
      appId: "content-factory-app",
      appVersion: "2.2.2",
      identity: {
        packageUrl: PACKAGE_URL,
        releaseId: "release_2026_07_06",
        sourceKind: "cloud_release",
      },
      signatureProof: {
        publicKeyId: "content-factory-prod-root-2026",
      },
    });
  });

  it("keeps bootstrap evidence limited to plugin trust roots", () => {
    const bootstrap = normalizeBootstrapTrustRootEvidence({
      bootstrap: bootstrapPayload().data,
    });

    expect(bootstrap).toEqual({
      schemaVersion: "content-factory-production-bootstrap-evidence.v1",
      generatedAt: expect.any(String),
      pluginSignatureTrustRoots: [
        {
          algorithm: "Ed25519",
          publicKey: "public-key",
          publicKeyId: "content-factory-prod-root-2026",
        },
      ],
      source: {
        kind: "limecore_client_bootstrap",
      },
    });
    expect(JSON.stringify(bootstrap)).not.toContain("user@example.com");
    expect(JSON.stringify(bootstrap)).not.toContain("accessTokens");
  });

  it("does not fetch when explicit production inputs are missing", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-release-evidence-missing-"),
    );
    const fetcher = async () => {
      throw new Error("fetch should not be called");
    };
    const result = await fetchContentFactoryProductionReleaseEvidence({
      bootstrapOutputPath: path.join(outputDir, "bootstrap.json"),
      catalogOutputPath: path.join(outputDir, "catalog.json"),
      env: {
        PATH: process.env.PATH,
      },
      fetcher,
      input: {
        fetchProductionReleaseEvidence: true,
      },
      outputPath: path.join(outputDir, "summary.json"),
    });

    expect(result).toMatchObject({
      executable: false,
      missingKeys: ["apiBase", "tenantId", "studioToken"],
      requested: true,
      skippedReason: "missing_inputs",
      status: "blocked",
    });
    expect(fs.existsSync(path.join(outputDir, "catalog.json"))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, "bootstrap.json"))).toBe(false);
  });

  it("fetches current LimeCore catalog and bootstrap evidence without leaking token in summary", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-release-evidence-"),
    );
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({
        auth: options.headers.Authorization,
        url: String(url),
      });
      if (String(url).includes("/client/plugins/marketplace")) {
        return jsonResponse(marketplacePayload());
      }
      if (String(url).includes("/client/bootstrap")) {
        return jsonResponse(bootstrapPayload());
      }
      return jsonResponse({ message: "not found" }, 404);
    };

    const result = await fetchContentFactoryProductionReleaseEvidence({
      bootstrapOutputPath: path.join(outputDir, "bootstrap.json"),
      catalogOutputPath: path.join(outputDir, "catalog.json"),
      env: {
        LIME_AGENT_APP_STUDIO_TOKEN: SECRET_TOKEN,
        PATH: process.env.PATH,
      },
      fetcher,
      input: {
        apiBase: "https://lime-api.example.com/api",
        fetchProductionReleaseEvidence: true,
        tenantId: "tenant-0001",
      },
      outputPath: path.join(outputDir, "summary.json"),
      timeoutMs: 5000,
    });

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.auth === `Bearer ${SECRET_TOKEN}`)).toBe(
      true,
    );
    expect(calls[0].url).toContain(
      "/v1/public/tenants/tenant-0001/client/plugins/marketplace?query=content-factory-app",
    );
    expect(result).toMatchObject({
      bootstrap: {
        matchingTrustRootPresent: true,
        matchingTrustRootPublicKeyPresent: true,
        trustRootCount: 1,
      },
      catalog: {
        appFound: true,
        packageUrlPresent: true,
        packageUrlRemoteHttps: true,
        signatureProofPresent: true,
        sourceKindCloudRelease: true,
      },
      missingRequirements: [],
      ready: true,
      status: "ready",
    });
    expect(
      readJson(path.join(outputDir, "catalog.json")).apps[0],
    ).toMatchObject({
      identity: {
        packageUrl: PACKAGE_URL,
      },
    });
    expect(
      readJson(path.join(outputDir, "bootstrap.json"))
        .pluginSignatureTrustRoots,
    ).toHaveLength(1);
    const summaryText = fs.readFileSync(
      path.join(outputDir, "summary.json"),
      "utf8",
    );
    expect(summaryText).not.toContain(SECRET_TOKEN);
    expect(summaryText).not.toContain(PACKAGE_URL);
    expect(summaryText).not.toContain("user@example.com");
  });

  it("blocks fetched evidence when catalog signature proof cannot be matched to a bootstrap public key", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-release-evidence-blocked-"),
    );
    const fetcher = async (url) => {
      if (String(url).includes("/client/plugins/marketplace")) {
        return jsonResponse(marketplacePayload());
      }
      if (String(url).includes("/client/bootstrap")) {
        return jsonResponse({
          data: {
            pluginSignatureTrustRoots: [
              {
                algorithm: "Ed25519",
                publicKeyId: "different-root",
              },
            ],
            session: {
              user: {
                email: "user@example.com",
              },
            },
          },
        });
      }
      return jsonResponse({ message: "not found" }, 404);
    };

    const result = await fetchContentFactoryProductionReleaseEvidence({
      bootstrapOutputPath: path.join(outputDir, "bootstrap.json"),
      catalogOutputPath: path.join(outputDir, "catalog.json"),
      env: {
        LIME_AGENT_APP_STUDIO_TOKEN: SECRET_TOKEN,
        PATH: process.env.PATH,
      },
      fetcher,
      input: {
        apiBase: "https://lime-api.example.com/api",
        fetchProductionReleaseEvidence: true,
        tenantId: "tenant-0001",
      },
      outputPath: path.join(outputDir, "summary.json"),
      timeoutMs: 5000,
    });

    expect(result).toMatchObject({
      bootstrap: {
        matchingTrustRootPresent: false,
        trustRootCount: 1,
      },
      catalog: {
        signatureProofPublicKeyId: "content-factory-prod-root-2026",
      },
      missingRequirements: ["bootstrapMatchingTrustRoot"],
      ready: false,
      status: "blocked",
    });
    const summaryText = fs.readFileSync(
      path.join(outputDir, "summary.json"),
      "utf8",
    );
    expect(summaryText).not.toContain(SECRET_TOKEN);
    expect(summaryText).not.toContain(PACKAGE_URL);
    expect(summaryText).not.toContain("user@example.com");
  });

  it("maps missing release evidence requirements to production blocker codes", () => {
    expect(
      productionReleaseEvidenceMissingRequirementBlockers({
        missingRequirements: [
          "catalogSignatureProofPublicKeyId",
          "bootstrapMatchingTrustRootPublicKey",
          "unknownRequirement",
        ],
      }),
    ).toEqual([
      {
        code: "production_release_evidence_catalog_signature_proof_public_key_id_missing",
        detail:
          "Production release evidence missing requirement: catalogSignatureProofPublicKeyId.",
      },
      {
        code: "production_release_evidence_bootstrap_matching_trust_root_public_key_missing",
        detail:
          "Production release evidence missing requirement: bootstrapMatchingTrustRootPublicKey.",
      },
    ]);
  });

  it("prints non-sensitive missing input keys from the CLI", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-release-evidence-cli-"),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(
          repoRoot(),
          "scripts/plugin/content-factory-production-release-evidence.mjs",
        ),
        "--catalog-output",
        path.join(outputDir, "catalog.json"),
        "--bootstrap-output",
        path.join(outputDir, "bootstrap.json"),
        "--output",
        path.join(outputDir, "summary.json"),
        "--check",
      ],
      {
        cwd: repoRoot(),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("status=blocked");
    expect(result.stdout).toContain("missingKeys=apiBase,tenantId,studioToken");
    expect(result.stdout).not.toContain(SECRET_TOKEN);
  });

  it("builds a fail-closed plan without raw API values", () => {
    const plan = buildContentFactoryProductionReleaseEvidencePlan({
      env: {
        LIME_AGENT_APP_STUDIO_TOKEN: SECRET_TOKEN,
      },
      input: {
        apiBase: "https://lime-api.example.com/api",
        fetchProductionReleaseEvidence: true,
        tenantId: "tenant-0001",
      },
    });

    expect(plan).toMatchObject({
      executable: true,
      inputs: {
        apiBase: {
          configured: true,
          envName: null,
        },
        studioToken: {
          configured: true,
          envName: "LIME_AGENT_APP_STUDIO_TOKEN",
        },
        tenantId: {
          configured: true,
          envName: null,
        },
      },
      requested: true,
      status: "ready_to_run",
    });
    expect(JSON.stringify(plan)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(plan)).not.toContain("tenant-0001");
    expect(JSON.stringify(plan)).not.toContain("lime-api.example.com");
  });
});
