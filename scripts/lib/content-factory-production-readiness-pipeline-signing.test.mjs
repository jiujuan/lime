import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTENT_FACTORY_PRODUCTION_READINESS_PIPELINE_FILE_NAME,
  runContentFactoryProductionReadinessPipeline,
} from "./content-factory-production-readiness-pipeline.mjs";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const RELEASE_ID = "release_2026_07_06";
const PUBLIC_KEY_ID = "content-factory-prod-root-2026";
const PACKAGE_URL =
  "https://packages.example.com/content-factory-app-2.2.2.lapp";
const PRIVATE_KEY = "test-only-private-key-placeholder";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function commandValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

function createPipelineFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-factory-production-signing-pipeline-"),
  );
  const contentFactoryDir = path.join(root, "content-factory-app");
  fs.mkdirSync(path.join(contentFactoryDir, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(contentFactoryDir, "scripts", "sign-release.mjs"),
    "#!/usr/bin/env node\n",
    "utf8",
  );
  writeJson(path.join(contentFactoryDir, "package.json"), {
    name: "content-factory-app",
    version: "2.2.2",
  });
  return {
    contentFactoryDir,
    outputDir: path.join(root, "out"),
    preflightScript: path.join(root, "fake-preflight.mjs"),
    studioCli: path.join(root, "fake-studio-cli.mjs"),
    studioDir: path.join(root, "studio"),
  };
}

function studioDryRun(blockers = []) {
  return {
    mode: "dry-run",
    plan: {
      appId: "content-factory-app",
      channel: "stable",
      version: "2.2.2",
    },
    releaseReadiness: {
      appId: "content-factory-app",
      blockers,
      checks: {
        manifest: {
          manifestHash: MANIFEST_HASH,
          source: "app-server-inspect",
        },
        package: {
          packageHash: PACKAGE_HASH,
          version: "2.2.2",
        },
      },
      ready: blockers.length === 0,
      warnings: [],
    },
  };
}

function blockedPreflight() {
  return {
    schemaVersion: 1,
    appId: "content-factory-app",
    expectedVersion: "2.2.2",
    status: "blocked",
    ready: false,
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
      appSignatureYamlPresent: true,
      publicKeyId: PUBLIC_KEY_ID,
      signatureRef: `sigstore:content-factory-app@2.2.2:${RELEASE_ID}`,
      trustRootPresent: true,
    },
    missingRequirements: [
      {
        code: "production_catalog_missing",
        detail: "production catalog required",
      },
    ],
  };
}

