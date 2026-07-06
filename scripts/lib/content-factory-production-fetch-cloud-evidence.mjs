import { Buffer } from "node:buffer";
import crypto from "node:crypto";

const APP_ID = "content-factory-app";
const SIGNATURE_PAYLOAD_SCHEMA = "plugin-cloud-release-signature-payload/v2";

function normalizeHash(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function stringField(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function contentFactoryCatalogRecord(catalog) {
  if (!catalog || typeof catalog !== "object") return null;
  const apps = Array.isArray(catalog.apps) ? catalog.apps : [];
  return (
    apps.find((item) => item?.appId === APP_ID) ??
    apps.find((item) => item?.id === APP_ID) ??
    catalog[APP_ID] ??
    null
  );
}

export function descriptorFromCatalog(catalog) {
  const record = contentFactoryCatalogRecord(catalog);
  if (!record) {
    throw new Error("production catalog 缺少 content-factory-app 记录");
  }
  const identity = record.identity ?? record;
  const packageUrl =
    stringField(identity, [
      "packageUrl",
      "package_url",
      "sourceUri",
      "source_uri",
    ]) ||
    stringField(record, [
      "packageUrl",
      "package_url",
      "sourceUri",
      "source_uri",
    ]);
  return {
    appId: stringField(record, ["appId", "app_id", "id"]) || APP_ID,
    version:
      stringField(record, ["appVersion", "app_version", "version"]) ||
      stringField(identity, ["appVersion", "app_version", "version"]),
    releaseId:
      stringField(record, ["releaseId", "release_id"]) ||
      stringField(identity, ["releaseId", "release_id"]) ||
      undefined,
    tenantId:
      stringField(record, ["tenantId", "tenant_id"]) ||
      stringField(identity, ["tenantId", "tenant_id"]) ||
      undefined,
    tenantEnablementRef:
      stringField(record, ["tenantEnablementRef", "tenant_enablement_ref"]) ||
      stringField(identity, ["tenantEnablementRef", "tenant_enablement_ref"]) ||
      undefined,
    channel:
      stringField(record, ["channel", "releaseChannel", "release_channel"]) ||
      stringField(identity, ["channel"]) ||
      undefined,
    sourceUri: packageUrl,
    packageUrl,
    packageHash: normalizeHash(
      stringField(identity, ["packageHash", "package_hash"]) ||
        stringField(record, ["packageHash", "package_hash"]),
    ),
    manifestHash: normalizeHash(
      stringField(identity, ["manifestHash", "manifest_hash"]) ||
        stringField(record, ["manifestHash", "manifest_hash"]),
    ),
    signatureRef:
      stringField(identity, ["signatureRef", "signature_ref"]) ||
      stringField(record, ["signatureRef", "signature_ref"]) ||
      undefined,
    loadedAt: new Date().toISOString(),
  };
}

function signatureProofFromCatalog(catalog) {
  const record = contentFactoryCatalogRecord(catalog);
  if (!record) return null;
  return (
    record.signatureProof ||
    record.signature_proof ||
    record.identity?.signatureProof ||
    record.identity?.signature_proof ||
    null
  );
}

function trustRootsFromBootstrap(bootstrap) {
  if (!bootstrap || typeof bootstrap !== "object") return [];
  return (
    bootstrap.pluginSignatureTrustRoots ||
    bootstrap.plugins?.signatureTrustRoots ||
    bootstrap.plugins?.signature_trust_roots ||
    bootstrap.signatureTrustRoots ||
    bootstrap.signature_trust_roots ||
    []
  );
}

function buildSignaturePayload(descriptor, proof) {
  return JSON.stringify({
    schemaVersion: SIGNATURE_PAYLOAD_SCHEMA,
    appId: descriptor.appId,
    version: descriptor.version,
    releaseId: descriptor.releaseId ?? null,
    tenantId: descriptor.tenantId ?? null,
    tenantEnablementRef: descriptor.tenantEnablementRef ?? null,
    channel: descriptor.channel ?? null,
    packageUrl: descriptor.packageUrl,
    packageHash: normalizeHash(descriptor.packageHash),
    manifestHash: normalizeHash(descriptor.manifestHash),
    signatureRef: descriptor.signatureRef ?? null,
    signatureProof: proof
      ? {
          schemaVersion: proof.schemaVersion ?? null,
          publicKeyId: proof.publicKeyId,
          algorithm: proof.algorithm,
          signedAt: proof.signedAt ?? null,
        }
      : null,
  });
}

function sha256Digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function normalizePublicKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes("-----BEGIN")) return text;
  const chunks = text.replace(/\s+/g, "").match(/.{1,64}/g) || [];
  return [
    "-----BEGIN PUBLIC KEY-----",
    ...chunks,
    "-----END PUBLIC KEY-----",
    "",
  ].join("\n");
}

