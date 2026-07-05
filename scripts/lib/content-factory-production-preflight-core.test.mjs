import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SIGNATURE_PROOF_SCHEMA,
  buildReleaseSignaturePayload,
  sha256Digest,
} from "./content-factory-production-signature-verifier.mjs";
import {
  buildContentFactoryProductionPreflight,
  extractContentFactoryPackageFile,
  inspectContentFactoryPackageFile,
  writeJsonFile,
} from "./content-factory-production-preflight-core.mjs";

const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PACKAGE_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const PACKAGE_URL =
  "https://updates.example.com/plugins/content-factory-app-2.2.2.lapp";
const RELEASE_ID = "plugin-release-test-2.2.2";
const SIGNATURE_REF = `sigstore:content-factory-app@2.2.2:${RELEASE_ID}`;
const SIGNED_AT = "2026-07-05T00:00:00.000Z";
const PUBLIC_KEY_ID = "content-factory-prod-root-2026";

function bufferFromString(value) {
  return Buffer.from(value, "utf8");
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, rawContent] of Object.entries(entries)) {
    const nameBuffer = bufferFromString(name);
    const content = Buffer.isBuffer(rawContent)
      ? rawContent
      : bufferFromString(rawContent);
    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(content.length),
      writeUInt32(content.length),
      writeUInt16(nameBuffer.length),
      writeUInt16(0),
      nameBuffer,
    ]);
    localParts.push(localHeader, content);
    centralParts.push(
      Buffer.concat([
        writeUInt32(0x02014b50),
        writeUInt16(20),
        writeUInt16(20),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt32(0),
        writeUInt32(content.length),
        writeUInt32(content.length),
        writeUInt16(nameBuffer.length),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt32(0),
        writeUInt32(localOffset),
        nameBuffer,
      ]),
    );
    localOffset += localHeader.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(Object.keys(entries).length),
    writeUInt16(Object.keys(entries).length),
    writeUInt32(centralDirectory.length),
    writeUInt32(localOffset),
    writeUInt16(0),
  ]);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function requiredPackageEntries(pluginJson = {}) {
  return {
    "plugin.json": JSON.stringify({
      schemaVersion: "lime.plugin.package.v1",
      id: "content-factory-app",
      version: "2.2.2",
      displayName: "内容工厂",
      contributions: {
        runtime: "./app.runtime.yaml",
        workbench: "./app.workbench.yaml",
      },
      ...pluginJson,
    }),
    "app.runtime.yaml":
      "agentRuntime:\n  bridge:\n    kind: app-server-json-rpc\n",
    "app.workbench.yaml": "profiles:\n  - workbench\n",
    "app.operations.yaml": "operations: []\n",
    "app.requirements.yaml": "requirements: []\n",
    "app.boundary.yaml": "boundaries: []\n",
    "app.install.yaml": "install: {}\n",
    "src/runtime/content-factory-worker.mjs": "export {};\n",
    "artifacts/content-factory-workspace-patch.schema.json": "{}\n",
    "examples/workspace-patch.sample.json": "{}\n",
    "examples/runtime-request.sample.json": "{}\n",
    "locales/zh-CN.json": "{}\n",
    "locales/zh-TW.json": "{}\n",
    "locales/en-US.json": "{}\n",
    "locales/ja-JP.json": "{}\n",
    "locales/ko-KR.json": "{}\n",
    "resources/icons/icon.svg": "<svg />\n",
  };
}

function writePackageFixture(rootDir) {
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "content-factory-app", version: "2.2.2" }),
    "utf8",
  );
  const packageDir = path.join(rootDir, "dist-package");
  fs.mkdirSync(packageDir, { recursive: true });
  const packageFile = path.join(packageDir, "content-factory-app-2.2.2.lapp");
  fs.writeFileSync(packageFile, buildStoredZip(requiredPackageEntries()));
  return packageFile;
}

function buildReleaseSignatureFixture({ packageHash, overrides = {} }) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const release = {
    appId: "content-factory-app",
    channel: "stable",
    manifestHash: MANIFEST_HASH,
    packageHash,
    packageUrl: PACKAGE_URL,
    releaseId: RELEASE_ID,
    signatureRef: SIGNATURE_REF,
    tenantEnablementRef: null,
    tenantId: null,
    version: "2.2.2",
    ...overrides.release,
  };
  const proofDraft = {
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    publicKeyId: PUBLIC_KEY_ID,
    schemaVersion: SIGNATURE_PROOF_SCHEMA,
    signedAt: SIGNED_AT,
    ...overrides.proofDraft,
  };
  const payload = buildReleaseSignaturePayload(release, proofDraft);
  const signature = sign("sha256", Buffer.from(payload), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64");
  const proof = {
    ...proofDraft,
    payloadHash: sha256Digest(payload),
    signature,
    ...overrides.proof,
  };
  const trustRoot = {
    algorithm: proof.algorithm,
    appIds: ["content-factory-app"],
    publicKey: publicKeyPem,
    publicKeyId: proof.publicKeyId,
    ...overrides.trustRoot,
  };
  return { proof, release, trustRoot };
}

