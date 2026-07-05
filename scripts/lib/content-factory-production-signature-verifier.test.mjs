import { constants, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SIGNATURE_PROOF_SCHEMA,
  buildReleaseSignaturePayload,
  sha256Digest,
  verifyReleaseSignature,
} from "./content-factory-production-signature-verifier.mjs";

const RELEASE = {
  appId: "content-factory-app",
  channel: "stable",
  manifestHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  packageHash:
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  packageUrl:
    "https://updates.example.com/plugins/content-factory-app-2.2.2.lapp",
  releaseId: "plugin-release-test-2.2.2",
  signatureRef: "sigstore:content-factory-app@2.2.2:prod",
  tenantEnablementRef: null,
  tenantId: null,
  version: "2.2.2",
};

function buildRsaSignatureFixture(overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const proofDraft = {
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    publicKeyId: "content-factory-prod-root-2026",
    schemaVersion: SIGNATURE_PROOF_SCHEMA,
    signedAt: "2026-07-05T00:00:00.000Z",
    ...overrides.proofDraft,
  };
  const release = { ...RELEASE, ...overrides.release };
  const payload = buildReleaseSignaturePayload(release, proofDraft);
  const proof = {
    ...proofDraft,
    payloadHash: sha256Digest(payload),
    signature: sign("sha256", Buffer.from(payload), {
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
    }).toString("base64"),
    ...overrides.proof,
  };
  const trustRoot = {
    algorithm: proof.algorithm,
    publicKey: publicKey.export({ format: "pem", type: "spki" }),
    publicKeyId: proof.publicKeyId,
    ...overrides.trustRoot,
  };
  return { proof, release, trustRoot };
}

describe("content factory production signature verifier", () => {
  it("verifies a canonical RSA PKCS#1 cloud_release signature", () => {
    const fixture = buildRsaSignatureFixture();

    expect(verifyReleaseSignature(fixture)).toMatchObject({
      failureCodes: [],
      payloadHashMatched: true,
      publicKeyPresent: true,
      status: "verified",
    });
  });

  it("fails closed when the signed release payload hash drifts", () => {
    const fixture = buildRsaSignatureFixture({
      proof: {
        payloadHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      },
    });

    expect(verifyReleaseSignature(fixture)).toMatchObject({
      failureCodes: ["signature_payload_hash_mismatch"],
      payloadHashMatched: false,
      status: "failed",
    });
  });

  it("fails closed when the detached signature is tampered", () => {
    const fixture = buildRsaSignatureFixture({
      proof: {
        signature: "dGFtcGVyZWQ=",
      },
    });

    expect(verifyReleaseSignature(fixture)).toMatchObject({
      failureCodes: ["signature_cryptographic_verify_failed"],
      payloadHashMatched: true,
      status: "failed",
    });
  });

  it("does not attempt cryptographic verification without a trust root public key", () => {
    const fixture = buildRsaSignatureFixture({
      trustRoot: {
        publicKey: "",
      },
    });

    expect(verifyReleaseSignature(fixture)).toMatchObject({
      failureCodes: ["trust_root_public_key_missing"],
      payloadHash: null,
      publicKeyPresent: false,
      status: "not_attempted",
    });
  });
});