function trustRootMatchesProof(root, proof, appId) {
  if (!root || !proof || root.publicKeyId !== proof.publicKeyId) return false;
  if (root.revoked === true || root.revokedAt) return false;
  if (root.algorithm && root.algorithm !== proof.algorithm) return false;
  if (Array.isArray(root.appIds) && root.appIds.length > 0) {
    if (!root.appIds.includes(appId)) return false;
  }
  const signedAt = Date.parse(proof.signedAt || "");
  if ((root.notBefore || root.notAfter) && !Number.isFinite(signedAt)) {
    return false;
  }
  if (root.notBefore && signedAt < Date.parse(root.notBefore)) return false;
  if (root.notAfter && signedAt > Date.parse(root.notAfter)) return false;
  return true;
}

export function verifyCatalogSignature({ bootstrap, catalog, descriptor }) {
  const proof = signatureProofFromCatalog(catalog);
  if (!proof) return "not_configured";
  const trustRoot = trustRootsFromBootstrap(bootstrap).find((root) =>
    trustRootMatchesProof(root, proof, descriptor.appId),
  );
  if (!trustRoot?.publicKey && !trustRoot?.publicKeyPem) return "declared";
  const payload = buildSignaturePayload(descriptor, proof);
  if (
    proof.payloadHash &&
    normalizeHash(proof.payloadHash) !== sha256Digest(payload)
  ) {
    return "failed";
  }
  const publicKey = normalizePublicKey(
    trustRoot.publicKey || trustRoot.publicKeyPem,
  );
  const signature = Buffer.from(String(proof.signature || ""), "base64");
  try {
    if (proof.algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
      return crypto.verify(
        "sha256",
        Buffer.from(payload),
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        signature,
      )
        ? "verified"
        : "failed";
    }
    if (proof.algorithm === "RSA-PSS-SHA256") {
      return crypto.verify(
        "sha256",
        Buffer.from(payload),
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        signature,
      )
        ? "verified"
        : "failed";
    }
    if (proof.algorithm === "ECDSA-P256-SHA256") {
      return crypto.verify("sha256", Buffer.from(payload), publicKey, signature)
        ? "verified"
        : "failed";
    }
    if (proof.algorithm === "Ed25519") {
      return crypto.verify(null, Buffer.from(payload), publicKey, signature)
        ? "verified"
        : "failed";
    }
    return "failed";
  } catch {
    return "failed";
  }
}

export function buildFetchCloudEvidence({
  bootstrap,
  catalog,
  descriptor,
  result,
  error,
}) {
  const signatureProof = signatureProofFromCatalog(catalog);
  const packageHashMatched =
    Boolean(result?.packageHash) &&
    normalizeHash(result.packageHash) === normalizeHash(descriptor.packageHash);
  const manifestHashMatched =
    Boolean(result?.manifestHash) &&
    normalizeHash(result.manifestHash) ===
      normalizeHash(descriptor.manifestHash);
  const packageVerificationStatus =
    result && packageHashMatched && manifestHashMatched
      ? "verified"
      : error
        ? "failed"
        : "missing";
  const signatureVerificationStatus = verifyCatalogSignature({
    bootstrap,
    catalog,
    descriptor,
  });
  const signaturePolicy =
    signatureVerificationStatus === "verified" ? "required" : "not_configured";
  const ready =
    packageVerificationStatus === "verified" &&
    signaturePolicy === "required" &&
    signatureVerificationStatus === "verified";
  return {
    schemaVersion: "content-factory-fetch-cloud-evidence.v1",
    appId: descriptor.appId,
    generatedAt: new Date().toISOString(),
    sourceKind: "cloud_release",
    status: ready ? "ready" : "blocked",
    packageHashMatched,
    manifestHashMatched,
    packageVerificationStatus,
    signaturePolicy,
    signatureRef: descriptor.signatureRef ?? null,
    signatureProof: signatureProof
      ? {
          algorithm: signatureProof.algorithm ?? null,
          payloadHash: signatureProof.payloadHash ?? null,
          publicKeyId: signatureProof.publicKeyId ?? null,
          signature: signatureProof.signature ?? null,
          signedAt: signatureProof.signedAt ?? null,
        }
      : null,
    signatureVerificationStatus,
    descriptor,
    cacheEntry: result
      ? {
          appId: result.appId || null,
          cachePath: result.cachePath || null,
          cachedAt: result.cachedAt || null,
          manifestHash: result.manifestHash || null,
          packageHash: result.packageHash || null,
          sourceKind: result.identity?.sourceKind || null,
        }
      : null,
    error: error ? String(error.message || error) : null,
  };
}