function writeProductionInputs(rootDir, packageHash, options = {}) {
  const catalogPath = path.join(rootDir, "catalog.json");
  const bootstrapPath = path.join(rootDir, "bootstrap.json");
  const fetchCloudPath = path.join(rootDir, "fetch-cloud.json");
  const appSignaturePath = path.join(rootDir, "app.signature.yaml");
  const trustRootPath = path.join(rootDir, "plugin-signature-trust-root.json");
  const signatureFixture = buildReleaseSignatureFixture({
    packageHash,
    overrides: options.signatureOverrides,
  });
  writeJsonFile(catalogPath, {
    apps: [
      {
        appId: "content-factory-app",
        appVersion: "2.2.2",
        identity: {
          channel: signatureFixture.release.channel,
          manifestHash: MANIFEST_HASH,
          packageHash,
          releaseId: signatureFixture.release.releaseId,
          signatureRef: signatureFixture.release.signatureRef,
          sourceKind: "cloud_release",
          sourceUri: signatureFixture.release.packageUrl,
        },
        signatureProof: {
          algorithm: signatureFixture.proof.algorithm,
          payloadHash: signatureFixture.proof.payloadHash,
          publicKeyId: signatureFixture.proof.publicKeyId,
          schemaVersion: signatureFixture.proof.schemaVersion,
          signature: signatureFixture.proof.signature,
          signedAt: signatureFixture.proof.signedAt,
        },
      },
    ],
  });
  writeJsonFile(bootstrapPath, {
    pluginSignatureTrustRoots: [
      {
        algorithm: signatureFixture.trustRoot.algorithm,
        publicKey: signatureFixture.trustRoot.publicKey,
        publicKeyId: signatureFixture.trustRoot.publicKeyId,
      },
    ],
  });
  writeJsonFile(fetchCloudPath, {
    manifestHashMatched: true,
    packageHashMatched: true,
    packageVerificationStatus: "verified",
    signatureVerificationStatus: "verified",
    sourceKind: "cloud_release",
    status: "ready",
  });
  fs.writeFileSync(
    appSignaturePath,
    [
      "signature:",
      "  package:",
      `    schemaVersion: "${signatureFixture.proof.schemaVersion}"`,
      `    signatureRef: "${signatureFixture.release.signatureRef}"`,
      `    publicKeyId: "${signatureFixture.proof.publicKeyId}"`,
      `    algorithm: "${signatureFixture.proof.algorithm}"`,
      `    signature: "${signatureFixture.proof.signature}"`,
      `    payloadHash: "${signatureFixture.proof.payloadHash}"`,
      `    signedAt: "${signatureFixture.proof.signedAt}"`,
      "",
    ].join("\n"),
    "utf8",
  );
  writeJsonFile(trustRootPath, signatureFixture.trustRoot);
  return {
    appSignaturePath,
    bootstrapPath,
    catalogPath,
    fetchCloudPath,
    signatureFixture,
    trustRootPath,
  };
}

function buildReadyPreflightInput(rootPrefix) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), rootPrefix));
  const packageFile = writePackageFixture(rootDir);
  const inspected = inspectContentFactoryPackageFile(packageFile);
  const productionInputs = writeProductionInputs(
    rootDir,
    inspected.packageHash,
  );
  return {
    input: {
      appServerInspect: {
        appDir: path.join(rootDir, "extracted"),
        manifestHash: MANIFEST_HASH,
        packageHash: PACKAGE_HASH,
        sourceKind: "local_folder",
      },
      contentFactoryDir: rootDir,
      packageFile,
      ...productionInputs,
    },
    inspected,
    productionInputs,
    rootDir,
  };
}

