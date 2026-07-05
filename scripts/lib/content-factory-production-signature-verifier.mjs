import crypto from "node:crypto";

export const SIGNATURE_PAYLOAD_SCHEMA =
  "plugin-cloud-release-signature-payload/v2";
export const SIGNATURE_PROOF_SCHEMA = "plugin-cloud-release-signature/v1";

export const SUPPORTED_SIGNATURE_ALGORITHMS = new Set([
  "RSASSA-PKCS1-v1_5-SHA256",
  "RSA-PSS-SHA256",
  "ECDSA-P256-SHA256",
  "Ed25519",
]);

const HASH_RE = /^sha256:[a-f0-9]{64}$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  const result = text(value);
  return result || null;
}

export function sha256Digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

export function buildReleaseSignaturePayload(release, proofDraft) {
  return JSON.stringify({
    schemaVersion: SIGNATURE_PAYLOAD_SCHEMA,
    appId: release.appId,
    version: release.version,
    releaseId: release.releaseId ?? null,
    tenantId: release.tenantId ?? null,
    tenantEnablementRef: release.tenantEnablementRef ?? null,
    channel: release.channel ?? null,
    packageUrl: release.packageUrl,
    packageHash: release.packageHash.toLowerCase(),
    manifestHash: release.manifestHash.toLowerCase(),
    signatureRef: release.signatureRef ?? null,
    signatureProof: proofDraft
      ? {
          schemaVersion: proofDraft.schemaVersion ?? null,
          publicKeyId: proofDraft.publicKeyId,
          algorithm: proofDraft.algorithm,
          signedAt: proofDraft.signedAt ?? null,
        }
      : null,
  });
}

function normalizeRelease(release = {}) {
  return {
    appId: text(release.appId),
    channel: nullableText(release.channel),
    manifestHash: text(release.manifestHash).toLowerCase(),
    packageHash: text(release.packageHash).toLowerCase(),
    packageUrl: text(release.packageUrl),
    releaseId: nullableText(release.releaseId),
    signatureRef: nullableText(release.signatureRef),
    tenantEnablementRef: nullableText(release.tenantEnablementRef),
    tenantId: nullableText(release.tenantId),
    version: text(release.version),
  };
}

function normalizeProof(proof = {}) {
  return {
    algorithm: text(proof.algorithm),
    payloadHash: text(proof.payloadHash).toLowerCase(),
    publicKeyId: text(proof.publicKeyId),
    schemaVersion: text(proof.schemaVersion),
    signature: text(proof.signature),
    signedAt: text(proof.signedAt),
  };
}

function firstText(root, keys) {
  for (const key of keys) {
    const value = text(root?.[key]);
    if (value) return value;
  }
  return "";
}

function normalizeTrustRoot(trustRoot = {}) {
  const publicKey = firstText(trustRoot, [
    "publicKey",
    "public_key",
    "publicKeyPem",
    "public_key_pem",
  ]).replace(/\\n/g, "\n");
  return {
    algorithm: text(trustRoot.algorithm ?? trustRoot.alg),
    publicKey,
    publicKeyId: firstText(trustRoot, [
      "publicKeyId",
      "public_key_id",
      "keyId",
      "key_id",
    ]),
  };
}

function verifyDetachedSignature({ algorithm, payload, publicKey, signature }) {
  const key = crypto.createPublicKey(publicKey);
  const signatureBuffer = Buffer.from(signature, "base64");
  const payloadBuffer = Buffer.from(payload);
  if (algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
    return crypto.verify(
      "sha256",
      payloadBuffer,
      { key, padding: crypto.constants.RSA_PKCS1_PADDING },
      signatureBuffer,
    );
  }
  if (algorithm === "RSA-PSS-SHA256") {
    return crypto.verify(
      "sha256",
      payloadBuffer,
      {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      },
      signatureBuffer,
    );
  }
  if (algorithm === "ECDSA-P256-SHA256") {
    return crypto.verify("sha256", payloadBuffer, key, signatureBuffer);
  }
  if (algorithm === "Ed25519") {
    return crypto.verify(null, payloadBuffer, key, signatureBuffer);
  }
  return false;
}

