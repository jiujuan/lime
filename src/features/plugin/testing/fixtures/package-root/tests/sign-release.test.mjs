import assert from "node:assert/strict";
import { generateKeyPairSync, verify, constants } from "node:crypto";
import { test } from "node:test";

import {
  SIGNATURE_PROOF_SCHEMA,
  buildAppSignatureYaml,
  buildReleaseSignature,
  buildReleaseSignaturePayload,
  sha256Digest
} from "../scripts/sign-release.mjs";

function buildPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  return privateKey;
}

const release = {
  appId: "content-factory-app",
  version: "2.2.2",
  releaseId: "plugin-release-test",
  tenantId: "tenant-0001",
  tenantEnablementRef: "tenant-plugin-test",
  channel: "stable",
  packageUrl: "https://updates.limeai.run/plugins/content-factory-app.lapp",
  packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  manifestHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  signatureRef: "sigstore:content-factory-app@2.2.2"
};

test("sign-release builds a host-verifiable canonical proof", () => {
  const signature = buildReleaseSignature({
    release,
    privateKeyPem: buildPrivateKeyPem(),
    publicKeyId: "plugin-root-2026",
    signedAt: "2026-07-03T00:00:00.000Z"
  });

  const expectedPayload = buildReleaseSignaturePayload(release, {
    schemaVersion: SIGNATURE_PROOF_SCHEMA,
    publicKeyId: "plugin-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: "2026-07-03T00:00:00.000Z"
  });
  assert.equal(signature.payload, expectedPayload);
  assert.equal(signature.proof.payloadHash, sha256Digest(expectedPayload));
  assert.equal(signature.trustRoot.publicKeyId, "plugin-root-2026");
  assert.deepEqual(signature.trustRoot.appIds, ["content-factory-app"]);
  assert.equal(
    verify(
      "sha256",
      Buffer.from(expectedPayload),
      {
        key: signature.trustRoot.publicKey,
        padding: constants.RSA_PKCS1_PADDING
      },
      Buffer.from(signature.proof.signature, "base64")
    ),
    true
  );
});

test("sign-release writes app.signature.yaml fields LimeCore can infer", () => {
  const signature = buildReleaseSignature({
    release,
    privateKeyPem: buildPrivateKeyPem(),
    publicKeyId: "plugin-root-2026",
    signedAt: "2026-07-03T00:00:00.000Z"
  });
  const yaml = buildAppSignatureYaml(signature);

  assert.match(yaml, /^signature:\n  package:\n/);
  assert.match(yaml, /signatureRef: "sigstore:content-factory-app@2\.2\.2"/);
  assert.match(yaml, /publicKeyId: "plugin-root-2026"/);
  assert.match(yaml, /algorithm: "RSASSA-PKCS1-v1_5-SHA256"/);
  assert.match(yaml, /payloadHash: "sha256:[a-f0-9]{64}"/);
});
