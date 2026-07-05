import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildContentFactoryProductionEvidenceBundle,
  CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
} from "./content-factory-production-evidence-bundle.mjs";
import {
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
} from "./plugin-content-factory-signed-release-gate-constants.mjs";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const READY_PREFLIGHT = {
  schemaVersion: 1,
  appId: "content-factory-app",
  expectedVersion: "2.2.2",
  status: "ready",
  ready: true,
  package: {
    appId: "content-factory-app",
    exists: true,
    manifestHash: MANIFEST_HASH,
    missingEntries: [],
    packageHash: PACKAGE_HASH,
    validZip: true,
    version: "2.2.2",
  },
  appServerInspect: {
    manifestHash: MANIFEST_HASH,
    packageHash: PACKAGE_HASH,
    present: true,
    sourceKind: "local_folder",
  },
  signature: {
    algorithm: "Ed25519",
    appSignatureYamlPresent: true,
    payloadHash:
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    payloadHashValid: true,
    publicKeyId: "content-factory-prod-root-2026",
    signaturePresent: true,
    signatureRef: "sigstore:content-factory-app@2.2.2:prod",
    signedAt: "2026-07-05T00:00:00.000Z",
    trustRootPresent: true,
    trustRootPublicKeyId: "content-factory-prod-root-2026",
  },
  missingRequirements: [],
};

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("content factory production evidence bundle", () => {
  it("is exposed as an explicit npm production evidence bundler", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(
      packageJson.scripts["plugin:content-factory-production-evidence-bundle"],
    ).toBe(
      "node scripts/plugin/content-factory-production-evidence-bundle.mjs",
    );
  });

  it("copies supplied evidence into signed gate filenames and removes stale omitted files", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-evidence-bundle-"),
    );
    const sourceDir = path.join(rootDir, "source");
    const outputDir = path.join(rootDir, "bundle");
    const preflightPath = path.join(sourceDir, "preflight.json");
    const staleCatalogPath = path.join(
      outputDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES.catalog,
    );
    writeJson(preflightPath, READY_PREFLIGHT);
    writeJson(staleCatalogPath, { stale: true });

    const result = buildContentFactoryProductionEvidenceBundle({
      expectedVersion: "2.2.2",
      outputDir,
      preflightPath,
    });

    expect(fs.existsSync(result.files.preflight)).toBe(true);
    expect(fs.existsSync(staleCatalogPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(result.files.preflight, "utf8"))).toEqual(
      READY_PREFLIGHT,
    );
    expect(
      JSON.parse(fs.readFileSync(result.files.result, "utf8")),
    ).toMatchObject({
      ready: false,
      status: "blocked",
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({ code: "production_catalog_missing" }),
      ]),
    });
    expect(
      JSON.parse(fs.readFileSync(result.files.bundle, "utf8")),
    ).toMatchObject({
      gate: {
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        ready: false,
        resultSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        status: "blocked",
      },
      inputs: {
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        slots: {
          catalog: { present: false, sha256: null },
          preflight: {
            present: true,
            sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          },
        },
      },
      sources: {
        catalog: { present: false },
        preflight: {
          present: true,
          sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          size: expect.any(Number),
        },
      },
    });
  });

  it("CLI --check writes blocked gate result and returns non-zero", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-evidence-bundle-cli-"),
    );
    const preflightPath = path.join(rootDir, "preflight.json");
    const outputDir = path.join(rootDir, "bundle");
    writeJson(preflightPath, READY_PREFLIGHT);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve(
          "scripts/plugin/content-factory-production-evidence-bundle.mjs",
        ),
        "--preflight",
        preflightPath,
        "--expected-version",
        "2.2.2",
        "--output-dir",
        outputDir,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("status=blocked");
    expect(
      fs.existsSync(
        path.join(
          outputDir,
          CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          outputDir,
          CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
        ),
      ),
    ).toBe(true);
  });
});