function missingReleaseFieldCodes(release) {
  const missing = [];
  for (const [field, value] of [
    ["appId", release.appId],
    ["version", release.version],
    ["packageUrl", release.packageUrl],
    ["packageHash", release.packageHash],
    ["manifestHash", release.manifestHash],
    ["signatureRef", release.signatureRef],
  ]) {
    if (!value) missing.push(`release_${field}_missing`);
  }
  if (release.packageHash && !HASH_RE.test(release.packageHash)) {
    missing.push("release_package_hash_invalid");
  }
  if (release.manifestHash && !HASH_RE.test(release.manifestHash)) {
    missing.push("release_manifest_hash_invalid");
  }
  return missing;
}

function missingProofFieldCodes(proof) {
  const missing = [];
  for (const [field, value] of [
    ["schema_version", proof.schemaVersion],
    ["public_key_id", proof.publicKeyId],
    ["algorithm", proof.algorithm],
    ["signature", proof.signature],
    ["payload_hash", proof.payloadHash],
    ["signed_at", proof.signedAt],
  ]) {
    if (!value) missing.push(`proof_${field}_missing`);
  }
  if (proof.schemaVersion && proof.schemaVersion !== SIGNATURE_PROOF_SCHEMA) {
    missing.push("proof_schema_version_unsupported");
  }
  if (proof.algorithm && !SUPPORTED_SIGNATURE_ALGORITHMS.has(proof.algorithm)) {
    missing.push("proof_algorithm_unsupported");
  }
  if (proof.payloadHash && !HASH_RE.test(proof.payloadHash)) {
    missing.push("proof_payload_hash_invalid");
  }
  return missing;
}

function missingTrustRootFieldCodes(trustRoot) {
  const missing = [];
  if (!trustRoot.publicKeyId) missing.push("trust_root_public_key_id_missing");
  if (!trustRoot.algorithm) missing.push("trust_root_algorithm_missing");
  if (!trustRoot.publicKey) missing.push("trust_root_public_key_missing");
  if (
    trustRoot.algorithm &&
    !SUPPORTED_SIGNATURE_ALGORITHMS.has(trustRoot.algorithm)
  ) {
    missing.push("trust_root_algorithm_unsupported");
  }
  return missing;
}

export function verifyReleaseSignature(input = {}) {
  const release = normalizeRelease(input.release);
  const proof = normalizeProof(input.proof);
  const trustRoot = normalizeTrustRoot(input.trustRoot);
  const failureCodes = [
    ...missingReleaseFieldCodes(release),
    ...missingProofFieldCodes(proof),
    ...missingTrustRootFieldCodes(trustRoot),
  ];

  if (
    proof.publicKeyId &&
    trustRoot.publicKeyId &&
    proof.publicKeyId !== trustRoot.publicKeyId
  ) {
    failureCodes.push("signature_trust_root_public_key_id_mismatch");
  }
  if (
    proof.algorithm &&
    trustRoot.algorithm &&
    proof.algorithm !== trustRoot.algorithm
  ) {
    failureCodes.push("signature_trust_root_algorithm_mismatch");
  }

  const base = {
    failureCodes: [...new Set(failureCodes)],
    payloadHash: null,
    payloadHashMatched: false,
    publicKeyPresent: Boolean(trustRoot.publicKey),
    status: "not_attempted",
  };

  if (base.failureCodes.length > 0) {
    return base;
  }

  const payload = buildReleaseSignaturePayload(release, {
    algorithm: proof.algorithm,
    publicKeyId: proof.publicKeyId,
    schemaVersion: proof.schemaVersion,
    signedAt: proof.signedAt,
  });
  const payloadHash = sha256Digest(payload);
  if (payloadHash !== proof.payloadHash) {
    return {
      ...base,
      failureCodes: ["signature_payload_hash_mismatch"],
      payloadHash,
      payloadHashMatched: false,
      status: "failed",
    };
  }

  try {
    const verified = verifyDetachedSignature({
      algorithm: proof.algorithm,
      payload,
      publicKey: trustRoot.publicKey,
      signature: proof.signature,
    });
    return {
      ...base,
      failureCodes: verified ? [] : ["signature_cryptographic_verify_failed"],
      payloadHash,
      payloadHashMatched: true,
      status: verified ? "verified" : "failed",
    };
  } catch {
    return {
      ...base,
      failureCodes: ["signature_cryptographic_verify_failed"],
      payloadHash,
      payloadHashMatched: true,
      status: "failed",
    };
  }
}
