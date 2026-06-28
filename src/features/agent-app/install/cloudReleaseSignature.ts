import type {
  AgentAppCloudReleaseSignatureAlgorithm,
  AgentAppCloudReleaseSignatureProof,
  AgentAppCloudReleaseSignatureTrustRoot,
  CloudBootstrapApp,
} from "../types";
import type { AgentAppCloudReleaseSignatureVerificationStatus } from "./cloudReleaseEvidence";

export interface VerifyCloudReleaseSignatureParams {
  app: CloudBootstrapApp;
  trustRoots?: AgentAppCloudReleaseSignatureTrustRoot[];
  crypto?: Pick<Crypto, "subtle">;
}

type ImportKeyAlgorithm = Parameters<SubtleCrypto["importKey"]>[2];
type VerifyAlgorithm = Parameters<SubtleCrypto["verify"]>[0];
type WebCryptoBufferSource = Parameters<SubtleCrypto["verify"]>[2];

const SIGNATURE_PAYLOAD_SCHEMA = "agent-app-cloud-release-signature-payload/v2";

export function buildCloudReleaseSignaturePayload(
  app: CloudBootstrapApp,
): string {
  const proof = app.signatureProof;
  return JSON.stringify({
    schemaVersion: SIGNATURE_PAYLOAD_SCHEMA,
    appId: app.appId,
    version: app.version,
    releaseId: app.releaseId ?? null,
    tenantId: app.tenantId ?? null,
    tenantEnablementRef: app.tenantEnablementRef ?? null,
    channel: app.channel ?? null,
    packageUrl: app.packageUrl,
    packageHash: app.packageHash.toLowerCase(),
    manifestHash: app.manifestHash.toLowerCase(),
    signatureRef: app.signatureRef ?? null,
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

export async function verifyCloudReleaseSignature({
  app,
  trustRoots = [],
  crypto: cryptoApi,
}: VerifyCloudReleaseSignatureParams): Promise<AgentAppCloudReleaseSignatureVerificationStatus> {
  const proof = app.signatureProof;
  if (!proof) {
    return app.signatureRef ? "declared" : "not_configured";
  }

  const trustRoot = trustRoots.find(
    (candidate) => candidate.publicKeyId === proof.publicKeyId,
  );
  if (
    !trustRoot ||
    !isTrustRootAllowedForApp(trustRoot, app) ||
    !isTrustRootLifecycleAllowedForProof(trustRoot, proof)
  ) {
    return "failed";
  }
  if (trustRoot.algorithm !== proof.algorithm) {
    return "failed";
  }

  const subtle = cryptoApi?.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) {
    return "failed";
  }

  try {
    const payload = buildCloudReleaseSignaturePayload(app);
    if (proof.payloadHash) {
      const actualPayloadHash = await sha256Hex(payload, subtle);
      if (normalizeHash(proof.payloadHash) !== actualPayloadHash) {
        return "failed";
      }
    }

    const publicKey = await importPublicKey({
      subtle,
      algorithm: proof.algorithm,
      publicKey: trustRoot.publicKey,
    });
    const verified = await subtle.verify(
      buildVerifyAlgorithm(proof.algorithm),
      publicKey,
      bufferSourceFromBytes(decodeBase64(proof.signature)),
      bufferSourceFromBytes(new TextEncoder().encode(payload)),
    );
    return verified ? "verified" : "failed";
  } catch {
    return "failed";
  }
}

function isTrustRootAllowedForApp(
  trustRoot: AgentAppCloudReleaseSignatureTrustRoot,
  app: CloudBootstrapApp,
): boolean {
  return (
    !trustRoot.appIds ||
    trustRoot.appIds.length === 0 ||
    trustRoot.appIds.includes(app.appId)
  );
}

function isTrustRootLifecycleAllowedForProof(
  trustRoot: AgentAppCloudReleaseSignatureTrustRoot,
  proof: AgentAppCloudReleaseSignatureProof,
): boolean {
  const proofSignedAt = parseDateMillis(proof.signedAt);
  if (proof.signedAt && proofSignedAt === null) {
    return false;
  }

  if (trustRoot.revoked) {
    return false;
  }

  if (trustRoot.revokedAt) {
    return false;
  }

  const hasValidityWindow = Boolean(trustRoot.notBefore ?? trustRoot.notAfter);
  if (!hasValidityWindow) {
    return true;
  }

  if (proofSignedAt === null) {
    return false;
  }

  const notBefore = parseDateMillis(trustRoot.notBefore);
  const notAfter = parseDateMillis(trustRoot.notAfter);
  if (
    (trustRoot.notBefore && notBefore === null) ||
    (trustRoot.notAfter && notAfter === null)
  ) {
    return false;
  }

  if (notBefore !== null && notAfter !== null && notBefore > notAfter) {
    return false;
  }

  if (notBefore !== null && proofSignedAt < notBefore) {
    return false;
  }
  if (notAfter !== null && proofSignedAt > notAfter) {
    return false;
  }

  return true;
}

async function importPublicKey(params: {
  subtle: SubtleCrypto;
  algorithm: AgentAppCloudReleaseSignatureAlgorithm;
  publicKey: string;
}): Promise<CryptoKey> {
  return params.subtle.importKey(
    "spki",
    bufferSourceFromBytes(decodeBase64(stripPem(params.publicKey))),
    buildImportAlgorithm(params.algorithm),
    false,
    ["verify"],
  );
}

function buildImportAlgorithm(
  algorithm: AgentAppCloudReleaseSignatureAlgorithm,
): ImportKeyAlgorithm {
  if (algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
    return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  }
  if (algorithm === "RSA-PSS-SHA256") {
    return { name: "RSA-PSS", hash: "SHA-256" };
  }
  if (algorithm === "ECDSA-P256-SHA256") {
    return { name: "ECDSA", namedCurve: "P-256" };
  }
  return { name: "Ed25519" } as unknown as ImportKeyAlgorithm;
}

function buildVerifyAlgorithm(
  algorithm: AgentAppCloudReleaseSignatureAlgorithm,
): VerifyAlgorithm {
  if (algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
    return "RSASSA-PKCS1-v1_5";
  }
  if (algorithm === "RSA-PSS-SHA256") {
    return { name: "RSA-PSS", saltLength: 32 };
  }
  if (algorithm === "ECDSA-P256-SHA256") {
    return { name: "ECDSA", hash: "SHA-256" };
  }
  return { name: "Ed25519" } as unknown as VerifyAlgorithm;
}

async function sha256Hex(value: string, subtle: SubtleCrypto): Promise<string> {
  const digest = await subtle.digest(
    "SHA-256",
    bufferSourceFromBytes(new TextEncoder().encode(value)),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

function parseDateMillis(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function stripPem(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const bufferCtor = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from: (value: string, encoding: "base64") => Uint8Array;
      };
    }
  ).Buffer;
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(padded, "base64"));
  }
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bufferSourceFromBytes(bytes: Uint8Array): WebCryptoBufferSource {
  const bufferCtor = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from: (value: Uint8Array) => Uint8Array;
      };
    }
  ).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(bytes) as unknown as WebCryptoBufferSource;
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function encodeCloudReleaseSignatureBase64(bytes: ArrayBuffer): string {
  const chunkSize = 0x8000;
  const source = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < source.length; index += chunkSize) {
    binary += String.fromCharCode(...source.slice(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

export type { AgentAppCloudReleaseSignatureProof };