describe("content factory production preflight", () => {
  it("读取 .lapp 包事实并解包到安全目录", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-package-"),
    );
    const packageFile = writePackageFixture(rootDir);

    const inspected = inspectContentFactoryPackageFile(packageFile);
    expect(inspected).toMatchObject({
      appId: "content-factory-app",
      missingEntries: [],
      validZip: true,
      version: "2.2.2",
    });
    expect(inspected.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const extractedRoot = extractContentFactoryPackageFile(
      packageFile,
      path.join(rootDir, "extracted"),
    );
    expect(fs.existsSync(path.join(extractedRoot, "plugin.json"))).toBe(true);
  });

  it("缺少 App Server current inspect 时保持 blocked", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-blocked-"),
    );
    const packageFile = writePackageFixture(rootDir);

    const result = buildContentFactoryProductionPreflight({
      contentFactoryDir: rootDir,
      packageFile,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      appServerInspect: { present: false },
      missingRequirements: expect.arrayContaining([
        expect.objectContaining({
          code: "production_app_server_manifest_inspect_missing",
        }),
        expect.objectContaining({
          code: "production_manifest_hash_invalid",
        }),
      ]),
    });
    expect(result.package.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.package.manifestHash).toBe("");
  });

  it("生产发布输入齐备时 ready", () => {
    const { input, inspected } = buildReadyPreflightInput(
      "content-factory-production-preflight-ready-",
    );

    const result = buildContentFactoryProductionPreflight(input);

    expect(result).toMatchObject({
      ready: true,
      status: "ready",
      package: {
        manifestHash: MANIFEST_HASH,
        packageHash: inspected.packageHash,
      },
      signature: {
        schemaVersion: SIGNATURE_PROOF_SCHEMA,
        signatureCryptographicVerificationStatus: "verified",
        signaturePayloadHashMatched: true,
        signatureVerificationFailureCodes: [],
        trustRootPublicKeyPresent: true,
      },
      missingRequirements: [],
    });
  });

  it("production catalog 签名 proof 与 app.signature.yaml 不一致时保持 blocked", () => {
    const { input, productionInputs } = buildReadyPreflightInput(
      "content-factory-production-preflight-catalog-proof-",
    );
    const catalog = JSON.parse(
      fs.readFileSync(productionInputs.catalogPath, "utf8"),
    );
    catalog.apps[0].identity.signatureRef =
      "sigstore:content-factory-app@2.2.2:wrong";
    catalog.apps[0].signatureProof = {
      algorithm: "RSA-PSS-SHA256",
      payloadHash:
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      publicKeyId: "content-factory-prod-root-wrong",
      signature: "CATALOG_SIGNATURE_SHOULD_NOT_LEAK",
      signedAt: "2026-07-06T00:00:00.000Z",
    };
    writeJsonFile(productionInputs.catalogPath, catalog);

    const result = buildContentFactoryProductionPreflight(input);

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      catalog: {
        signatureProofAlgorithm: "RSA-PSS-SHA256",
        signatureProofPayloadHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        signatureProofPublicKeyId: "content-factory-prod-root-wrong",
        signatureProofSignedAt: "2026-07-06T00:00:00.000Z",
        signatureRef: "sigstore:content-factory-app@2.2.2:wrong",
      },
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_signature_catalog_signature_ref_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_catalog_public_key_id_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_catalog_algorithm_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_catalog_payload_hash_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_catalog_signed_at_mismatch",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(
      "CATALOG_SIGNATURE_SHOULD_NOT_LEAK",
    );
  });

  it("production catalog 缺 releaseId 或 signatureRef 未绑定 releaseId 时保持 blocked", () => {
    const { input, productionInputs } = buildReadyPreflightInput(
      "content-factory-production-preflight-release-id-",
    );
    const catalog = JSON.parse(
      fs.readFileSync(productionInputs.catalogPath, "utf8"),
    );
    delete catalog.apps[0].identity.releaseId;
    catalog.apps[0].identity.signatureRef =
      "sigstore:content-factory-app@2.2.2";
    writeJsonFile(productionInputs.catalogPath, catalog);

    const result = buildContentFactoryProductionPreflight(input);

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_catalog_release_id_missing",
        }),
        expect.objectContaining({
          code: "production_signature_catalog_signature_ref_mismatch",
        }),
      ]),
    );

    catalog.apps[0].identity.releaseId = RELEASE_ID;
    writeJsonFile(productionInputs.catalogPath, catalog);

    const mismatchResult = buildContentFactoryProductionPreflight(input);
    expect(mismatchResult.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_catalog_signature_ref_release_id_mismatch",
        }),
      ]),
    );
  });

  it("app.signature.yaml 存在但 proof 不完整时保持 blocked", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-signature-"),
    );
    const packageFile = writePackageFixture(rootDir);
    const inspected = inspectContentFactoryPackageFile(packageFile);
    const productionInputs = writeProductionInputs(
      rootDir,
      inspected.packageHash,
    );
    fs.writeFileSync(
      productionInputs.appSignaturePath,
      [
        "signature:",
        "  package:",
        '    signatureRef: "sigstore:content-factory-app@2.2.2:prod"',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = buildContentFactoryProductionPreflight({
      appServerInspect: {
        appDir: path.join(rootDir, "extracted"),
        manifestHash: MANIFEST_HASH,
        packageHash: PACKAGE_HASH,
        sourceKind: "local_folder",
      },
      contentFactoryDir: rootDir,
      packageFile,
      ...productionInputs,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      signature: {
        appSignatureYamlPresent: true,
        payloadHashValid: false,
        publicKeyId: null,
        signaturePresent: false,
        signedAtValid: false,
      },
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_signature_public_key_id_missing",
        }),
        expect.objectContaining({
          code: "production_signature_algorithm_missing",
        }),
        expect.objectContaining({
          code: "production_signature_value_missing",
        }),
        expect.objectContaining({
          code: "production_signature_payload_hash_invalid",
        }),
        expect.objectContaining({
          code: "production_signature_signed_at_invalid",
        }),
      ]),
    );
  });

  it("trust root 算法或 publicKeyId 不匹配时保持 blocked", () => {
    const rootDir = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "content-factory-production-preflight-trust-root-",
      ),
    );
    const packageFile = writePackageFixture(rootDir);
    const inspected = inspectContentFactoryPackageFile(packageFile);
    const productionInputs = writeProductionInputs(
      rootDir,
      inspected.packageHash,
    );
    writeJsonFile(productionInputs.trustRootPath, {
      alg: "RSA-MD5",
      public_key_id: "wrong-root",
    });

    const result = buildContentFactoryProductionPreflight({
      appServerInspect: {
        appDir: path.join(rootDir, "extracted"),
        manifestHash: MANIFEST_HASH,
        packageHash: PACKAGE_HASH,
        sourceKind: "local_folder",
      },
      contentFactoryDir: rootDir,
      packageFile,
      ...productionInputs,
    });

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      signature: {
        algorithm: "RSASSA-PKCS1-v1_5-SHA256",
        signatureCryptographicVerificationStatus: "not_attempted",
        trustRootAlgorithm: "RSA-MD5",
        trustRootAlgorithmSupported: false,
        trustRootPublicKeyPresent: false,
        trustRootPublicKeyId: "wrong-root",
      },
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_trust_root_algorithm_unsupported",
        }),
        expect.objectContaining({
          code: "production_signature_trust_root_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_trust_root_algorithm_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_trust_root_public_key_missing",
        }),
      ]),
    );
  });

  it("payloadHash 与 canonical release payload 不一致时保持 blocked", () => {
    const { input, productionInputs } = buildReadyPreflightInput(
      "content-factory-production-preflight-payload-hash-",
    );
    const raw = fs.readFileSync(input.appSignaturePath, "utf8");
    fs.writeFileSync(
      input.appSignaturePath,
      raw.replace(
        /payloadHash: "sha256:[a-f0-9]{64}"/,
        'payloadHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"',
      ),
      "utf8",
    );

    const result = buildContentFactoryProductionPreflight(input);

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      signature: {
        signatureCryptographicVerificationStatus: "failed",
        signaturePayloadHashMatched: false,
      },
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_signature_payload_hash_mismatch",
        }),
        expect.objectContaining({
          code: "production_signature_cryptographic_verification_failed",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(
      productionInputs.signatureFixture.proof.signature,
    );
  });

  it("trust root 缺少 publicKey 时不能只靠 publicKeyId 过门禁", () => {
    const { input } = buildReadyPreflightInput(
      "content-factory-production-preflight-public-key-",
    );
    const trustRoot = JSON.parse(fs.readFileSync(input.trustRootPath, "utf8"));
    delete trustRoot.publicKey;
    writeJsonFile(input.trustRootPath, trustRoot);

    const result = buildContentFactoryProductionPreflight(input);

    expect(result).toMatchObject({
      ready: false,
      status: "blocked",
      signature: {
        signatureCryptographicVerificationStatus: "not_attempted",
        trustRootPublicKeyPresent: false,
      },
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_signature_trust_root_public_key_missing",
        }),
      ]),
    );
  });

  it("记录非敏感发布环境 readiness 但不泄漏值", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-env-"),
    );
    const packageFile = writePackageFixture(rootDir);

    const result = buildContentFactoryProductionPreflight({
      contentFactoryDir: rootDir,
      env: {
        AGENT_APP_SIGNING_PRIVATE_KEY_PEM: "PRIVATE_KEY_SHOULD_NOT_LEAK",
        CONTENT_FACTORY_PACKAGE_URL:
          "https://packages.example.com/content-factory-app-2.2.2.lapp",
        LIME_AGENT_APP_STUDIO_API_BASE: "https://api.example.com",
        LIME_AGENT_APP_STUDIO_TOKEN: "TOKEN_SHOULD_NOT_LEAK",
        LIMECORE_TENANT_ID: "tenant-prod",
      },
      packageFile,
    });

    expect(result.publishReadiness).toMatchObject({
      configured: true,
      requirements: expect.arrayContaining([
        expect.objectContaining({
          configured: true,
          key: "signingPrivateKey",
        }),
        expect.objectContaining({
          key: "packageUrl",
          remoteHttps: true,
        }),
      ]),
    });
    const serialized = JSON.stringify(result.publishReadiness);
    expect(serialized).not.toContain("PRIVATE_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("TOKEN_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("packages.example.com");
  });

  it("发布环境 readiness 支持 Studio 与 LimeCore env 别名", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-env-alias-"),
    );
    const packageFile = writePackageFixture(rootDir);

    const result = buildContentFactoryProductionPreflight({
      contentFactoryDir: rootDir,
      env: {
        CONTENT_FACTORY_PACKAGE_URL:
          "https://packages.example.com/content-factory-app-2.2.2.lapp",
        LIME_AGENT_APP_STUDIO_TOKEN: "TOKEN_SHOULD_NOT_LEAK",
        LIME_CLOUD_TENANT_ID: "tenant-prod",
        LIMECORE_API_BASE_URL: "https://api.example.com",
        PLUGIN_SIGNING_PRIVATE_KEY_PEM: "PRIVATE_KEY_SHOULD_NOT_LEAK",
      },
      packageFile,
    });

    expect(result.publishReadiness).toMatchObject({
      configured: true,
      requirements: expect.arrayContaining([
        expect.objectContaining({
          configured: true,
          env: ["LIMECORE_TENANT_ID", "LIME_CLOUD_TENANT_ID"],
          key: "tenantId",
        }),
        expect.objectContaining({
          configured: true,
          env: [
            "LIME_AGENT_APP_STUDIO_API_BASE",
            "LIMECORE_API_BASE_URL",
            "LIMECORE_API_BASE",
          ],
          key: "apiBase",
        }),
      ]),
    });
    const serialized = JSON.stringify(result.publishReadiness);
    expect(serialized).not.toContain("PRIVATE_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("TOKEN_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("packages.example.com");
  });

  it("可直接消费 current App Server fetchCloud 证据对象", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-fetch-"),
    );
    const packageFile = writePackageFixture(rootDir);
    const inspected = inspectContentFactoryPackageFile(packageFile);
    const productionInputs = writeProductionInputs(
      rootDir,
      inspected.packageHash,
    );

    const result = buildContentFactoryProductionPreflight({
      appServerInspect: {
        appDir: path.join(rootDir, "extracted"),
        manifestHash: MANIFEST_HASH,
        packageHash: PACKAGE_HASH,
        sourceKind: "local_folder",
      },
      contentFactoryDir: rootDir,
      fetchCloudEvidence: {
        manifestHashMatched: true,
        packageHashMatched: true,
        packageVerificationStatus: "verified",
        signatureVerificationStatus: "declared",
        sourceKind: "cloud_release",
        status: "blocked",
      },
      packageFile,
      ...productionInputs,
      fetchCloudPath: "",
    });

    expect(result.fetchCloud).toMatchObject({
      present: true,
      packageVerificationStatus: "verified",
      signatureVerificationStatus: "declared",
      status: "blocked",
    });
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_fetch_cloud_evidence_not_ready",
        }),
      ]),
    );
  });

  it("CLI --skip-app-server-inspect 写入 blocked preflight JSON", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "content-factory-production-preflight-cli-"),
    );
    writePackageFixture(rootDir);
    const outputPath = path.join(rootDir, "preflight.json");

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/plugin/content-factory-production-preflight.mjs"),
        "--content-factory-dir",
        rootDir,
        "--output",
        outputPath,
        "--skip-app-server-inspect",
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("status=blocked");
    const evidence = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(evidence.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "production_app_server_manifest_inspect_missing",
        }),
      ]),
    );
  });
});
