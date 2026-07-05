import { Buffer } from "node:buffer";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildFetchCloudEvidence,
  verifyCatalogSignature,
} from "../lib/content-factory-production-fetch-cloud-evidence.mjs";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function buildSignedInputs() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const descriptor = {
    appId: "content-factory-app",
    version: "2.2.2",
    releaseId: "plugin-release-test",
    tenantId: undefined,
    tenantEnablementRef: undefined,
    channel: "stable",
    sourceUri:
      "https://updates.example.com/plugins/content-factory-app-2.2.2.lapp",
    packageUrl:
      "https://updates.example.com/plugins/content-factory-app-2.2.2.lapp",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    signatureRef: "sigstore:content-factory-app@2.2.2:prod",
    loadedAt: "2026-07-05T00:00:00.000Z",
  };
  const proofDraft = {
    schemaVersion: "plugin-cloud-release-signature/v1",
    publicKeyId: "content-factory-prod-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: "2026-07-05T00:00:00.000Z",
  };
  const payload = JSON.stringify({
    schemaVersion: "plugin-cloud-release-signature-payload/v2",
    appId: descriptor.appId,
    version: descriptor.version,
    releaseId: descriptor.releaseId,
    tenantId: null,
    tenantEnablementRef: null,
    channel: descriptor.channel,
    packageUrl: descriptor.packageUrl,
    packageHash: descriptor.packageHash,
    manifestHash: descriptor.manifestHash,
    signatureRef: descriptor.signatureRef,
    signatureProof: {
      schemaVersion: proofDraft.schemaVersion,
      publicKeyId: proofDraft.publicKeyId,
      algorithm: proofDraft.algorithm,
      signedAt: proofDraft.signedAt,
    },
  });
  const proof = {
    ...proofDraft,
    signature: sign("sha256", Buffer.from(payload), privateKey).toString(
      "base64",
    ),
  };
  const catalog = {
    apps: [
      {
        appId: descriptor.appId,
        appVersion: descriptor.version,
        channel: descriptor.channel,
        releaseId: descriptor.releaseId,
        identity: {
          manifestHash: descriptor.manifestHash,
          packageHash: descriptor.packageHash,
          signatureRef: descriptor.signatureRef,
          sourceKind: "cloud_release",
          sourceUri: descriptor.packageUrl,
        },
        signatureProof: proof,
      },
    ],
  };
  const publicKeyBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const bootstrap = {
    pluginSignatureTrustRoots: [
      {
        algorithm: proof.algorithm,
        appIds: [descriptor.appId],
        publicKey: publicKeyBase64,
        publicKeyId: proof.publicKeyId,
      },
    ],
  };
  return { bootstrap, catalog, descriptor };
}

describe("content factory production preflight CLI helpers", () => {
  it("fetchCloud evidence 接受 base64 SPKI trust root 签名校验", () => {
    const { bootstrap, catalog, descriptor } = buildSignedInputs();

    expect(verifyCatalogSignature({ bootstrap, catalog, descriptor })).toBe(
      "verified",
    );
    expect(
      buildFetchCloudEvidence({
        bootstrap,
        catalog,
        descriptor,
        result: {
          appId: descriptor.appId,
          identity: { sourceKind: "cloud_release" },
          manifestHash: descriptor.manifestHash,
          packageHash: descriptor.packageHash,
        },
      }),
    ).toMatchObject({
      manifestHashMatched: true,
      packageHashMatched: true,
      signatureVerificationStatus: "verified",
      status: "ready",
    });
  });
});