describe("content factory production readiness signing proof generation", () => {
  it("generates signature proof only when explicitly requested and keeps evidence redacted", () => {
    const fixture = createPipelineFixture();
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({ args, command, env: options.env || {} });
      if (args[0] === fixture.studioCli) {
        const appSignaturePath = commandValue(args, "--app-signature");
        return {
          status: 0,
          stdout: JSON.stringify(
            appSignaturePath
              ? studioDryRun([])
              : studioDryRun([
                  {
                    code: "production_app_signature_yaml_missing_or_invalid",
                  },
                ]),
          ),
          stderr: "",
        };
      }
      if (args[0].endsWith("sign-release.mjs")) {
        expect(commandValue(args, "--package-url")).toBe(PACKAGE_URL);
        expect(commandValue(args, "--package-hash")).toBe(PACKAGE_HASH);
        expect(commandValue(args, "--manifest-hash")).toBe(MANIFEST_HASH);
        expect(commandValue(args, "--release-id")).toBe(RELEASE_ID);
        expect(commandValue(args, "--public-key-id")).toBe(PUBLIC_KEY_ID);
        expect(commandValue(args, "--private-key-env")).toBe(
          "CUSTOM_SIGNING_PRIVATE_KEY_PEM",
        );
        expect(options.env.CUSTOM_SIGNING_PRIVATE_KEY_PEM).toBe(PRIVATE_KEY);
        fs.writeFileSync(
          commandValue(args, "--out"),
          'signature:\n  package:\n    schemaVersion: "plugin-cloud-release-signature/v1"\n',
          "utf8",
        );
        writeJson(commandValue(args, "--trust-root-out"), {
          algorithm: "RSASSA-PKCS1-v1_5-SHA256",
          publicKey: "public-key",
          publicKeyId: PUBLIC_KEY_ID,
        });
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[0] === fixture.preflightScript) {
        expect(commandValue(args, "--app-signature")).toBe(
          path.join(fixture.contentFactoryDir, "app.signature.yaml"),
        );
        expect(commandValue(args, "--trust-root")).toBe(
          path.join(
            fixture.contentFactoryDir,
            "plugin-signature-trust-root.json",
          ),
        );
        writeJson(commandValue(args, "--output"), blockedPreflight());
        return { status: 0, stdout: "preflight ok\n", stderr: "" };
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = runContentFactoryProductionReadinessPipeline({
      contentFactoryDir: fixture.contentFactoryDir,
      env: {
        CUSTOM_SIGNING_PRIVATE_KEY_PEM: PRIVATE_KEY,
        PATH: process.env.PATH,
      },
      expectedVersion: "2.2.2",
      generateSignatureProof: true,
      outputDir: fixture.outputDir,
      packageUrl: PACKAGE_URL,
      preflightScript: fixture.preflightScript,
      publicKeyId: PUBLIC_KEY_ID,
      releaseId: RELEASE_ID,
      runner,
      signingPrivateKeyEnv: "CUSTOM_SIGNING_PRIVATE_KEY_PEM",
      studioCli: fixture.studioCli,
      studioDir: fixture.studioDir,
    });

    expect(calls.map((call) => path.basename(call.args[0]))).toEqual([
      "fake-studio-cli.mjs",
      "sign-release.mjs",
      "fake-studio-cli.mjs",
      "fake-preflight.mjs",
    ]);
    expect(result.pipeline.steps.signingProof).toMatchObject({
      commandOk: true,
      executed: true,
      requested: true,
      status: "ready",
    });
    expect(
      result.pipeline.operatorReadiness.inputs.signingPrivateKey,
    ).toMatchObject({
      configured: true,
      envConfigured: true,
      envName: "CUSTOM_SIGNING_PRIVATE_KEY_PEM",
    });
    expect(result.pipeline.steps.signingProof.step.args).toContain(
      "<redacted>",
    );
    expect(result.pipeline.blockers.map((item) => item.code)).not.toContain(
      "production_signature_generation_inputs_missing",
    );
    const pipelineText = fs.readFileSync(
      path.join(
        fixture.outputDir,
        CONTENT_FACTORY_PRODUCTION_READINESS_PIPELINE_FILE_NAME,
      ),
      "utf8",
    );
    const signingProofText = fs.readFileSync(result.files.signingProof, "utf8");
    expect(pipelineText).not.toContain(PACKAGE_URL);
    expect(pipelineText).not.toContain(PRIVATE_KEY);
    expect(signingProofText).not.toContain(PACKAGE_URL);
    expect(signingProofText).not.toContain(PRIVATE_KEY);
  });

  it("fails closed without running sign-release when explicit signing inputs are incomplete", () => {
    const fixture = createPipelineFixture();
    const calls = [];
    const runner = (command, args) => {
      calls.push({ args, command });
      if (args[0] === fixture.studioCli) {
        return {
          status: 0,
          stdout: JSON.stringify(studioDryRun([])),
          stderr: "",
        };
      }
      if (args[0] === fixture.preflightScript) {
        writeJson(commandValue(args, "--output"), blockedPreflight());
        return { status: 0, stdout: "preflight ok\n", stderr: "" };
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = runContentFactoryProductionReadinessPipeline({
      contentFactoryDir: fixture.contentFactoryDir,
      expectedVersion: "2.2.2",
      generateSignatureProof: true,
      outputDir: fixture.outputDir,
      preflightScript: fixture.preflightScript,
      publicKeyId: PUBLIC_KEY_ID,
      releaseId: RELEASE_ID,
      runner,
      studioCli: fixture.studioCli,
      studioDir: fixture.studioDir,
    });

    expect(calls.map((call) => path.basename(call.args[0]))).toEqual([
      "fake-studio-cli.mjs",
      "fake-preflight.mjs",
    ]);
    expect(result.pipeline.steps.signingProof).toMatchObject({
      requested: true,
      skippedReason: "missing_inputs",
      status: "blocked",
    });
    expect(result.pipeline.steps.signingProof.missingKeys).toEqual(
      expect.arrayContaining(["packageUrl", "signingPrivateKey"]),
    );
    expect(result.pipeline.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_signature_generation_inputs_missing",
        }),
      ]),
    );
  });
});
